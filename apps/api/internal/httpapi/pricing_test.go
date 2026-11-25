package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// priceBook reads what the server prices a shopper's order from.
func (e *env) priceBook(tenantID string) rules.PriceBook {
	e.t.Helper()
	ctx := context.Background()
	tenant, err := store.Get[domain.Tenant](ctx, e.db.Pool, "tenants", tenantID)
	if err != nil {
		e.t.Fatal(err)
	}
	b := rules.PriceBook{Tenant: tenant, Now: clock.MustParse(clock.FixtureNow).UnixMilli()}
	if b.Products, err = store.ListTenant[domain.Product](ctx, e.db.Pool, "products", tenantID); err != nil {
		e.t.Fatal(err)
	}
	if b.Modifiers, err = store.ListTenant[domain.ModifierGroup](ctx, e.db.Pool, "modifiers", tenantID); err != nil {
		e.t.Fatal(err)
	}
	if b.Promotions, err = store.ListTenant[domain.Promotion](ctx, e.db.Pool, "promotions", tenantID); err != nil {
		e.t.Fatal(err)
	}
	if b.Categories, err = store.ListTenant[domain.Category](ctx, e.db.Pool, "categories", tenantID); err != nil {
		e.t.Fatal(err)
	}
	if p, err := store.Get[domain.AgentPolicy](ctx, e.db.Pool, "agentPolicies", tenantID); err == nil {
		b.AgentPolicy = &p
	}
	return b
}

// price gives a test order the amounts the storefront would show for it, so the server takes it.
// Seeded orders come from the fixture generator, not the storefront: their voucher may have closed
// and their courier may be one the storefront does not offer, so the order ships by JNE without one.
func (e *env) price(order map[string]any) {
	e.t.Helper()
	order["voucherCode"], order["courier"] = nil, "jne"
	raw, _ := json.Marshal(order)
	var o domain.Order
	if err := json.Unmarshal(raw, &o); err != nil {
		e.t.Fatal(err)
	}
	priced, why := rules.PriceShopperOrder(o, e.priceBook(o.TenantID))
	if why != "" {
		e.t.Fatalf("price %s: %s", o.ID, why)
	}
	order["lines"], order["subtotal"], order["discount"], order["discountLines"] = priced.Lines, priced.Subtotal, priced.Discount, priced.DiscountLines
	order["shipping"], order["total"], order["pointsEarned"] = priced.Shipping, priced.Total, priced.PointsEarned
}

// placeRefusal posts a shopper's order and returns the status, problem code and sentence.
func (e *env) placeRefusal(body any) (int, string, string) {
	e.t.Helper()
	raw, _ := json.Marshal(body)
	res, err := http.Post(e.url+"/shop/lari/orders", "application/json", bytes.NewReader(raw))
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var p struct {
		Code   string `json:"code"`
		Detail string `json:"detail"`
	}
	_ = json.NewDecoder(res.Body).Decode(&p)
	return res.StatusCode, p.Code, p.Detail
}

func guestFor(id string) map[string]any {
	return map[string]any{"id": id, "tenantId": "ten-lari", "code": "LARI-C00001", "name": "Guest", "email": id + "@example.com"}
}

