package httpapi

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
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
// customer), stock levels at or under their reorder point, running and upcoming campaigns and
// promotions, segment sizes, the abandoned checkouts of the last 7 days and the five customers who
// spent most, by initials and customer code only. What it never receives: a customer's full name,
// email, phone, address, city or birthday, and any staff account detail.
//
// A sales user's facts cover their own orders and customers, the rule of seller_scope.go, and leave
// out products, sellers, stock, campaigns and promotions.

const (
	assistantTop       = 5
	assistantOrders    = 8
	assistantLowStock  = 10
	assistantCampaigns = 10
	assistantPromos    = 15
)

func (s *Server) assistantFacts(ctx context.Context, p auth.Principal, tenantID, page string) (aimodule.AssistantFacts, error) {
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", tenantID)
	if err != nil {
		return aimodule.AssistantFacts{}, err
	}
	sellers, err := s.ownSellers(ctx, p)
	if err != nil {
		return aimodule.AssistantFacts{}, err
	}
	now := s.Clock.Now().In(clock.WIB)
	f := aimodule.AssistantFacts{
		TenantID: tenantID, Role: p.Role, Store: tenant.Name, Today: now.Format(time.DateOnly), Page: page,
		Scope: "the whole brand", Known: map[string][]string{},
	}
	if sellers != nil {
		f.Scope = "only this sales person's own orders and assigned customers"
	}
	g := factGatherer{s: s, ctx: ctx, tenantID: tenantID, sellers: sellers, now: now, f: &f}
	steps := []func() error{g.sales, g.queue, g.customers}
	if sellers == nil {
		steps = append(steps, g.catalog, g.marketing)
	}
	steps = append(steps, func() error { return g.current(page) })
	for _, step := range steps {
		if err := step(); err != nil {
			return aimodule.AssistantFacts{}, err
		}
	}
	return f, nil
}

type factGatherer struct {
	s        *Server
	ctx      context.Context
	tenantID string
	// sellers is nil for a reader of the whole brand, else a sales user's seller profiles.
	sellers  []string
	now      time.Time
	products []domain.Product
	f        *aimodule.AssistantFacts
}

func (g *factGatherer) day(back int) string { return g.now.AddDate(0, 0, -back).Format(time.DateOnly) }

