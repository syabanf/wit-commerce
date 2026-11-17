package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// The assistant's facts read across modules, so they are gathered here and not in the ai module.
//
// What the model receives: sales totals for 7 and 30 days against the period before, the top five
// products and sellers, order queue counts with the oldest orders to fulfil (code, status, total, no
// customer), stock levels at or under their reorder point, campaigns and promotions that have not
// ended, segment sizes, open tickets and leads, the abandoned checkouts of the last 7 days and the
// five customers who spent most, by initials and customer code only. What it never receives: a
// customer's or lead's full name, email, phone, address, city or birthday, and any staff account
// detail.
//
// A sales user's facts cover their own orders, customers and leads, the rule of seller_scope.go, and
// leave out products, sellers, stock, campaigns, promotions and tickets.
//
// The sections run at once under one deadline, and sectionsFor trims them to the question and page.

const (
	assistantTop        = 5
	assistantOrders     = 8
	assistantLowStock   = 10
	assistantCampaigns  = 10
	assistantPromos     = 15
	assistantFactsLimit = 5 * time.Second
	segmentCacheTTL     = 60 * time.Second
)

// sections says which optional parts of the facts a question needs.
type sections struct {
	marketing, funnels, tickets, leads bool
}

// sectionKeywords open a section whatever page the person is on.
var sectionKeywords = map[string][]string{
	"marketing": {"campaign", "promo", "discount", "voucher", "coupon", "sale", "launch", "marketing"},
	"tickets":   {"ticket", "support", "complain", "complaint", "issue", "help desk"},
	"leads":     {"lead", "pipeline", "deal", "prospect"},
}

func mentions(question string, kind string) bool {
	q := strings.ToLower(question)
	return slices.ContainsFunc(sectionKeywords[kind], func(w string) bool { return strings.Contains(q, w) })
}

// sectionsFor is the trim rule: a record page about an order, product or stock leaves marketing out,
// campaign funnels appear only on marketing pages, and tickets and leads only on their pages or
// home. A keyword in the question brings any section back.
func sectionsFor(page, question string) sections {
	path, _, _ := strings.Cut(page, "?")
	home := path == "" || path == "/" || path == "/analytics"
	under := func(prefixes ...string) bool {
		return slices.ContainsFunc(prefixes, func(p string) bool { return path == p || strings.HasPrefix(path, p+"/") })
	}
	operational := strings.HasPrefix(path, "/commerce/orders/") || strings.HasPrefix(path, "/commerce/products/") || under("/commerce/inventory")
	return sections{
		marketing: !operational || mentions(question, "marketing"),
		funnels:   under("/marketing") || mentions(question, "marketing"),
		tickets:   home || under("/customers/support") || mentions(question, "tickets"),
		leads:     home || under("/customers/leads", "/sales") || mentions(question, "leads"),
	}
}

// assistantFacts gathers the facts and returns them with a sales user's seller profiles (nil for a
// reader of the whole brand), which the lookups scope by.
func (s *Server) assistantFacts(ctx context.Context, p auth.Principal, tenantID, page, question string) (aimodule.AssistantFacts, []string, error) {
	ctx, cancel := context.WithTimeout(ctx, assistantFactsLimit)
	defer cancel()
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", tenantID)
	if err != nil {
		return aimodule.AssistantFacts{}, nil, err
	}
	sellers, err := s.ownSellers(ctx, p)
	if err != nil {
		return aimodule.AssistantFacts{}, nil, err
	}
	now := s.Clock.Now().In(clock.WIB)
	f := aimodule.AssistantFacts{
		TenantID: tenantID, Role: p.Role, UserID: p.ID, OwnOnly: sellers != nil, Now: now,
		Store: tenant.Name, Today: now.Format(time.DateOnly), Page: page,
		Scope: "the whole brand", Known: map[string][]string{},
	}
	if sellers != nil {
		f.Scope = "only this sales person's own orders, assigned customers and leads"
	}
	g := factGatherer{s: s, ctx: ctx, tenantID: tenantID, userID: p.ID, sellers: sellers, now: now, f: &f}
	want := sectionsFor(page, question)
	steps := []func() error{g.sales, g.queue, g.customers}
	if want.leads {
		steps = append(steps, g.leads)
	}
	if sellers == nil {
		steps = append(steps, g.catalog)
		if want.marketing {
			steps = append(steps, func() error { return g.marketing(want.funnels) })
		}
		if want.tickets {
			steps = append(steps, g.tickets)
		}
	}
	// Each step writes only its own fields of f, so they run at once; the first error wins.
	errs := make([]error, len(steps))
	var wg sync.WaitGroup
	for i, step := range steps {
		wg.Go(func() { errs[i] = step() })
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		return aimodule.AssistantFacts{}, nil, err
	}
	if err := g.current(page); err != nil {
		return aimodule.AssistantFacts{}, nil, err
	}
	knowFacts(&f)
	return f, sellers, nil
}

