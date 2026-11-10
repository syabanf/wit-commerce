// Package rules holds the business rules the apps already share (packages/fixtures: derive.ts,
// rules.ts, pricing.ts), ported line for line so the server refuses exactly what the UI refuses.
package rules

import (
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// OrderStatusFlow is the happy path of an order.
var OrderStatusFlow = []string{"new", "confirmed", "paid", "processing", "packed", "shipped", "delivered", "completed"}

// OrderStatusLabel is ORDER_STATUS_LABEL.
var OrderStatusLabel = map[string]string{
	"new": "New", "confirmed": "Confirmed", "paid": "Paid", "processing": "Processing", "packed": "Packed",
	"shipped": "Shipped", "delivered": "Delivered", "completed": "Completed", "cancelled": "Cancelled",
	"returned": "Returned", "refunded": "Refunded",
}

// SectionKindLabel is SECTION_KIND_LABEL.
var SectionKindLabel = map[string]string{
	"hero": "Hero", "category": "Shop by category", "featured_product": "Featured products",
	"collection": "Collection grid", "promotion": "Promotion banner", "countdown": "Countdown",
	"testimonials": "Testimonials", "comparison": "Product comparison", "brand_story": "Brand story",
	"faq": "FAQ", "cta": "Call to action", "footer": "Footer",
}

var sold = map[string]bool{"paid": true, "processing": true, "packed": true, "shipped": true, "delivered": true, "completed": true}

// IsSold is true once an order counts as revenue.
func IsSold(o domain.Order) bool { return sold[o.Status] }

// Demand is units needed per key (variant id or modifier option id), in first-seen order.
type Demand struct {
	Keys []string
	Qty  map[string]int
}

func (d *Demand) add(key string, qty int) {
	if d.Qty == nil {
		d.Qty = map[string]int{}
	}
	if _, seen := d.Qty[key]; !seen {
		d.Keys = append(d.Keys, key)
	}
	d.Qty[key] += qty
}

// VariantDemand sums units per variant across the order's lines.
func VariantDemand(o domain.Order) Demand {
	var d Demand
	for _, l := range o.Lines {
		d.add(l.VariantID, l.Qty)
	}
	return d
}

// ModifierDemand sums units per modifier option across the order's lines.
func ModifierDemand(o domain.Order) Demand {
	var d Demand
	for _, l := range o.Lines {
		for _, m := range l.Modifiers {
			d.add(m.OptionID, l.Qty)
		}
	}
	return d
}

// NextOrderStatus is the status an order moves to next; cash on delivery skips "paid".
func NextOrderStatus(status, paymentMethod string) (string, bool) {
	for i, s := range OrderStatusFlow {
		if s != status {
			continue
		}
		if i == len(OrderStatusFlow)-1 {
			return "", false
		}
		next := OrderStatusFlow[i+1]
		if next == "paid" && paymentMethod == "cod" {
			return "processing", true
		}
		return next, true
	}
	return "", false
}

// AttributesFor lists the definitions that apply to a product: global ones plus those on its
// category or the category's parent.
func AttributesFor(categoryID string, defs []domain.AttributeDef, categories []domain.Category) []domain.AttributeDef {
	var parent string
	for _, c := range categories {
		if c.ID == categoryID && c.ParentID != nil {
			parent = *c.ParentID
		}
	}
	var out []domain.AttributeDef
	for _, d := range defs {
		if len(d.CategoryIDs) == 0 || contains(d.CategoryIDs, categoryID) || (parent != "" && contains(d.CategoryIDs, parent)) {
			out = append(out, d)
		}
	}
	return out
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// --- customers and segments ---

// CustomerMetrics is order count, spend and recency per customer from sold orders.
type CustomerMetrics struct {
	Orders        int
	Spend         int
	FirstAt       int64
	LastAt        int64
	DaysSinceLast int
	HasOrders     bool
}

func customerMetrics(orders []domain.Order, now int64) map[string]*CustomerMetrics {
	out := map[string]*CustomerMetrics{}
	for _, o := range orders {
		if !IsSold(o) {
			continue
		}
		m := out[o.CustomerID]
		if m == nil {
			m = &CustomerMetrics{}
			out[o.CustomerID] = m
		}
		at := clock.Ms(o.CreatedAt)
		m.Orders++
		m.Spend += o.Total - o.RefundedAmount
		if !m.HasOrders || at < m.FirstAt {
			m.FirstAt = at
		}
		if !m.HasOrders || at > m.LastAt {
			m.LastAt = at
		}
		m.HasOrders = true
	}
	for _, m := range out {
		m.DaysSinceLast = int((now - m.LastAt) / clock.Day)
	}
	return out
}

// abandonedCheckouts lists customers with a checkout abandoned in the last 7 days and no later purchase.
func abandonedCheckouts(events []domain.CustomerEvent, now int64) map[string]bool {
	type last struct{ abandoned, purchased int64 }
	seen := map[string]*last{}
	for _, e := range events {
		if e.Kind != "checkout_abandoned" && e.Kind != "purchase" {
			continue
		}
		at := clock.Ms(e.At)
		row := seen[e.CustomerID]
		if row == nil {
			row = &last{}
			seen[e.CustomerID] = row
		}
		if e.Kind == "checkout_abandoned" {
			row.abandoned = max(row.abandoned, at)
		} else {
			row.purchased = max(row.purchased, at)
		}
	}
	out := map[string]bool{}
	for id, row := range seen {
		if row.abandoned > row.purchased && now-row.abandoned <= 7*clock.Day {
			out[id] = true
		}
	}
	return out
}

// SegmentContext is what segment rules read.
type SegmentContext struct {
	metrics   map[string]*CustomerMetrics
	abandoned map[string]bool
}

// NewSegmentContext builds the metrics from one tenant's orders and events.
func NewSegmentContext(orders []domain.Order, events []domain.CustomerEvent, now int64) SegmentContext {
	return SegmentContext{metrics: customerMetrics(orders, now), abandoned: abandonedCheckouts(events, now)}
}

func compare(actual int, op string, value int) bool {
	switch op {
	case "gt":
		return actual > value
	case "lt":
		return actual < value
	}
	return actual == value
}

func atoi(s string) int {
	n := 0
	neg := false
	for i, ch := range s {
		if i == 0 && ch == '-' {
			neg = true
			continue
		}
		if ch < '0' || ch > '9' {
			return 0
		}
		n = n*10 + int(ch-'0')
	}
	if neg {
		return -n
	}
	return n
}

func ruleMatches(rule domain.SegmentRule, c domain.Customer, ctx SegmentContext) bool {
	m := ctx.metrics[c.ID]
	if m == nil {
		m = &CustomerMetrics{}
	}
	n := atoi(rule.Value)
	switch rule.Field {
	case "orders":
		return compare(m.Orders, rule.Op, n)
	case "spend":
		return compare(m.Spend, rule.Op, n)
	case "days_since_purchase":
		return m.HasOrders && compare(m.DaysSinceLast, rule.Op, n)
	case "tier":
		return c.Tier == rule.Value
	case "stage":
		return c.Stage == rule.Value
	case "interest":
		return contains(c.Interests, rule.Value)
	case "city":
		return c.City == rule.Value
	case "abandoned_cart":
		return ctx.abandoned[c.ID] == (rule.Value == "yes")
	}
	return false
}

// InSegment reports whether a customer matches the segment's rules.
func InSegment(s domain.Segment, c domain.Customer, ctx SegmentContext) bool {
	if len(s.Rules) == 0 {
		return false
	}
	for _, r := range s.Rules {
		ok := ruleMatches(r, c, ctx)
		if s.Match == "all" && !ok {
			return false
		}
		if s.Match != "all" && ok {
			return true
		}
	}
	return s.Match == "all"
}

// AudienceSize counts a tenant's customers in a segment.
func AudienceSize(s domain.Segment, customers []domain.Customer, ctx SegmentContext) int {
	n := 0
	for _, c := range customers {
		if InSegment(s, c, ctx) {
			n++
		}
	}
	return n
}

// --- pages ---

// ApplyTemplate lays the template's sections over a page's content. Each section takes the copy of
// the first unused section of the same kind, so headline, body, products, CTA, image and items survive
// a change. The template sets the order again, so a hand-made order is dropped.
func ApplyTemplate(content []domain.PageSection, t domain.Template, pageID string) []domain.PageSection {
	pool := append([]domain.PageSection(nil), content...)
	out := make([]domain.PageSection, 0, len(t.Sections))
	for i, ts := range t.Sections {
		var from *domain.PageSection
		for j, s := range pool {
			if s.Kind == ts.Kind {
				copyOf := s
				from = &copyOf
				pool = append(pool[:j], pool[j+1:]...)
				break
			}
		}
		section := domain.PageSection{
			ID:         pageID + "-" + ts.Kind + "-" + itoa(i),
			Kind:       ts.Kind,
			Rule:       ts.Rule,
			ProductIDs: []string{},
		}
		if from != nil {
			section.ID = from.ID
			section.Headline = from.Headline
			section.Body = from.Body
			section.ProductIDs = from.ProductIDs
			section.CtaLabel = from.CtaLabel
			section.ImageURL = from.ImageURL
			section.CtaHref = from.CtaHref
			section.Items = from.Items
			if section.ProductIDs == nil {
				section.ProductIDs = []string{}
			}
		}
		out = append(out, section)
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// FirstName is "Fahmi" from "Fahmi Rahman".
func FirstName(name string) string {
	if i := strings.IndexByte(name, ' '); i > 0 {
		return name[:i]
	}
	return name
}
