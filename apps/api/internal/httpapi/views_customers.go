package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// The query side of customers. A brand can hold tens of thousands, so the console's state carries
// none (a sales user's own aside): lists, pickers and records read them here, and the figures that
// sum every customer come from GET /views/customer-summary.

const (
	customerRowsPage    = 12
	customerRowsPageMax = 500
	// summaryTop is how many customers the loyalty page ranks by points.
	summaryTop = 8
)

// stageOrder and tierOrder are LIFECYCLE_STAGE_LABEL and LOYALTY_TIER_FLOW in packages/types, the
// order the console sorts the columns in.
const (
	stageOrder = `array['visitor', 'lead', 'registered', 'first_buyer', 'repeat_buyer', 'loyal', 'vip', 'at_risk', 'dormant']`
	tierOrder  = `array['member', 'silver', 'gold', 'platinum']`
)

// customerSorts are the CustomersPage columns a list may sort on; anything else sorts by spend.
var customerSorts = map[string]string{
	"customer": "c.data->>'name'",
	"stage":    "array_position(" + stageOrder + ", c.data->>'stage')",
	"tier":     "array_position(" + tierOrder + ", c.data->>'tier')",
	"orders":   "coalesce(m.orders, 0)",
	"spend":    "coalesce(m.spend, 0)",
	"last":     "m.last_at",
	"seller":   "(select data->>'name' from sellers where id = c.seller_id)",
	"city":     "c.data->>'city'",
	"joined":   "(c.data->>'createdAt')::timestamptz",
}

// customerRow is a customer with their metrics row, null when they never bought or left a checkout.
type customerRow struct {
	Customer domain.Customer `json:"customer"`
	// Metrics is the customerMetrics row as the state carries it, or null.
	Metrics any `json:"metrics"`
}

type customerRowsResponse struct {
	Rows []customerRow `json:"rows"`
	// Total counts the customers that match every filter, across pages.
	Total int `json:"total"`
	// StageCounts count per stage under the view, the rules and the ids, as the page's chips do.
	StageCounts map[string]int `json:"stageCounts"`
	// TierCounts count per tier under every filter but the tier.
	TierCounts map[string]int `json:"tierCounts"`
}

// customerScope is the brand a customer view reads and, for a sales user, their seller profiles.
func (s *Server) customerScope(r *http.Request) (string, []string, error) {
	tenantID, err := readTenant(r)
	if err != nil {
		return "", nil, err
	}
	p, _ := auth.From(r.Context())
	sellers, err := s.ownSellers(r.Context(), p)
	return tenantID, sellers, err
}

// sqlArgs numbers query parameters as clauses take them.
type sqlArgs []any

func (a *sqlArgs) add(v any) string {
	*a = append(*a, v)
	return "$" + strconv.Itoa(len(*a))
}

// customerFilter is one condition of a customer list and the query parameter it comes from.
type customerFilter struct {
	param  string
	clause func(a *sqlArgs) string
}

