package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// The query side of orders: lists read order_rows, never the documents the commands write.

const (
	orderRowsPage    = 12
	orderRowsPageMax = 500
	lateAfter        = 48 * time.Hour
)

// orderViews mirror the saved views of the console's orders page (VIEW_TEST in OrdersPage.tsx).
var orderViews = map[string]string{
	"all":        "true",
	"unpaid":     "status in ('new', 'confirmed') and payment_status = 'pending'",
	"to-fulfil":  "status in ('paid', 'processing', 'packed')",
	"in-transit": "status = 'shipped'",
	"returns":    "(status in ('returned', 'refunded') or refunded_amount > 0)",
}

// orderSorts are the columns a list may sort on; anything else falls back to the newest first.
var orderSorts = map[string]string{
	"order":    "code",
	"customer": "customer_name",
	"status":   "status",
	"payment":  "payment_status",
	"channel":  "channel",
	"placed":   "created_at",
	"total":    "total",
	"refund":   "refunded_amount",
	"method":   "payment_method",
}

type orderRow struct {
	ID             string                 `json:"id"`
	Code           string                 `json:"code"`
	CustomerID     string                 `json:"customerId"`
	CustomerName   string                 `json:"customerName"`
	CustomerCode   string                 `json:"customerCode"`
	Status         string                 `json:"status"`
	PaymentStatus  string                 `json:"paymentStatus"`
	Channel        string                 `json:"channel"`
	SellerID       *string                `json:"sellerId"`
	CampaignID     *string                `json:"campaignId"`
	CreatedAt      time.Time              `json:"createdAt"`
	Total          int64                  `json:"total"`
	Subtotal       int64                  `json:"subtotal"`
	ItemCount      int                    `json:"itemCount"`
	Agent          bool                   `json:"agent"`
	RefundedAmount int64                  `json:"refundedAmount"`
	PaymentMethod  string                 `json:"paymentMethod"`
	PaymentTypeID  *string                `json:"paymentTypeId"`
	ShippedAt      *time.Time             `json:"shippedAt"`
	AgentInfo      *domain.AgentOrderInfo `json:"agentInfo"`
}

const orderRowColumns = `id, code, customer_id, customer_name, customer_code, status, payment_status, channel, seller_id,
	campaign_id, created_at, total, subtotal, item_count, agent, refunded_amount, payment_method, payment_type_id, shipped_at, agent_info`

type orderStats struct {
	ToFulfil  int `json:"toFulfil"`
	Late      int `json:"late"`
	Unpaid    int `json:"unpaid"`
	InTransit int `json:"inTransit"`
	Returns   int `json:"returns"`
	// ShippedLast24h counts orders whose shipment happened in the 24 hours before the store's clock.
	ShippedLast24h int `json:"shippedLast24h"`
}

// paymentStats is the brand's payment picture, whatever the list's filters.
type paymentStats struct {
	Paid           int   `json:"paid"`
	Pending        int   `json:"pending"`
	Failed         int   `json:"failed"`
	Refunded       int   `json:"refunded"`
	Collected      int64 `json:"collected"`
	RefundedAmount int64 `json:"refundedAmount"`
	PendingAmount  int64 `json:"pendingAmount"`
}

type orderRowsResponse struct {
	Rows []orderRow `json:"rows"`
	// Total counts the rows that match every filter, across pages.
	Total int `json:"total"`
	// StatusCounts are per status within the view, for the filter chips; search does not narrow them.
	StatusCounts map[string]int `json:"statusCounts"`
	// PaymentStatusCounts are per payment status with every filter but the payment status applied.
	PaymentStatusCounts map[string]int `json:"paymentStatusCounts"`
	// StageCounts are per stage (open, delivered, closed) with every filter but the stage applied.
	StageCounts map[string]int `json:"stageCounts"`
	Stats       orderStats     `json:"stats"`
	Payments    paymentStats   `json:"payments"`
	// LateBefore is when an order to fulfil turns late, on the store's clock.
	LateBefore time.Time `json:"lateBefore"`
}

// orderStages group statuses the way a record's order card shows them (FilteredOrderTable).
var orderStages = map[string]string{
	"open":      "status in ('new', 'confirmed', 'paid', 'processing', 'packed', 'shipped')",
	"delivered": "status in ('delivered', 'completed')",
	"closed":    "status in ('cancelled', 'returned', 'refunded')",
}

const stageCase = `case when status in ('delivered', 'completed') then 'delivered'
	when status in ('cancelled', 'returned', 'refunded') then 'closed' else 'open' end`