// knowFacts lets actions and links name every record the facts list.
func knowFacts(f *aimodule.AssistantFacts) {
	for _, r := range f.TopSellers {
		f.Know(aimodule.KnownSellers, r.ID)
	}
	for _, r := range f.TopProducts {
		f.Know(aimodule.KnownProducts, r.ID)
	}
	for _, l := range f.LowStock {
		f.Know(aimodule.KnownProducts, l.ProductID)
	}
	for _, o := range f.Orders {
		f.Know(aimodule.KnownOrders, o.ID)
	}
	for _, c := range f.Customers {
		f.Know(aimodule.KnownCustomers, c.ID)
	}
	for _, s := range f.Segments {
		f.Know(aimodule.KnownSegments, s.ID)
	}
	for _, c := range f.Campaigns {
		f.Know(aimodule.KnownCampaigns, c.ID)
	}
	for _, p := range f.Promotions {
		f.Know(aimodule.KnownPromotions, p.ID)
	}
}

type factGatherer struct {
	s        *Server
	ctx      context.Context
	tenantID string
	userID   string
	// sellers is nil for a reader of the whole brand, else a sales user's seller profiles.
	sellers []string
	now     time.Time
	f       *aimodule.AssistantFacts
}

func (g *factGatherer) day(back int) string { return g.now.AddDate(0, 0, -back).Format(time.DateOnly) }

// scoped adds a sales user's rule to a query whose arguments are args: order_rows' own-orders rule,
// or seller_id for the sales facts.
func (g *factGatherer) scoped(where string, args []any, orderRows bool) (string, []any) {
	if g.sellers == nil {
		return where, args
	}
	args = append(args, g.sellers)
	if orderRows {
		return where + " and " + fmt.Sprintf(ownOrderRows, len(args)), args
	}
	return where + fmt.Sprintf(" and seller_id = any($%d)", len(args)), args
}

func (g *factGatherer) sales() error {
	for _, days := range []int{7, 30} {
		w := aimodule.SalesWindow{Days: days, From: g.day(days - 1), To: g.day(0), PrevFrom: g.day(2*days - 1), PrevTo: g.day(days)}
		where, args := g.scoped("tenant_id = $1 and day between $2 and $3", []any{g.tenantID, w.PrevFrom, w.To}, false)
		args = append(args, w.From)
		err := g.s.DB.Pool.QueryRow(g.ctx, fmt.Sprintf(`select
			coalesce(sum(orders) filter (where day >= $%[1]d), 0), coalesce(sum(revenue) filter (where day >= $%[1]d), 0),
			coalesce(sum(orders) filter (where day < $%[1]d), 0), coalesce(sum(revenue) filter (where day < $%[1]d), 0)
			from sales_days where %s`, len(args), where), args...).Scan(&w.Orders, &w.Revenue, &w.PrevOrders, &w.PrevRevenue)
		if err != nil {
			return err
		}
		if w.PrevRevenue > 0 {
			pct := math.Round(float64(w.Revenue-w.PrevRevenue)/float64(w.PrevRevenue)*1000) / 10
			w.ChangePct = &pct
		}
		g.f.Sales = append(g.f.Sales, w)
	}
	if g.sellers != nil {
		return nil
	}
	rows, err := g.s.DB.Pool.Query(g.ctx, `select d.seller_id, coalesce(s.data->>'name', d.seller_id), sum(d.orders), sum(d.revenue)
		from sales_days d left join sellers s on s.id = d.seller_id
		where d.tenant_id = $1 and d.day >= $2 and d.seller_id is not null group by 1, 2 order by 4 desc, 1 limit $3`, g.tenantID, g.day(29), assistantTop)
	if err != nil {
		return err
	}
	g.f.TopSellers, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (aimodule.RankedFact, error) {
		var f aimodule.RankedFact
		return f, r.Scan(&f.ID, &f.Name, &f.Orders, &f.Revenue)
	})
	return err
}