func (g *factGatherer) know(kind, id string) {
	if !slices.Contains(g.f.Known[kind], id) {
		g.f.Known[kind] = append(g.f.Known[kind], id)
	}
}

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
	rows, err := g.s.DB.Pool.Query(g.ctx, `select seller_id, sum(orders), sum(revenue) from sales_days
		where tenant_id = $1 and day >= $2 and seller_id is not null group by 1 order by 3 desc, 1 limit $3`, g.tenantID, g.day(29), assistantTop)
	if err != nil {
		return err
	}
	for rows.Next() {
		var r aimodule.RankedFact
		if err := rows.Scan(&r.ID, &r.Orders, &r.Revenue); err != nil {
			rows.Close()
			return err
		}
		g.f.TopSellers = append(g.f.TopSellers, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	sellers, err := store.ListTenant[domain.Seller](g.ctx, g.s.DB.Pool, "sellers", g.tenantID)
	if err != nil {
		return err
	}
	for i, r := range g.f.TopSellers {
		if j := slices.IndexFunc(sellers, func(x domain.Seller) bool { return x.ID == r.ID }); j >= 0 {
			g.f.TopSellers[i].Name = sellers[j].Name
		}
		g.know(aimodule.KnownSellers, r.ID)
	}
	return nil
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
	rows, err := g.s.DB.Pool.Query(g.ctx, fmt.Sprintf(`select id, code, status, payment_status, payment_method, created_at, total
		from order_rows where %s order by created_at, id limit %d`, where, assistantOrders), args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var o aimodule.OrderFact
		var method string
		var placed time.Time
		if err := rows.Scan(&o.ID, &o.Code, &o.Status, &o.Payment, &method, &placed, &o.Total); err != nil {
			return err
		}
		o.NextStatus, _ = rules.NextOrderStatus(o.Status, method)
		o.PlacedAt, o.Late = clock.Iso(placed), placed.Before(lateBefore)
		g.f.Orders = append(g.f.Orders, o)
		g.know(aimodule.KnownOrders, o.ID)
	}
	return rows.Err()
}

// customers counts segments and abandoned checkouts, and names the top spenders by initials.
func (g *factGatherer) customers() error {
	customers, err := store.ListTenant[domain.Customer](g.ctx, g.s.DB.Pool, "customers", g.tenantID)
	if err != nil {
		return err
	}
	if g.sellers != nil {
		customers = slices.DeleteFunc(customers, func(c domain.Customer) bool {
			return c.SellerID == nil || !slices.Contains(g.sellers, *c.SellerID)
		})
	}
	inScope := map[string]domain.Customer{}
	for _, c := range customers {
		inScope[c.ID] = c
	}
	metrics, err := readmodel.TenantCustomerMetrics(g.ctx, g.s.DB.Pool, g.tenantID)
	if err != nil {
		return err
	}
	nowMs := g.now.UnixMilli()
	rows := []rules.MetricsRow{}
	for _, m := range metrics {
		if _, ok := inScope[m.CustomerID]; !ok {
			continue
		}
		row := rules.MetricsRow{CustomerID: m.CustomerID, Orders: m.Orders, Spend: int(m.Spend), FirstAt: ms(m.FirstAt),
			LastAt: ms(m.LastAt), LastAbandonedAt: ms(m.LastAbandonedAt), LastPurchaseEventAt: ms(m.LastPurchaseEventAt)}
		rows = append(rows, row)
		if row.LastAbandonedAt > row.LastPurchaseEventAt && nowMs-row.LastAbandonedAt <= 7*clock.Day {
			g.f.AbandonedCarts7d++
		}
	}
	segCtx := rules.SegmentContextFromRows(rows, nowMs)
	segments, err := store.ListTenant[domain.Segment](g.ctx, g.s.DB.Pool, "segments", g.tenantID)
	if err != nil {
		return err
	}
	for _, seg := range segments {
		g.f.Segments = append(g.f.Segments, aimodule.SegmentFact{ID: seg.ID, Name: seg.Name, Customers: rules.AudienceSize(seg, customers, segCtx)})
		g.know(aimodule.KnownSegments, seg.ID)
	}
	slices.SortFunc(rows, func(a, b rules.MetricsRow) int {
		return cmp.Or(cmp.Compare(b.Spend, a.Spend), cmp.Compare(a.CustomerID, b.CustomerID))
	})
	for _, r := range rows[:min(assistantTop, len(rows))] {
		if r.Spend == 0 {
			break
		}
		c := inScope[r.CustomerID]
		g.f.Customers = append(g.f.Customers, aimodule.CustomerFact{ID: c.ID, Code: c.Code, Initials: initials(c.Name), Orders: r.Orders, Spend: int64(r.Spend)})
		g.know(aimodule.KnownCustomers, c.ID)
	}
	return nil
}

// catalog ranks products over 30 days and lists stock levels at or under their reorder point.
func (g *factGatherer) catalog() error {
	var err error
	if g.products, err = store.ListTenant[domain.Product](g.ctx, g.s.DB.Pool, "products", g.tenantID); err != nil {
		return err
	}
	rows, err := g.s.DB.Pool.Query(g.ctx, `select product_id, sum(orders), sum(units), sum(revenue) from product_days
		where tenant_id = $1 and day >= $2 group by 1 order by 4 desc, 1 limit $3`, g.tenantID, g.day(29), assistantTop)
	if err != nil {
		return err
	}
	for rows.Next() {
		var r aimodule.RankedFact
		if err := rows.Scan(&r.ID, &r.Orders, &r.Units, &r.Revenue); err != nil {
			rows.Close()
			return err
		}
		r.Name = g.productName(r.ID)
		g.f.TopProducts = append(g.f.TopProducts, r)
		g.know(aimodule.KnownProducts, r.ID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	levels, err := store.ListTenant[domain.StockLevel](g.ctx, g.s.DB.Pool, "stock", g.tenantID)
	if err != nil {
		return err
	}
	warehouses, err := store.ListTenant[domain.Warehouse](g.ctx, g.s.DB.Pool, "warehouses", g.tenantID)
	if err != nil {
		return err
	}
	low := slices.DeleteFunc(levels, func(l domain.StockLevel) bool { return l.OnHand-l.Reserved > l.Safety })
	g.f.LowStockTotal = len(low)
	// The furthest under the reorder point first.
	slices.SortStableFunc(low, func(a, b domain.StockLevel) int {
		return cmp.Or(cmp.Compare(a.OnHand-a.Reserved-a.Safety, b.OnHand-b.Reserved-b.Safety), cmp.Compare(a.ID, b.ID))
	})
	for _, l := range low[:min(assistantLowStock, len(low))] {
		fact := aimodule.StockFact{LevelID: l.ID, Product: g.productName(l.ProductID), OnHand: l.OnHand, Reserved: l.Reserved,
			Available: l.OnHand - l.Reserved, ReorderPoint: l.Safety, ProductID: l.ProductID, VariantID: l.VariantID, WarehouseID: l.WarehouseID}
		if i := slices.IndexFunc(g.products, func(p domain.Product) bool { return p.ID == l.ProductID }); i >= 0 {
			if j := slices.IndexFunc(g.products[i].Variants, func(v domain.Variant) bool { return v.ID == l.VariantID }); j >= 0 {
				fact.SKU = g.products[i].Variants[j].Sku
			}
		}
		if i := slices.IndexFunc(warehouses, func(w domain.Warehouse) bool { return w.ID == l.WarehouseID }); i >= 0 {
			fact.Warehouse = warehouses[i].Name
		}
		g.f.LowStock = append(g.f.LowStock, fact)
		g.know(aimodule.KnownProducts, l.ProductID)
	}
	return nil
}

func (g *factGatherer) productName(id string) string {
	if i := slices.IndexFunc(g.products, func(p domain.Product) bool { return p.ID == id }); i >= 0 {
		return g.products[i].Name
	}
	return id
}

// marketing lists the campaigns and promotions that are live, coming or paused.
func (g *factGatherer) marketing() error {
	campaigns, err := store.ListTenant[domain.Campaign](g.ctx, g.s.DB.Pool, "campaigns", g.tenantID)
	if err != nil {
		return err
	}
	for _, c := range campaigns {
		if len(g.f.Campaigns) == assistantCampaigns || !slices.Contains([]string{"running", "scheduled", "paused"}, c.Status) {
			continue
		}
		g.f.Campaigns = append(g.f.Campaigns, aimodule.CampaignFact{ID: c.ID, Name: c.Name, Status: c.Status, StartAt: c.StartAt,
			EndAt: c.EndAt, Budget: c.Budget, Revenue: c.Revenue, Funnel: c.Funnel})
		g.know(aimodule.KnownCampaigns, c.ID)
	}
	promotions, err := store.ListTenant[domain.Promotion](g.ctx, g.s.DB.Pool, "promotions", g.tenantID)
	if err != nil {
		return err
	}
	rank := map[string]int{"active": 0, "scheduled": 1, "paused": 2, "draft": 3}
	promotions = slices.DeleteFunc(promotions, func(p domain.Promotion) bool { _, ok := rank[p.Status]; return !ok })
	slices.SortStableFunc(promotions, func(a, b domain.Promotion) int { return cmp.Compare(rank[a.Status], rank[b.Status]) })
	for _, p := range promotions[:min(assistantPromos, len(promotions))] {
		g.f.Promotions = append(g.f.Promotions, aimodule.PromotionFact{ID: p.ID, Code: p.Code, Name: p.Name, Kind: p.Kind, Value: p.Value,
			Status: p.Status, StartAt: p.StartAt, EndAt: p.EndAt, Used: p.Used, Revenue: p.Revenue})
		g.know(aimodule.KnownPromotions, p.ID)
	}
	return nil
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
	g.f.Current = &aimodule.CurrentRecord{Kind: "order", ID: o.ID, Facts: map[string]any{
		"code": o.Code, "status": o.Status, "nextStatus": o.NextStatus, "payment": o.Payment, "paymentMethod": method,
		"placedAt": o.PlacedAt, "total": o.Total, "items": items, "channel": channel,
		"customer": initials(customerName) + " (" + customerCode + ")",
	}}
	if !slices.ContainsFunc(g.f.Orders, func(x aimodule.OrderFact) bool { return x.ID == o.ID }) && o.NextStatus != "" &&
		slices.Contains([]string{"paid", "processing", "packed"}, o.Status) {
		g.f.Orders = append(g.f.Orders, o)
	}
	g.know(aimodule.KnownOrders, o.ID)
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
	var orders int
	var spend int64
	var last *time.Time
	err = g.s.DB.Pool.QueryRow(g.ctx, `select orders, spend, last_at from customer_metrics where customer_id = $1`, c.ID).Scan(&orders, &spend, &last)
	if err != nil && ignoreMissing(err) != nil {
		return err
	}
	facts["orders"], facts["spend"] = orders, spend
	if last != nil {
		facts["lastOrderAt"] = clock.Iso(*last)
	}
	g.f.Current = &aimodule.CurrentRecord{Kind: "customer", ID: c.ID, Facts: facts}
	g.know(aimodule.KnownCustomers, c.ID)
	return nil
}

func (g *factGatherer) currentProduct(id string) error {
	i := slices.IndexFunc(g.products, func(p domain.Product) bool { return p.ID == id })
	if i < 0 {
		return nil
	}
	p := g.products[i]
	var onHand, reserved int
	var units, revenue int64
	err := g.s.DB.Pool.QueryRow(g.ctx, `select coalesce(sum((data->>'onHand')::int), 0), coalesce(sum((data->>'reserved')::int), 0)
		from stock where tenant_id = $1 and data->>'productId' = $2`, g.tenantID, id).Scan(&onHand, &reserved)
	if err != nil {
		return err
	}
	err = g.s.DB.Pool.QueryRow(g.ctx, `select coalesce(sum(units), 0), coalesce(sum(revenue), 0) from product_days
		where tenant_id = $1 and product_id = $2 and day >= $3`, g.tenantID, id, g.day(29)).Scan(&units, &revenue)
	if err != nil {
		return err
	}
	g.f.Current = &aimodule.CurrentRecord{Kind: "product", ID: p.ID, Facts: map[string]any{
		"name": p.Name, "code": p.Code, "status": p.Status, "price": p.Price, "variants": len(p.Variants),
		"onHand": onHand, "available": onHand - reserved, "units30d": units, "revenue30d": revenue,
	}}
	g.know(aimodule.KnownProducts, p.ID)
	return nil
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

func ms(at *time.Time) int64 {
	if at == nil {
		return 0
	}
	return at.UnixMilli()
}
