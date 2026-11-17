package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
)

// The console's state carries open returns only; this view pages through every return. Returns are
// few next to orders and the document carries what a list shows, so the view reads the table the
// commands write, through its generated columns and indexes, with no projection of its own.

const (
	returnRowsPage    = 20
	returnRowsPageMax = 200
)

type returnRowsResponse struct {
	Rows  []domain.OrderReturn `json:"rows"`
	Total int                  `json:"total"`
	// StatusCounts are per status with every filter but the status applied.
	StatusCounts map[string]int `json:"statusCounts"`
	// RefundedAmount sums the refunds of the brand's returns, whatever the filters.
	RefundedAmount int64 `json:"refundedAmount"`
}

func (s *Server) returnRows(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	q := r.URL.Query()
	p, _ := auth.From(r.Context())
	sellers, err := s.ownSellers(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	base, args := []string{"tenant_id = $1"}, []any{tenantID}
	add := func(clauses *[]string, clause string, arg any) {
		args = append(args, arg)
		*clauses = append(*clauses, fmt.Sprintf(clause, len(args)))
	}
	if sellers != nil {
		add(&base, ownCustomers, sellers)
	}
	for _, f := range []struct{ param, column string }{{"orderId", "order_id"}, {"customerId", "customer_id"}} {
		if v := q.Get(f.param); v != "" {
			add(&base, f.column+" = $%d", v)
		}
	}
	if v := strings.ToLower(strings.TrimSpace(q.Get("q"))); v != "" {
		add(&base, `(lower(code) like $%[1]d or order_id in (select id from orders where tenant_id = $1 and lower(code) like $%[1]d))`,
			"%"+likeEscape(v)+"%")
	}
	// The status chips count with every filter but the status, so they keep the arguments so far.
	baseArgs := slices.Clone(args)
	filtered := slices.Clone(base)
	if v := q.Get("status"); v == "open" {
		filtered = append(filtered, "status in ('requested', 'approved', 'received')")
	} else if v != "" {
		add(&filtered, "status = $%d", v)
	}
	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("pageSize"))
	if size <= 0 || size > returnRowsPageMax {
		size = returnRowsPage
	}
	ctx := r.Context()
	out := returnRowsResponse{Rows: []domain.OrderReturn{}, StatusCounts: map[string]int{}}
	where := strings.Join(filtered, " and ")
	if err := s.DB.Pool.QueryRow(ctx, `select count(*) from returns where `+where, args...).Scan(&out.Total); err != nil {
		s.writeError(w, r, err)
		return
	}
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select data from returns where %s order by created_at desc, id collate "C" limit %d offset %d`,
		where, size, max(page, 0)*size), args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	raw, err := pgx.CollectRows(rows, pgx.RowTo[[]byte])
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	for _, b := range raw {
		var ret domain.OrderReturn
		if err := json.Unmarshal(b, &ret); err != nil {
			s.writeError(w, r, err)
			return
		}
		out.Rows = append(out.Rows, ret)
	}
	counts, err := s.DB.Pool.Query(ctx, `select status, count(*) from returns where `+strings.Join(base, " and ")+` group by 1`, baseArgs...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	for counts.Next() {
		var status string
		var n int
		if err := counts.Scan(&status, &n); err != nil {
			counts.Close()
			s.writeError(w, r, err)
			return
		}
		out.StatusCounts[status] = n
	}
	counts.Close()
	if err := s.DB.Pool.QueryRow(ctx, `select coalesce(sum((data->>'refundAmount')::bigint), 0) from returns where tenant_id = $1`,
		tenantID).Scan(&out.RefundedAmount); err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type salesMonthsResponse struct {
	SalesMonths   []readmodel.SalesMonth   `json:"salesMonths"`
	ProductMonths []readmodel.ProductMonth `json:"productMonths"`
	// Cutoff is the first day the daily facts in the state keep; these months end before it.
	Cutoff string `json:"cutoff"`
}

// salesMonths serves the rolled-up months between ?from and ?to (YYYY-MM), for long-range totals the
// state's daily window does not reach. A sales user reads their own sellers' months only.
func (s *Server) salesMonths(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if from == "" {
		from = "0000-00"
	}
	if to == "" {
		to = "9999-99"
	}
	p, _ := auth.From(r.Context())
	sellers, err := s.ownSellers(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := salesMonthsResponse{Cutoff: readmodel.SalesCutoff(s.Clock.Now())}
	out.SalesMonths, out.ProductMonths, err = readmodel.MonthRows(r.Context(), s.DB.Pool, tenantID, from, to, sellers)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