func (g *factGatherer) queue() error {
	lateBefore := g.s.Clock.Now().Add(-lateAfter)
	where, args := g.scoped("tenant_id = $1", []any{g.tenantID, lateBefore}, true)
	q := &g.f.Queue
	err := g.s.DB.Pool.QueryRow(g.ctx, fmt.Sprintf(`select count(*) filter (where %[1]s), count(*) filter (where %[1]s and created_at < $2),
		count(*) filter (where %[2]s), count(*) filter (where %[3]s), count(*) filter (where %[4]s) from order_rows where %[5]s`,
		orderViews["to-fulfil"], orderViews["unpaid"], orderViews["in-transit"], orderViews["returns"], where),
		args...).Scan(&q.ToFulfil, &q.Late, &q.Unpaid, &q.InTransit, &q.Returns)
	if err != nil {
		return err
	}
	where, args = g.scoped("tenant_id = $1 and "+orderViews["to-fulfil"], []any{g.tenantID}, true)
	g.f.Orders, err = g.s.orderFacts(g.ctx, where, "created_at, id", assistantOrders, args, false)
	return err
}

// orderFacts reads order_rows into facts. withCustomer adds the buyer's initials and code.
func (s *Server) orderFacts(ctx context.Context, where, order string, limit int, args []any, withCustomer bool) ([]aimodule.OrderFact, error) {
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select id, code, status, payment_status, payment_method, created_at, total,
		customer_name, customer_code from order_rows where %s order by %s limit %d`, where, order, limit), args...)
	if err != nil {
		return nil, err
	}
	lateBefore := s.Clock.Now().Add(-lateAfter)
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (aimodule.OrderFact, error) {
		var o aimodule.OrderFact
		var method, name, code string
		var placed time.Time
		if err := r.Scan(&o.ID, &o.Code, &o.Status, &o.Payment, &method, &placed, &o.Total, &name, &code); err != nil {
			return o, err
		}
		if aimodule.Advanceable(o.Status) {
			o.NextStatus, _ = rules.NextOrderStatus(o.Status, method)
		}
		o.PlacedAt, o.Late = clock.Iso(placed), aimodule.Advanceable(o.Status) && placed.Before(lateBefore)
		if withCustomer {
			o.Customer = initials(name) + " (" + code + ")"
		}
		return o, nil
	})
}

// customers counts segments and abandoned checkouts in SQL, and names the top spenders by initials.
func (g *factGatherer) customers() error {
	segments, err := store.ListTenant[domain.Segment](g.ctx, g.s.DB.Pool, "segments", g.tenantID)
	if err != nil {
		return err
	}
	sizes, abandoned, err := g.s.segmentSizes(g.ctx, g.tenantID, segments, g.sellers)
	if err != nil {
		return err
	}
	g.f.AbandonedCarts7d = abandoned
	for _, seg := range segments {
		g.f.Segments = append(g.f.Segments, aimodule.SegmentFact{ID: seg.ID, Name: seg.Name, Customers: sizes[seg.ID]})
	}
	where, args := "c.tenant_id = $1 and m.spend > 0 and m.orders > 0", []any{g.tenantID}
	if g.sellers != nil {
		args = append(args, g.sellers)
		where += fmt.Sprintf(" and c.data->>'sellerId' = any($%d)", len(args))
	}
	g.f.Customers, err = g.s.customerFacts(g.ctx, where, "m.spend desc, c.id", assistantTop, args)
	return err
}

// customerFacts reads customers with their metrics as initials and code, never contact details.
func (s *Server) customerFacts(ctx context.Context, where, order string, limit int, args []any) ([]aimodule.CustomerFact, error) {
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select c.id, c.code, coalesce(c.data->>'name', ''), coalesce(c.data->>'tier', ''),
		coalesce(m.orders, 0), coalesce(m.spend, 0), m.last_at
		from customers c left join customer_metrics m on m.customer_id = c.id where %s order by %s limit %d`, where, order, limit), args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (aimodule.CustomerFact, error) {
		var c aimodule.CustomerFact
		var name string
		var last *time.Time
		if err := r.Scan(&c.ID, &c.Code, &name, &c.Tier, &c.Orders, &c.Spend, &last); err != nil {
			return c, err
		}
		c.Initials = initials(name)
		if last != nil && c.Orders > 0 {
			c.LastOrderAt = clock.Iso(*last)
		}
		return c, nil
	})
}