// A shopper's browser cannot set what the order costs: any amount other than the store's own is
// refused with PRICE_CHANGED and nothing is stored.
func TestShopperOrderIsPricedOnTheServer(t *testing.T) {
	e := setup(t)
	tampered := map[string]func(o map[string]any){
		"unit price": func(o map[string]any) {
			lines := o["lines"].([]domain.OrderLine)
			lines[0].Price = 1
			o["subtotal"], o["total"] = lines[0].Qty, lines[0].Qty+o["shipping"].(int)
		},
		"discount": func(o map[string]any) { o["discount"] = o["subtotal"]; o["total"] = o["shipping"] },
		"shipping": func(o map[string]any) { o["shipping"] = o["shipping"].(int) + 5_000 },
		"total":    func(o map[string]any) { o["total"] = 1 },
		"voucher":  func(o map[string]any) { o["voucherCode"] = "NOT-A-CODE" },
	}
	for name, change := range tampered {
		id := "ord-tamper-" + name
		order := e.placeable(id, "cus-tamper")
		change(order)
		status, code, detail := e.placeRefusal(map[string]any{"order": order, "customer": guestFor("cus-tamper")})
		if status != http.StatusConflict || code != "PRICE_CHANGED" || detail != rules.PriceChanged {
			t.Errorf("%s: %d %s %q", name, status, code, detail)
		}
		if _, err := store.Get[domain.Order](context.Background(), e.db.Pool, "orders", id); err == nil {
			t.Errorf("%s: the order was stored", name)
		}
	}
	order := e.placeable("ord-priced", "cus-priced")
	e.expect(200, "POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guestFor("cus-priced")})
	if got := e.order("ord-priced"); got.Total != order["total"] {
		t.Errorf("stored total %d, priced %v", got.Total, order["total"])
	}
}

// The last use of a promotion goes to one checkout; the others are told the price changed.
func TestLastPromotionUseGoesToOneCheckout(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	now := clock.MustParse(clock.FixtureNow)
	limit := 1
	promo := domain.Promotion{ID: "pro-last", TenantID: "ten-lari", Code: "LASTONE", Name: "Last one", Kind: "fixed",
		Trigger: "code", Value: 10_000, Status: "active", UsageLimit: &limit,
		StartAt: clock.Iso(now.AddDate(0, 0, -1)), EndAt: clock.Iso(now.AddDate(0, 0, 7)),
		CategoryIDs: []string{}, ProductIDs: []string{}, PaymentTypeIDs: []string{}}
	if err := store.Put(ctx, e.db.Pool, "promotions", promo.ID, promo); err != nil {
		t.Fatal(err)
	}
	const n = 4
	bodies := make([]map[string]any, n)
	for i := range n {
		id := fmt.Sprintf("cus-last-%d", i)
		order := e.placeable(fmt.Sprintf("ord-last-%d", i), id)
		order["voucherCode"] = "LASTONE"
		raw, _ := json.Marshal(order)
		var o domain.Order
		_ = json.Unmarshal(raw, &o)
		priced, why := rules.PriceShopperOrder(o, e.priceBook("ten-lari"))
		if why != "" {
			t.Fatal(why)
		}
		order["discount"], order["discountLines"], order["total"] = priced.Discount, priced.DiscountLines, priced.Total
		bodies[i] = map[string]any{"order": order, "customer": guestFor(id)}
	}
	codes := make([]int, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() { codes[i], _, _ = e.placeRefusal(bodies[i]) })
	}
	wg.Wait()
	placed := 0
	for _, code := range codes {
		if code == 200 {
			placed++
		} else if code != http.StatusConflict {
			t.Errorf("status %d", code)
		}
	}
	got, err := store.Get[domain.Promotion](ctx, e.db.Pool, "promotions", "pro-last")
	if placed != 1 || err != nil || got.Used != 1 {
		t.Fatalf("%d checkouts took the last use; used %d (%v)", placed, got.Used, err)
	}
}

// A buying agent's discount counts only up to the brand's policy.
func TestAgentDiscountAboveThePolicyIsRefused(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	order := e.placeable("ord-agent", "cus-agent")
	payment := "pay-lari-qris"
	order["paymentTypeId"], order["paymentMethod"] = payment, "qris"
	e.price(order)
	policy := domain.AgentPolicy{TenantID: "ten-lari", Enabled: true, Negotiation: true, MaxAutoDiscountPct: 5,
		PaymentTypeIDs: []string{payment}, Kinds: []string{"chat_assistant"}}
	if err := store.Put(ctx, e.db.Pool, "agentPolicies", "ten-lari", policy); err != nil {
		t.Fatal(err)
	}
	order["channel"], order["agent"] = "agent", map[string]any{"kind": "chat_assistant"}
	payable := order["subtotal"].(int) - order["discount"].(int)
	limit := rules.AgentDiscountCap(domain.Order{Agent: &domain.AgentOrderInfo{Kind: "chat_assistant"}, PaymentTypeID: &payment}, &policy, payable)
	if limit <= 0 {
		t.Fatalf("no room for a discount on %d", payable)
	}
	negotiate := func(amount int) map[string]any {
		o := map[string]any{}
		for k, v := range order {
			o[k] = v
		}
		lines := append([]domain.DiscountLine{}, order["discountLines"].([]domain.DiscountLine)...)
		o["discountLines"] = append(lines, domain.DiscountLine{PromotionID: rules.AgentNegotiationID, Label: "Agent negotiation", Amount: amount})
		o["discount"], o["total"] = order["discount"].(int)+amount, order["total"].(int)-amount
		return o
	}
	status, code, detail := e.placeRefusal(map[string]any{"order": negotiate(limit + 1_000), "customer": guestFor("cus-agent")})
	if status != http.StatusConflict || code != "PRICE_CHANGED" || detail != rules.AgentDiscountRefused {
		t.Errorf("above the policy: %d %s %q", status, code, detail)
	}
	e.expect(200, "POST", "/shop/lari/orders", "", map[string]any{"order": negotiate(limit), "customer": guestFor("cus-agent")})
	if got := e.order("ord-agent"); got.Agent == nil || got.Agent.Negotiated != limit {
		t.Errorf("stored agent info %+v", got.Agent)
	}
}
