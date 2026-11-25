package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// privateFields are the fields of a collection that only staff read. Every public answer, the store
// dataset, search and the store's event stream, goes through publicRow, so a shopper never receives
// what the brand pays for a product.
var privateFields = map[string][]string{
	"products":   {"cost"},
	"promotions": {"revenue"},
}

// hiddenRows decides which rows of a collection stay out of public answers whole. A brand's code
// promotion is a secret until the shopper types its code (GET /shop/{store}/vouchers/{code}); a
// seller's own promotion shows on their page, and an automatic one applies by itself.
var hiddenRows = map[string]func(row map[string]json.RawMessage) bool{
	"promotions": func(row map[string]json.RawMessage) bool {
		var trigger, seller string
		_ = json.Unmarshal(row["trigger"], &trigger)
		_ = json.Unmarshal(row["sellerId"], &seller)
		return trigger == "code" && seller == ""
	},
}

// publicRow drops the private fields of one row, or the whole row when hiddenRows says so. A row it
// cannot parse is dropped whole rather than sent with its private fields.
func publicRow(collection string, raw json.RawMessage) json.RawMessage {
	fields := privateFields[collection]
	if len(fields) == 0 && hiddenRows[collection] == nil {
		return raw
	}
	var row map[string]json.RawMessage
	if json.Unmarshal(raw, &row) != nil {
		return nil
	}
	if hidden := hiddenRows[collection]; hidden != nil && hidden(row) {
		return nil
	}
	for _, f := range fields {
		delete(row, f)
	}
	out, err := json.Marshal(row)
	if err != nil {
		return nil
	}
	return out
}

// publicState applies publicRow to every row of a loaded dataset.
func publicState(state map[string][]json.RawMessage) {
	for collection := range privateFields {
		rows := state[collection][:0]
		for _, raw := range state[collection] {
			if row := publicRow(collection, raw); row != nil {
				rows = append(rows, row)
			}
		}
		if state[collection] != nil {
			state[collection] = rows
		}
	}
}

// publicSearchResult is a search page with each product passed through publicRow. Its Products field
// shadows the embedded one in the JSON.
type publicSearchResult struct {
	service.SearchResult
	Products []json.RawMessage `json:"products"`
}

func publicSearch(res service.SearchResult) (publicSearchResult, error) {
	out := publicSearchResult{SearchResult: res, Products: make([]json.RawMessage, 0, len(res.Products))}
	for _, p := range res.Products {
		raw, err := json.Marshal(p)
		if err != nil {
			return out, err
		}
		if row := publicRow("products", raw); row != nil {
			out.Products = append(out.Products, row)
		}
	}
	return out, nil
}

// voucherChecksPerClient bounds how fast one client can guess codes.
const voucherChecksPerClient = 20

// shopVoucher is GET /shop/{store}/vouchers/{code}: the brand promotion a typed code opens, without
// its private fields, so the cart can price it. Unknown, ended and unpublished codes answer 404 alike.
func (s *Server) shopVoucher(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.voucherClients.allow(tenant.ID+" "+s.clientIP(r), w) {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(r.PathValue("code")))
	rows, err := store.Raw(r.Context(), s.DB.Pool, "promotions",
		`tenant_id = $1 and upper(data->>'code') = $2 and data->>'trigger' = 'code' and status in ('scheduled', 'active')`, tenant.ID, code)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if len(rows) == 0 || code == "" {
		writeProblem(w, http.StatusNotFound, "VOUCHER_NOT_FOUND", "This code is not valid in this store.")
		return
	}
	var row map[string]json.RawMessage
	if err := json.Unmarshal(rows[0], &row); err != nil {
		s.writeError(w, r, err)
		return
	}
	delete(row, "revenue")
	writeJSON(w, http.StatusOK, row)
}