// segmentCache keeps a brand's segment sizes for a minute. A write to customers or segments drops
// the brand's entry.
type segmentCache struct {
	mu      sync.Mutex
	entries map[string]segmentEntry
}

type segmentEntry struct {
	at        time.Time
	key       string
	sizes     map[string]int
	abandoned int
}

func (c *segmentCache) forget(collection, tenantID string) {
	if collection != "customers" && collection != "segments" && collection != readmodel.CustomerMetricsCollection {
		return
	}
	c.mu.Lock()
	delete(c.entries, tenantID)
	c.mu.Unlock()
}

// segmentSizes counts each segment's customers by id. A sales user's counts cover their own
// customers and skip the cache.
func (s *Server) segmentSizes(ctx context.Context, tenantID string, segments []domain.Segment, sellers []string) (map[string]int, int, error) {
	var key strings.Builder
	for _, seg := range segments {
		fmt.Fprintf(&key, "%s:%s:%v;", seg.ID, seg.Match, seg.Rules)
	}
	now := s.Clock.Now()
	if sellers == nil {
		s.segments.mu.Lock()
		e, ok := s.segments.entries[tenantID]
		s.segments.mu.Unlock()
		if ok && e.key == key.String() && now.Sub(e.at) < segmentCacheTTL && !now.Before(e.at) {
			return e.sizes, e.abandoned, nil
		}
	}
	counts, abandoned, err := readmodel.SegmentCounts(ctx, s.DB.Pool, tenantID, segments, sellers, now.UnixMilli())
	if err != nil {
		return nil, 0, err
	}
	sizes := make(map[string]int, len(segments))
	for i, seg := range segments {
		sizes[seg.ID] = counts[i]
	}
	if sellers == nil {
		s.segments.mu.Lock()
		if s.segments.entries == nil {
			s.segments.entries = map[string]segmentEntry{}
		}
		s.segments.entries[tenantID] = segmentEntry{at: now, key: key.String(), sizes: sizes, abandoned: abandoned}
		s.segments.mu.Unlock()
	}
	return sizes, abandoned, nil
}

// catalog ranks products over 30 days and lists stock levels at or under their reorder point.
func (g *factGatherer) catalog() error {
	rows, err := g.s.DB.Pool.Query(g.ctx, `select d.product_id, coalesce(p.data->>'name', d.product_id), sum(d.orders), sum(d.units), sum(d.revenue)
		from product_days d left join products p on p.id = d.product_id
		where d.tenant_id = $1 and d.day >= $2 group by 1, 2 order by 5 desc, 1 limit $3`, g.tenantID, g.day(29), assistantTop)
	if err != nil {
		return err
	}
	if g.f.TopProducts, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (aimodule.RankedFact, error) {
		var f aimodule.RankedFact
		return f, r.Scan(&f.ID, &f.Name, &f.Orders, &f.Units, &f.Revenue)
	}); err != nil {
		return err
	}
	const low = `(s.data->>'onHand')::int - (s.data->>'reserved')::int <= (s.data->>'safety')::int`
	if err := g.s.DB.Pool.QueryRow(g.ctx, `select count(*) from stock s where s.tenant_id = $1 and `+low, g.tenantID).Scan(&g.f.LowStockTotal); err != nil {
		return err
	}
	// The furthest under the reorder point first.
	g.f.LowStock, err = g.s.stockFacts(g.ctx, "s.tenant_id = $1 and "+low,
		`(s.data->>'onHand')::int - (s.data->>'reserved')::int - (s.data->>'safety')::int, s.id`, assistantLowStock, []any{g.tenantID})
	return err
}

