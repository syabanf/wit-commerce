package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Logs that only grow: stock movements and connector calls. The console's state carries the newest
// rows of each brand, and the movement and log screens read older ones a page at a time.

const (
	// historyInState is how many rows of each log a brand's state carries.
	historyInState = 200
	historyPageMax = 500
	// trafficDays is how far back the state's traffic goes: the longest analytics window, 90 days,
	// and the window before it that the comparisons read.
	trafficDays = 180
)

// historyCollections are the logs GET /views/{path} pages through, with the scope that reads each.
var historyCollections = map[string]struct{ collection, scope string }{
	"stock-moves":          {"stockMoves", "inventory:read"},
	"modifier-stock-moves": {"modifierStockMoves", "inventory:read"},
	// Connector calls stay with people: no API key scope reads them.
	"integration-logs": {"integrationLogs", ""},
}

// newestRows reads the newest rows of a log for each tenant, newest first, at most limit per tenant.
// With before set (an ISO time, as the rows store it) it reads the rows after that one in the same
// order: older, or as old with a lower id, so rows that share a minute are neither lost nor repeated.
// Ids compare byte by byte, as the console compares them.
func newestRows(ctx context.Context, q store.Querier, collection string, tenantIDs []string, before, beforeID string, limit int) ([]json.RawMessage, error) {
	table := store.Tables[collection]
	older := ""
	args := []any{tenantIDs}
	if before != "" {
		args = append(args, before, beforeID)
		older = ` and (at < $2 or (at = $2 and id collate "C" < $3))`
	}
	rows, err := q.Query(ctx, fmt.Sprintf(`select x.data from unnest($1::text[]) t(id) cross join lateral (
		select data, at, id from %s where tenant_id = t.id%s order by at desc, id collate "C" desc limit %d) x
		order by x.at desc, x.id collate "C" desc`, table, older, limit), args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[json.RawMessage])
}

// trafficCutoff is the first WIB day of traffic the state carries.
func trafficCutoff(now time.Time) string {
	return now.In(time.FixedZone("WIB", 7*3600)).AddDate(0, 0, -trafficDays).Format("2006-01-02")
}

type historyResponse struct {
	// Rows are the log's rows as the state carries them.
	Rows []any `json:"rows"`
	// More is true when older rows remain past this page.
	More bool `json:"more"`
}

// history pages one brand's log newest first: ?before= and ?beforeId= take the at and id of the
// oldest row the caller holds, ?limit= the page size.
func (s *Server) history(collection string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := readTenant(r)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		q := r.URL.Query()
		limit := historyInState
		if v := q.Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > historyPageMax {
				writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "limit takes a number from 1 to 500.")
				return
			}
			limit = n
		}
		before := ""
		if v := q.Get("before"); v != "" {
			at, err := time.Parse(time.RFC3339, v)
			if err != nil {
				writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "before takes an RFC 3339 timestamp.")
				return
			}
			// at is stored as ISO text in WIB, so the bound takes the same form to compare in order.
			before = clock.Iso(at)
		}
		rows, err := newestRows(r.Context(), s.DB.Pool, collection, []string{tenantID}, before, q.Get("beforeId"), limit+1)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		out := historyResponse{Rows: []any{}, More: len(rows) > limit}
		for _, row := range rows[:min(len(rows), limit)] {
			out.Rows = append(out.Rows, row)
		}
		writeJSON(w, http.StatusOK, out)
	}
}