// orderFilter is one condition of the list and the query parameter it comes from.
type orderFilter struct {
	param, clause string
	arg           any
}

// orderRows serves the orders list from the read model: one brand, any mix of the filters below,
// sorted and paged. Every count it returns leaves out only its own filter, so chips stay truthful.
func (s *Server) orderRows(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	q := r.URL.Query()
	tenantID := q.Get("tenantId")
	if p.Kind == auth.KindAPIKey {
		tenantID = p.TenantIDs[0]
	}
	if tenantID == "" || !p.CanAccess(tenantID) {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "You cannot read the orders of this brand.")
		return
	}
	view, ok := orderViews[cmpOr(q.Get("view"), "all")]
	if !ok {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Unknown view.")
		return
	}
	sellers, err := s.ownSellers(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	// base limits every query of this answer, the counts and stats included: the brand, and for a
	// sales user their own orders.
	base, baseArgs, statsBase := "tenant_id = $1", []any{tenantID}, "tenant_id = $1"
	if sellers != nil {
		base, baseArgs = base+" and "+fmt.Sprintf(ownOrderRows, 2), append(baseArgs, sellers)
		// The stats query holds three bounds of its own before the sellers.
		statsBase += " and " + fmt.Sprintf(ownOrderRows, 5)
	}
	var filters []orderFilter
	for _, f := range []struct{ param, column string }{
		{"status", "status"}, {"paymentStatus", "payment_status"}, {"paymentMethod", "payment_method"},
		{"customerId", "customer_id"}, {"sellerId", "seller_id"}, {"campaignId", "campaign_id"},
	} {
		if v := q.Get(f.param); v != "" {
			filters = append(filters, orderFilter{f.param, f.column + " = $%d", v})
		}
	}
	if v := q.Get("stage"); v != "" {
		clause, ok := orderStages[v]
		if !ok {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Unknown stage.")
			return
		}
		filters = append(filters, orderFilter{"stage", clause, nil})
	}
	if q.Get("agent") == "true" {
		filters = append(filters, orderFilter{"agent", "agent", nil})
	}
	if v := q.Get("ids"); v != "" {
		ids := strings.Split(v, ",")
		if len(ids) > orderRowsPageMax {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Ask for 500 ids or fewer.")
			return
		}
		filters = append(filters, orderFilter{"ids", "id = any($%d)", ids})
	}
	if v := q.Get("since"); v != "" {
		since, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "since takes an RFC 3339 timestamp.")
			return
		}
		filters = append(filters, orderFilter{"since", "created_at >= $%d", since})
	}
	if search := strings.ToLower(strings.TrimSpace(q.Get("q"))); search != "" {
		for _, word := range strings.Fields(search) {
			filters = append(filters, orderFilter{"q", "search like $%d", "%" + likeEscape(word) + "%"})
		}
	}
	// where builds the condition with every filter except those of the given parameter.
	where := func(skip string) (string, []any) {
		clauses := []string{base, view}
		args := slices.Clone(baseArgs)
		for _, f := range filters {
			if f.param == skip {
				continue
			}
			if f.arg == nil {
				clauses = append(clauses, f.clause)
				continue
			}
			args = append(args, f.arg)
			clauses = append(clauses, fmt.Sprintf(f.clause, len(args)))
		}
		return strings.Join(clauses, " and "), args
	}

	page, _ := strconv.Atoi(q.Get("page"))
	size, _ := strconv.Atoi(q.Get("pageSize"))
	if size <= 0 || size > orderRowsPageMax {
		size = orderRowsPage
	}
	sort, ok := orderSorts[q.Get("sort")]
	if !ok {
		sort = "created_at"
	}
	dir := "asc"
	if q.Get("desc") == "true" || q.Get("sort") == "" {
		dir = "desc"
	}
	ctx := r.Context()
	filter, args := where("")

	var out orderRowsResponse
	if err := s.DB.Pool.QueryRow(ctx, `select count(*) from order_rows where `+filter, args...).Scan(&out.Total); err != nil {
		s.writeError(w, r, err)
		return
	}
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select %s from order_rows where %s order by %s %s, id collate "C" limit %d offset %d`,
		orderRowColumns, filter, sort, dir, size, max(page, 0)*size), args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out.Rows, err = pgx.CollectRows(rows, pgx.RowToStructByPos[orderRow])
	if err != nil {
		s.writeError(w, r, err)
		return
	}

	counts := func(column, skip string) (map[string]int, error) {
		cond, cargs := where(skip)
		if skip == "status" {
			// The status chips count within the view alone, as the orders page always has.
			cond, cargs = base+" and "+view, baseArgs
		}
		rows, err := s.DB.Pool.Query(ctx, `select `+column+`, count(*) from order_rows where `+cond+` group by 1`, cargs...)
		if err != nil {
			return nil, err
		}
		out := map[string]int{}
		for rows.Next() {
			var key string
			var n int
			if err := rows.Scan(&key, &n); err != nil {
				rows.Close()
				return nil, err
			}
			out[key] = n
		}
		rows.Close()
		return out, rows.Err()
	}
	if out.StatusCounts, err = counts("status", "status"); err != nil {
		s.writeError(w, r, err)
		return
	}
	if out.PaymentStatusCounts, err = counts("payment_status", "paymentStatus"); err != nil {
		s.writeError(w, r, err)
		return
	}
	if out.StageCounts, err = counts(stageCase, "stage"); err != nil {
		s.writeError(w, r, err)
		return
	}

	now := s.Clock.Now()
	out.LateBefore = now.Add(-lateAfter)
	err = s.DB.Pool.QueryRow(ctx, fmt.Sprintf(`select count(*) filter (where %s), count(*) filter (where %s and created_at < $2),
		count(*) filter (where %s), count(*) filter (where %s), count(*) filter (where %s),
		count(*) filter (where shipped_at > $3 and shipped_at <= $4),
		count(*) filter (where payment_status = 'paid'), count(*) filter (where payment_status = 'pending'),
		count(*) filter (where payment_status = 'failed'), count(*) filter (where payment_status = 'refunded'),
		coalesce(sum(greatest(0, total - refunded_amount)) filter (where payment_status in ('paid', 'refunded')), 0),
		coalesce(sum(refunded_amount), 0), coalesce(sum(total) filter (where payment_status = 'pending'), 0)
		from order_rows where %s`,
		orderViews["to-fulfil"], orderViews["to-fulfil"], orderViews["unpaid"], orderViews["in-transit"], orderViews["returns"],
		statsBase),
		append([]any{tenantID, out.LateBefore, now.Add(-24 * time.Hour), now}, baseArgs[1:]...)...).Scan(&out.Stats.ToFulfil, &out.Stats.Late, &out.Stats.Unpaid,
		&out.Stats.InTransit, &out.Stats.Returns, &out.Stats.ShippedLast24h, &out.Payments.Paid, &out.Payments.Pending,
		&out.Payments.Failed, &out.Payments.Refunded, &out.Payments.Collected, &out.Payments.RefundedAmount, &out.Payments.PendingAmount)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if out.Rows == nil {
		out.Rows = []orderRow{}
	}
	writeJSON(w, http.StatusOK, out)
}

func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func cmpOr(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

const (
	customerEventsDefault = 50
	customerEventsMax     = 500
)

// customerEventsResponse documents the answer; the handler passes the stored rows through as they are.
type customerEventsResponse struct {
	Events []domain.CustomerEvent `json:"events"`
}

// customerEvents reads the customer history newest first, up to the store's clock: one customer's
// timeline, one kind since a moment, or the latest across the brand. The console's state no longer
// carries this table, which was its largest after orders.
func (s *Server) customerEvents(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	q := r.URL.Query()
	limit := customerEventsDefault
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > customerEventsMax {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "limit takes a number from 1 to 500.")
			return
		}
		limit = n
	}
	where := []string{"tenant_id = $1", "at <= $2"}
	// at is stored as ISO text in WIB, so the bounds use the same form to compare in order.
	args := []any{tenantID, s.Clock.NowIso()}
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	p, _ := auth.From(r.Context())
	sellers, err := s.ownSellers(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if sellers != nil {
		// A sales user reads the history of their own customers, which holds what each one bought.
		add(ownCustomers, sellers)
	}
	if v := q.Get("customerId"); v != "" {
		add("customer_id = $%d", v)
	}
	if v := q.Get("kind"); v != "" {
		add("data->>'kind' = $%d", v)
	}
	if v := q.Get("excludeKind"); v != "" {
		add("data->>'kind' <> $%d", v)
	}
	if v := q.Get("since"); v != "" {
		since, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "since takes an RFC 3339 timestamp.")
			return
		}
		add("at >= $%d", clock.Iso(since))
	}
	rows, err := s.DB.Pool.Query(r.Context(), fmt.Sprintf(`select data from customer_events where %s order by at desc, id collate "C" limit %d`,
		strings.Join(where, " and "), limit), args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	events, err := pgx.CollectRows(rows, pgx.RowTo[json.RawMessage])
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if events == nil {
		events = []json.RawMessage{}
	}
	writeJSON(w, http.StatusOK, map[string][]json.RawMessage{"events": events})
}