// stockFacts reads stock levels with their product, SKU and warehouse names.
func (s *Server) stockFacts(ctx context.Context, where, order string, limit int, args []any) ([]aimodule.StockFact, error) {
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select s.id, s.data->>'productId', s.data->>'variantId', s.data->>'warehouseId',
		(s.data->>'onHand')::int, (s.data->>'reserved')::int, (s.data->>'safety')::int,
		coalesce(p.data->>'name', s.data->>'productId'),
		coalesce((select v->>'sku' from jsonb_array_elements(p.data->'variants') v where v->>'id' = s.data->>'variantId' limit 1), ''),
		coalesce(w.data->>'name', '')
		from stock s left join products p on p.id = s.data->>'productId' left join warehouses w on w.id = s.data->>'warehouseId'
		where %s order by %s limit %d`, where, order, limit), args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (aimodule.StockFact, error) {
		var l aimodule.StockFact
		err := r.Scan(&l.LevelID, &l.ProductID, &l.VariantID, &l.WarehouseID, &l.OnHand, &l.Reserved, &l.ReorderPoint, &l.Product, &l.SKU, &l.Warehouse)
		l.Available = l.OnHand - l.Reserved
		return l, err
	})
}

// marketing lists the campaigns and promotions that are live, coming, paused or in draft.
func (g *factGatherer) marketing(funnels bool) error {
	campaigns, err := g.s.campaignFacts(g.ctx, g.tenantID, "status in ('running', 'scheduled', 'paused', 'draft')", nil, assistantCampaigns)
	if err != nil {
		return err
	}
	if !funnels {
		for i := range campaigns {
			campaigns[i].Funnel = nil
		}
	}
	g.f.Campaigns = campaigns
	g.f.Promotions, err = g.s.promotionFacts(g.ctx, g.tenantID, "status in ('active', 'scheduled', 'paused', 'draft')", nil, assistantPromos)
	return err
}

var campaignRank = map[string]int{"running": 0, "scheduled": 1, "paused": 2, "draft": 3, "completed": 4}

// campaignFacts reads campaigns matching where ($1 is the tenant, extra arguments follow), with the
// reason a draft or paused one cannot launch.
func (s *Server) campaignFacts(ctx context.Context, tenantID, where string, args []any, limit int) ([]aimodule.CampaignFact, error) {
	campaigns, err := store.List[domain.Campaign](ctx, s.DB.Pool, "campaigns", "tenant_id = $1 and "+where, append([]any{tenantID}, args...)...)
	if err != nil {
		return nil, err
	}
	slices.SortStableFunc(campaigns, func(a, b domain.Campaign) int { return campaignRank[a.Status] - campaignRank[b.Status] })
	campaigns = campaigns[:min(limit, len(campaigns))]
	var sizes map[string]int
	out := make([]aimodule.CampaignFact, 0, len(campaigns))
	for _, c := range campaigns {
		fact := aimodule.CampaignFact{ID: c.ID, Name: c.Name, Status: c.Status, StartAt: c.StartAt, EndAt: c.EndAt, Budget: c.Budget, Revenue: c.Revenue, Funnel: c.Funnel}
		if c.Status == "draft" || c.Status == "paused" {
			audience := 0
			if c.SegmentID != nil {
				if sizes == nil {
					segments, err := store.ListTenant[domain.Segment](ctx, s.DB.Pool, "segments", tenantID)
					if err != nil {
						return nil, err
					}
					if sizes, _, err = s.segmentSizes(ctx, tenantID, segments, nil); err != nil {
						return nil, err
					}
				}
				audience = sizes[*c.SegmentID]
			}
			fact.LaunchBlocker = rules.CampaignLaunchBlocker(c, audience)
		}
		out = append(out, fact)
	}
	return out, nil
}

var promotionRank = map[string]int{"active": 0, "scheduled": 1, "paused": 2, "draft": 3, "expired": 4}

func (s *Server) promotionFacts(ctx context.Context, tenantID, where string, args []any, limit int) ([]aimodule.PromotionFact, error) {
	promotions, err := store.List[domain.Promotion](ctx, s.DB.Pool, "promotions", "tenant_id = $1 and "+where, append([]any{tenantID}, args...)...)
	if err != nil {
		return nil, err
	}
	slices.SortStableFunc(promotions, func(a, b domain.Promotion) int { return promotionRank[a.Status] - promotionRank[b.Status] })
	out := make([]aimodule.PromotionFact, 0, min(limit, len(promotions)))
	for _, p := range promotions[:min(limit, len(promotions))] {
		out = append(out, aimodule.PromotionFact{ID: p.ID, Code: p.Code, Name: p.Name, Kind: p.Kind, Value: p.Value,
			Status: p.Status, StartAt: p.StartAt, EndAt: p.EndAt, Used: p.Used, Revenue: p.Revenue})
	}
	return out, nil
}

// tickets counts open tickets and lists the five due first.
func (g *factGatherer) tickets() error {
	if err := g.s.DB.Pool.QueryRow(g.ctx, `select count(*) from tickets where tenant_id = $1 and status <> 'resolved'`, g.tenantID).Scan(&g.f.OpenTicketsTotal); err != nil {
		return err
	}
	var err error
	g.f.Tickets, err = g.s.ticketFacts(g.ctx, g.userID, "t.tenant_id = $1 and t.status <> 'resolved'", []any{g.tenantID}, assistantTop)
	return err
}

// ticketFacts reads tickets by SLA, with the customer as initials and code and the assignee as you,
// nobody or someone else. A subject keeps no email or phone number.
func (s *Server) ticketFacts(ctx context.Context, userID, where string, args []any, limit int) ([]aimodule.TicketFact, error) {
	rows, err := s.DB.Pool.Query(ctx, fmt.Sprintf(`select t.id, t.data->>'code', t.data->>'kind', t.status, t.data->>'subject',
		coalesce(c.data->>'name', ''), coalesce(c.code, ''), coalesce(t.data->>'assigneeId', ''), t.data->>'createdAt', t.data->>'slaDueAt'
		from tickets t left join customers c on c.id = t.data->>'customerId' where %s order by t.data->>'slaDueAt', t.id limit %d`, where, limit), args...)
	if err != nil {
		return nil, err
	}
	now := s.Clock.Now()
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (aimodule.TicketFact, error) {
		var t aimodule.TicketFact
		var name, code, assignee string
		if err := r.Scan(&t.ID, &t.Code, &t.Kind, &t.Status, &t.Subject, &name, &code, &assignee, &t.CreatedAt, &t.SlaDueAt); err != nil {
			return t, err
		}
		t.Subject = clipText(aimodule.Redact(t.Subject), 120)
		if code != "" {
			t.Customer = initials(name) + " (" + code + ")"
		}
		switch assignee {
		case "":
			t.Assigned = aimodule.AssignedNobody
		case userID:
			t.Assigned = aimodule.AssignedYou
		default:
			t.Assigned = aimodule.AssignedSomeone
		}
		due, err := clock.Parse(t.SlaDueAt)
		t.Overdue = err == nil && t.Status != "resolved" && due.Before(now)
		return t, nil
	})
}

// leads counts open leads and lists the five untouched longest.
func (g *factGatherer) leads() error {
	where, args := g.scoped("tenant_id = $1 and stage not in ('won', 'lost')", []any{g.tenantID}, false)
	if err := g.s.DB.Pool.QueryRow(g.ctx, `select count(*) from leads where `+where, args...).Scan(&g.f.OpenLeadsTotal); err != nil {
		return err
	}
	var err error
	g.f.Leads, err = g.s.leadFacts(g.ctx, where, args, assistantTop)
	return err
}

// leadFacts reads leads by initials and code; never their phone or company contact.
func (s *Server) leadFacts(ctx context.Context, where string, args []any, limit int) ([]aimodule.LeadFact, error) {
	leads, err := queryDocs[domain.Lead](ctx, s.DB.Pool, "select data from leads where "+where+" order by data->>'updatedAt', id limit "+fmt.Sprint(limit), args...)
	if err != nil {
		return nil, err
	}
	out := make([]aimodule.LeadFact, 0, len(leads))
	for _, l := range leads {
		next := aimodule.NextLeadStage(l.Stage)
		if next != "" && rules.LeadMoveBlocker(l, next) != "" {
			next = ""
		}
		out = append(out, aimodule.LeadFact{ID: l.ID, Code: l.Code, Initials: initials(l.Name), Stage: l.Stage, NextStage: next, Value: l.Value, UpdatedAt: l.UpdatedAt})
	}
	return out, nil
}

// current adds the order, customer or product on the open page, when the person may read it.
func (g *factGatherer) current(page string) error {
	path, _, _ := strings.Cut(page, "?")
	if id, ok := strings.CutPrefix(path, "/commerce/orders/"); ok && id != "" {
		return g.currentOrder(id)
	}
	if id, ok := strings.CutPrefix(path, "/customers/all/"); ok && id != "" {
		return g.currentCustomer(id)
	}
	if id, ok := strings.CutPrefix(path, "/commerce/products/"); ok && id != "" && g.sellers == nil {
		return g.currentProduct(id)
	}
	return nil
}

func (g *factGatherer) currentOrder(id string) error {
	where, args := g.scoped("tenant_id = $1 and id = $2", []any{g.tenantID, id}, true)
	var o aimodule.OrderFact
	var method, channel, customerName, customerCode string
	var placed time.Time
	var items int
	err := g.s.DB.Pool.QueryRow(g.ctx, `select id, code, status, payment_status, payment_method, created_at, total, item_count, channel,
		customer_name, customer_code from order_rows where `+where, args...).Scan(&o.ID, &o.Code, &o.Status, &o.Payment, &method,
		&placed, &o.Total, &items, &channel, &customerName, &customerCode)
	if err != nil {
		return ignoreMissing(err)
	}
	o.NextStatus, _ = rules.NextOrderStatus(o.Status, method)
	o.PlacedAt, o.Late = clock.Iso(placed), placed.Before(g.s.Clock.Now().Add(-lateAfter))
	o.Customer = initials(customerName) + " (" + customerCode + ")"
	g.f.Current = &aimodule.CurrentRecord{Kind: "order", ID: o.ID, Facts: map[string]any{
		"code": o.Code, "status": o.Status, "nextStatus": o.NextStatus, "payment": o.Payment, "paymentMethod": method,
		"placedAt": o.PlacedAt, "total": o.Total, "items": items, "channel": channel, "customer": o.Customer,
	}}
	// Actions may name the open order; the assistant moves one on only while it is being fulfilled.
	if !aimodule.Advanceable(o.Status) {
		o.NextStatus = ""
	}
	g.f.Found.Orders = append(g.f.Found.Orders, o)
	g.f.Know(aimodule.KnownOrders, o.ID)
	return nil
}

func (g *factGatherer) currentCustomer(id string) error {
	c, err := store.Get[domain.Customer](g.ctx, g.s.DB.Pool, "customers", id)
	if err != nil {
		return ignoreMissing(err)
	}
	if c.TenantID != g.tenantID || (g.sellers != nil && (c.SellerID == nil || !slices.Contains(g.sellers, *c.SellerID))) {
		return nil
	}
	facts := map[string]any{"code": c.Code, "initials": initials(c.Name), "tier": c.Tier, "stage": c.Stage, "points": c.Points,
		"source": c.Source, "since": c.CreatedAt, "tags": c.Tags}
	found := aimodule.CustomerFact{ID: c.ID, Code: c.Code, Initials: initials(c.Name), Tier: c.Tier}
	var last *time.Time
	err = g.s.DB.Pool.QueryRow(g.ctx, `select orders, spend, last_at from customer_metrics where customer_id = $1`, c.ID).Scan(&found.Orders, &found.Spend, &last)
	if err != nil && ignoreMissing(err) != nil {
		return err
	}
	facts["orders"], facts["spend"] = found.Orders, found.Spend
	if last != nil {
		facts["lastOrderAt"] = clock.Iso(*last)
	}
	g.f.Current = &aimodule.CurrentRecord{Kind: "customer", ID: c.ID, Facts: facts}
	g.f.Found.Customers = append(g.f.Found.Customers, found)
	g.f.Know(aimodule.KnownCustomers, c.ID)
	return nil
}

func (g *factGatherer) currentProduct(id string) error {
	products, err := g.s.productFacts(g.ctx, g.tenantID, "id = $2", []any{id}, 1)
	if err != nil || len(products) == 0 {
		return err
	}
	p := products[0]
	var units, revenue int64
	err = g.s.DB.Pool.QueryRow(g.ctx, `select coalesce(sum(units), 0), coalesce(sum(revenue), 0) from product_days
		where tenant_id = $1 and product_id = $2 and day >= $3`, g.tenantID, id, g.day(29)).Scan(&units, &revenue)
	if err != nil {
		return err
	}
	onHand, available := 0, 0
	for _, l := range p.Stock {
		onHand, available = onHand+l.OnHand, available+l.Available
	}
	g.f.Current = &aimodule.CurrentRecord{Kind: "product", ID: p.ID, Facts: map[string]any{
		"name": p.Name, "code": p.Code, "status": p.Status, "price": p.Price, "variants": p.Variants,
		"onHand": onHand, "available": available, "units30d": units, "revenue30d": revenue, "stock": p.Stock,
	}}
	if p.ActivateBlocker != "" {
		g.f.Current.Facts["cannotActivateBecause"] = p.ActivateBlocker
	}
	g.f.Found.Products = append(g.f.Found.Products, p.ProductFact)
	g.f.Found.Levels = append(g.f.Found.Levels, p.Stock...)
	g.f.Know(aimodule.KnownProducts, p.ID)
	return nil
}

// productRow is a product fact with its variant count, which only the open page shows.
type productRow struct {
	aimodule.ProductFact
	Variants int
}

// productFacts reads products matching where ($1 is the tenant, args follow) with stock per
// warehouse and the reason each cannot be activated.
func (s *Server) productFacts(ctx context.Context, tenantID, where string, args []any, limit int) ([]productRow, error) {
	products, err := queryDocs[domain.Product](ctx, s.DB.Pool,
		"select data from products where tenant_id = $1 and "+where+" order by data->>'name', id limit "+fmt.Sprint(limit), append([]any{tenantID}, args...)...)
	if err != nil || len(products) == 0 {
		return nil, err
	}
	defs, err := store.ListTenant[domain.AttributeDef](ctx, s.DB.Pool, "attributes", tenantID)
	if err != nil {
		return nil, err
	}
	categories, err := store.ListTenant[domain.Category](ctx, s.DB.Pool, "categories", tenantID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(products))
	for i, p := range products {
		ids[i] = p.ID
	}
	levels, err := s.stockFacts(ctx, "s.tenant_id = $1 and s.data->>'productId' = any($2)", "s.data->>'productId', w.data->>'name', s.id", 200, []any{tenantID, ids})
	if err != nil {
		return nil, err
	}
	out := make([]productRow, 0, len(products))
	for _, p := range products {
		row := productRow{ProductFact: aimodule.ProductFact{ID: p.ID, Code: p.Code, Name: p.Name, Status: p.Status, Price: p.Price,
			ActivateBlocker: rules.ProductActivateBlocker(p, rules.AttributesFor(p.CategoryID, defs, categories))}, Variants: len(p.Variants)}
		for _, l := range levels {
			if l.ProductID == p.ID {
				row.Stock = append(row.Stock, l)
			}
		}
		out = append(out, row)
	}
	return out, nil
}

// queryDocs reads the data column of a query into documents, keeping the query's own order.
func queryDocs[T any](ctx context.Context, q store.Querier, sql string, args ...any) ([]T, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (T, error) {
		var v T
		var raw []byte
		if err := r.Scan(&raw); err != nil {
			return v, err
		}
		return v, json.Unmarshal(raw, &v)
	})
}

func ignoreMissing(err error) error {
	if errors.Is(err, store.ErrNotFound) || errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}

// initials turns "Rina Sari Dewi" into "R. S.", so the model can tell customers apart without names.
func initials(name string) string {
	words := strings.Fields(name)
	var parts []string
	for _, word := range words[:min(2, len(words))] {
		parts = append(parts, strings.ToUpper(string([]rune(word)[0]))+".")
	}
	return strings.Join(parts, " ")
}

func clipText(text string, limit int) string {
	if r := []rune(text); len(r) > limit {
		return string(r[:limit])
	}
	return text
}