// customerRows serves customer lists, pickers, records and segment previews: one brand, any mix of
// the filters below, sorted and paged. A sales user sees every customer, as the console always
// showed them, but metrics only for the customers assigned to them.
func (s *Server) customerRows(w http.ResponseWriter, r *http.Request) {
	tenantID, sellers, err := s.customerScope(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	q := r.URL.Query()
	now := s.Clock.Now()
	var filters []customerFilter
	equals := func(param, column string, value any) {
		filters = append(filters, customerFilter{param, func(a *sqlArgs) string { return column + " = " + a.add(value) }})
	}
	switch view := cmpOr(q.Get("view"), "all"); view {
	case "all":
	case "new":
		filters = append(filters, customerFilter{"view", func(a *sqlArgs) string {
			return "(c.data->>'createdAt')::timestamptz >= " + a.add(now.Add(-30*24*time.Hour))
		}})
	case "repeat":
		filters = append(filters, customerFilter{"view", func(*sqlArgs) string { return "coalesce(m.orders, 0) >= 2" }})
	case "at-risk":
		filters = append(filters, customerFilter{"view", func(*sqlArgs) string { return "c.data->>'stage' in ('at_risk', 'dormant')" }})
	default:
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Unknown view.")
		return
	}
	for _, f := range []struct{ param, column string }{{"stage", "c.data->>'stage'"}, {"tier", "c.data->>'tier'"}, {"sellerId", "c.seller_id"}} {
		if v := q.Get(f.param); v != "" {
			equals(f.param, f.column, v)
		}
	}
	if v := q.Get("ids"); v != "" {
		ids := strings.Split(v, ",")
		if len(ids) > customerRowsPageMax {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Ask for 500 ids or fewer.")
			return
		}
		filters = append(filters, customerFilter{"ids", func(a *sqlArgs) string { return "c.id = any(" + a.add(ids) + ")" }})
	}
	if v := strings.TrimSpace(q.Get("email")); v != "" {
		equals("email", "c.email", strings.ToLower(v))
	}
	if v := q.Get("phone"); v != "" {
		digits := strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, v)
		if digits == "" {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "phone takes digits.")
			return
		}
		equals("phone", `regexp_replace(c.data->>'phone', '\D', '', 'g')`, digits)
	}
	for _, word := range strings.Fields(strings.ToLower(q.Get("q"))) {
		like := "%" + likeEscape(word) + "%"
		filters = append(filters, customerFilter{"q", func(a *sqlArgs) string {
			return `lower(concat_ws(' ', c.data->>'name', c.data->>'code', c.data->>'email', c.data->>'phone', c.data->>'city')) like ` + a.add(like)
		}})
	}
	if v := q.Get("rules"); v != "" {
		seg := domain.Segment{Match: cmpOr(q.Get("match"), "all")}
		if err := json.Unmarshal([]byte(v), &seg.Rules); err != nil {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "rules takes a JSON list of segment rules.")
			return
		}
		filters = append(filters, customerFilter{"rules", func(a *sqlArgs) string {
			// Rules on recency read the clock; the reference after the clause keeps Postgres from
			// refusing a parameter that rules on tier or city never name.
			nowRef := a.add(now.UnixMilli())
			clause := "(" + rules.SegmentSQL(seg, len(*a), (*[]any)(a)) + " and " + nowRef + "::bigint is not null)"
			if sellers != nil {
				// A sales user's segments hold their own customers, as the segment counts do.
				clause = "(" + clause + " and c.seller_id = any(" + a.add(sellers) + "))"
			}
			return clause
		}})
	}
	// build writes the from and where of a query with every filter but the skipped ones.
	build := func(skip ...string) (string, []any) {
		var a sqlArgs
		clauses := []string{"c.tenant_id = " + a.add(tenantID)}
		join := "left join customer_metrics m on m.customer_id = c.id"
		if sellers != nil {
			join += " and c.seller_id = any(" + a.add(sellers) + ")"
		}
		for _, f := range filters {
			if !slices.Contains(skip, f.param) {
				clauses = append(clauses, f.clause(&a))
			}
		}
		return " from customers c " + join + " where " + strings.Join(clauses, " and "), a
	}

	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("pageSize"))
	if size <= 0 || size > customerRowsPageMax {
		size = customerRowsPage
	}
	sort, ok := customerSorts[q.Get("sort")]
	if !ok {
		sort = customerSorts["spend"]
	}
	dir := "asc"
	if q.Get("desc") == "true" || q.Get("sort") == "" {
		dir = "desc"
	}
	ctx := r.Context()
	from, args := build()

	out := customerRowsResponse{Rows: []customerRow{}}
	if err := s.DB.Pool.QueryRow(ctx, `select count(*)`+from, args...).Scan(&out.Total); err != nil {
		s.writeError(w, r, err)
		return
	}
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select c.data, case when m.customer_id is null then null else %s end%s
		order by %s %s nulls last, c.id limit %d offset %d`, readmodel.MetricsJSON("m."), from, sort, dir, size, max(page, 0)*size), args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	found, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (customerRow, error) {
		var c customerRow
		var metrics []byte
		if err := row.Scan(&c.Customer, &metrics); err != nil {
			return c, err
		}
		if metrics != nil {
			c.Metrics = json.RawMessage(metrics)
		}
		return c, nil
	})
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out.Rows = append(out.Rows, found...)
	stageFrom, stageArgs := build("stage", "tier", "sellerId", "q", "email", "phone")
	if out.StageCounts, err = s.groupCount(ctx, "c.data->>'stage'", stageFrom, stageArgs); err != nil {
		s.writeError(w, r, err)
		return
	}
	tierFrom, tierArgs := build("tier")
	if out.TierCounts, err = s.groupCount(ctx, "c.data->>'tier'", tierFrom, tierArgs); err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// groupCount counts the rows of a from-and-where per key.
func (s *Server) groupCount(ctx context.Context, key, from string, args []any) (map[string]int, error) {
	rows, err := s.DB.Pool.Query(ctx, `select coalesce(`+key+`, ''), count(*)`+from+` group by 1`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

// CustomerSummary is every figure the console sums over all of a brand's customers: the tiles of
// the customers, loyalty and growth pages, segment sizes, the analytics' buyer figures, and what the
// customer form suggests. customerSummary in packages/fixtures makes the same from the demo's data.
type CustomerSummary struct {
	Total int `json:"total"`
	// NewIn30 joined in the 30 days before the store's clock.
	NewIn30  int            `json:"newIn30"`
	ByTier   map[string]int `json:"byTier"`
	ByStage  map[string]int `json:"byStage"`
	BySeller map[string]int `json:"bySeller"`
	Points   int64          `json:"points"`
	// Top holds the customers with the most points.
	Top []domain.Customer `json:"top"`
	// Redeemable counts the customers holding at least each ?rewards= amount of points, in order.
	Redeemable []int `json:"redeemable"`
	// Abandoned counts customers with a checkout left in the last seven days.
	Abandoned int            `json:"abandoned"`
	Segments  map[string]int `json:"segments"`
	// InCustomSegments counts the customers in at least one segment the brand made itself.
	InCustomSegments int                    `json:"inCustomSegments"`
	Buyers           readmodel.BuyerFigures `json:"buyers"`
	// Cities run most common first; Tags and Colors are those in use, for the customer form.
	Cities []string `json:"cities"`
	Tags   []string `json:"tags"`
	Colors []string `json:"colors"`
	// NextCode is the code a new customer of the brand takes.
	NextCode string `json:"nextCode"`
}

// customerSummary answers GET /views/customer-summary. As with the list, a sales user's customer
// counts cover the whole brand and their metrics-based figures their own customers.
func (s *Server) customerSummary(w http.ResponseWriter, r *http.Request) {
	tenantID, sellers, err := s.customerScope(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var rewards []int64
	if v := r.URL.Query().Get("rewards"); v != "" {
		for _, part := range strings.Split(v, ",") {
			n, err := strconv.ParseInt(part, 10, 64)
			if err != nil || len(rewards) == 20 {
				writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "rewards takes up to 20 point amounts, comma separated.")
				return
			}
			rewards = append(rewards, n)
		}
	}
	out, err := s.summarise(r.Context(), tenantID, sellers, rewards)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) summarise(ctx context.Context, tenantID string, sellers []string, rewards []int64) (CustomerSummary, error) {
	pool := s.DB.Pool
	now := s.Clock.Now()
	out := CustomerSummary{ByTier: map[string]int{}, ByStage: map[string]int{}, BySeller: map[string]int{}, Redeemable: make([]int, len(rewards))}

	cols := []string{"count(*)", "count(*) filter (where (data->>'createdAt')::timestamptz >= $2)", "coalesce(sum((data->>'points')::bigint), 0)"}
	args := []any{tenantID, now.Add(-30 * 24 * time.Hour)}
	for _, n := range rewards {
		args = append(args, n)
		cols = append(cols, fmt.Sprintf("count(*) filter (where (data->>'points')::bigint >= $%d)", len(args)))
	}
	dest := []any{&out.Total, &out.NewIn30, &out.Points}
	for i := range out.Redeemable {
		dest = append(dest, &out.Redeemable[i])
	}
	if err := pool.QueryRow(ctx, `select `+strings.Join(cols, ", ")+` from customers where tenant_id = $1`, args...).Scan(dest...); err != nil {
		return out, err
	}

	// One scan groups by tier, stage, seller and city at once.
	rows, err := pool.Query(ctx, `select grouping(data->>'tier'), grouping(data->>'stage'), grouping(data->>'sellerId'),
		coalesce(data->>'tier', ''), coalesce(data->>'stage', ''), coalesce(data->>'sellerId', ''), coalesce(data->>'city', ''), count(*)
		from customers where tenant_id = $1
		group by grouping sets ((data->>'tier'), (data->>'stage'), (data->>'sellerId'), (data->>'city'))
		order by count(*) desc, min(id)`, tenantID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var gTier, gStage, gSeller int
		var tier, stage, seller, city string
		var n int
		if err := rows.Scan(&gTier, &gStage, &gSeller, &tier, &stage, &seller, &city, &n); err != nil {
			rows.Close()
			return out, err
		}
		switch {
		case gTier == 0:
			out.ByTier[tier] = n
		case gStage == 0:
			out.ByStage[stage] = n
		case gSeller == 0:
			if seller != "" {
				out.BySeller[seller] = n
			}
		case city != "":
			out.Cities = append(out.Cities, city)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	if out.Top, err = store.List[domain.Customer](ctx, pool, "customers",
		fmt.Sprintf("id in (select id from customers where tenant_id = $1 order by (data->>'points')::bigint desc, id limit %d)", summaryTop), tenantID); err != nil {
		return out, err
	}
	slices.SortStableFunc(out.Top, func(a, b domain.Customer) int { return b.Points - a.Points })

	strs := func(sql string) ([]string, error) {
		rows, err := pool.Query(ctx, sql, tenantID)
		if err != nil {
			return nil, err
		}
		list, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if list == nil {
			list = []string{}
		}
		return list, err
	}
	if out.Tags, err = strs(`select distinct t collate "C" from customers, jsonb_array_elements_text(data->'tags') t
		where tenant_id = $1 order by 1`); err != nil {
		return out, err
	}
	if out.Colors, err = strs(`select data->>'color' from customers where tenant_id = $1 and data->>'color' is not null
		group by 1 order by min(id)`); err != nil {
		return out, err
	}
	if out.Cities == nil {
		out.Cities = []string{}
	}

	var tenantCode string
	if err := pool.QueryRow(ctx, `select coalesce(data->>'code', '') from tenants where id = $1`, tenantID).Scan(&tenantCode); err != nil {
		return out, err
	}
	prefix := tenantCode + "-C"
	var highest string
	if err := pool.QueryRow(ctx, `select coalesce(max(substr(code, length($2) + 1)::numeric), 0)::text from customers
		where tenant_id = $1 and starts_with(code, $2) and substr(code, length($2) + 1) ~ '^[0-9]+$'`, tenantID, prefix).Scan(&highest); err != nil {
		return out, err
	}
	next, _ := strconv.ParseInt(highest, 10, 64)
	out.NextCode = fmt.Sprintf("%s%05d", prefix, next+1)

	segments, err := store.List[domain.Segment](ctx, pool, "segments", "tenant_id = $1", tenantID)
	if err != nil {
		return out, err
	}
	if out.Segments, out.Abandoned, err = s.segmentSizes(ctx, tenantID, segments, sellers); err != nil {
		return out, err
	}
	if out.InCustomSegments, err = inAnySegment(ctx, pool, tenantID, segments, sellers, now.UnixMilli()); err != nil {
		return out, err
	}
	out.Buyers, err = readmodel.Buyers(ctx, pool, tenantID, sellers, now)
	return out, err
}

// inAnySegment counts the customers that at least one of the brand's own segments holds, scoped
// as the segment counts are.
func inAnySegment(ctx context.Context, q store.Querier, tenantID string, segments []domain.Segment, sellers []string, nowMs int64) (int, error) {
	args := []any{tenantID, nowMs}
	var held []string
	for _, seg := range segments {
		if !seg.BuiltIn {
			held = append(held, rules.SegmentSQL(seg, 2, &args))
		}
	}
	if len(held) == 0 {
		return 0, nil
	}
	where := "c.tenant_id = $1 and (" + strings.Join(held, " or ") + ")"
	if sellers != nil {
		args = append(args, sellers)
		where += fmt.Sprintf(" and c.seller_id = any($%d)", len(args))
	}
	var n int
	err := q.QueryRow(ctx, `select count(*) from customers c left join customer_metrics m on m.customer_id = c.id where `+where, args...).Scan(&n)
	return n, err
}

type customerCountsResponse struct {
	Counts map[string]int `json:"counts"`
}

// customerCounts counts the customers of every brand the user may open, for the brands page.
func (s *Server) customerCounts(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	ids, err := s.tenantScope(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := customerCountsResponse{Counts: map[string]int{}}
	rows, err := s.DB.Pool.Query(r.Context(), `select tenant_id, count(*) from customers where tenant_id = any($1) group by 1`, ids)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			s.writeError(w, r, err)
			return
		}
		out.Counts[id] = n
	}
	if err := rows.Err(); err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
