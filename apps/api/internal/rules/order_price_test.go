package rules

import (
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

func ptr[T any](v T) *T { return &v }

// priceBook is a small store: running shoes with two sizes and gift wrap, socks, an automatic 10% on
// running gear, a socks code, and codes that must not apply (ended, segment-only, used up).
func priceBook() PriceBook {
	now := clock.MustParse(clock.FixtureNow)
	open := func(p domain.Promotion) domain.Promotion {
		p.TenantID, p.Status = "ten-x", "active"
		p.StartAt, p.EndAt = clock.Iso(now.AddDate(0, 0, -1)), clock.Iso(now.AddDate(0, 0, 7))
		return p
	}
	ended := open(domain.Promotion{ID: "pro-ended", Code: "ENDED", Name: "Ended", Kind: "fixed", Trigger: "code", Value: 10_000})
	ended.EndAt = clock.Iso(now.Add(-1))
	return PriceBook{
		Tenant: domain.Tenant{ID: "ten-x", Loyalty: domain.LoyaltyConfig{PointsPer10k: 2, FreeShippingMin: 500_000}},
		Products: []domain.Product{
			{ID: "prd-shoe", CategoryID: "cat-road", Status: "active", Variants: []domain.Variant{
				{ID: "var-shoe-41", Price: 800_000}, {ID: "var-shoe-42", Price: 850_000},
			}},
			{ID: "prd-sock", CategoryID: "cat-socks", Status: "active", Variants: []domain.Variant{{ID: "var-sock", Price: 50_000}}},
			{ID: "prd-old", CategoryID: "cat-socks", Status: "archived", Variants: []domain.Variant{{ID: "var-old", Price: 10_000}}},
		},
		Modifiers: []domain.ModifierGroup{{ID: "mod-wrap", Options: []domain.ModifierOption{{ID: "opt-wrap", Name: "Gift wrap", PriceDelta: 25_000}}}},
		Categories: []domain.Category{
			{ID: "cat-run", Name: "Running"}, {ID: "cat-road", Name: "Road", ParentID: ptr("cat-run")}, {ID: "cat-socks", Name: "Socks"},
		},
		Promotions: []domain.Promotion{
			open(domain.Promotion{ID: "pro-run", Name: "Run week", Kind: "percentage", Trigger: "automatic", Value: 10,
				MaxDiscount: ptr(100_000), CategoryIDs: []string{"cat-run"}}),
			open(domain.Promotion{ID: "pro-socks", Code: "SOCKS", Name: "Socks off", Kind: "fixed", Trigger: "code", Value: 20_000,
				ProductIDs: []string{"prd-sock"}}),
			ended,
			open(domain.Promotion{ID: "pro-vip", Code: "VIP", Name: "VIP", Kind: "fixed", Trigger: "code", Value: 50_000, SegmentID: ptr("seg-vip")}),
			open(domain.Promotion{ID: "pro-gone", Code: "GONE", Name: "Gone", Kind: "fixed", Trigger: "code", Value: 5_000, UsageLimit: ptr(3), Used: 3}),
		},
		Now: now.UnixMilli(),
	}
}

// basket is a 42 with gift wrap and two pairs of socks under the SOCKS code, as the storefront
// prices it: 875.000 + 100.000, minus 87.500 (10% of the shoe) and 20.000, shipped free.
func basket() domain.Order {
	return domain.Order{
		ID: "ord-x", TenantID: "ten-x", CustomerID: "cus-x", Courier: "jne", PaymentTypeID: ptr("pay-qris"),
		Lines: []domain.OrderLine{
			{ProductID: "prd-shoe", VariantID: "var-shoe-42", Qty: 1, Price: 875_000,
				Modifiers: []domain.OrderLineModifier{{GroupID: "mod-wrap", OptionID: "opt-wrap", Name: "Gift wrap", PriceDelta: 25_000}}},
			{ProductID: "prd-sock", VariantID: "var-sock", Qty: 2, Price: 50_000},
		},
		Subtotal: 975_000, Discount: 107_500, Shipping: 0, Total: 867_500, VoucherCode: ptr("SOCKS"),
		DiscountLines: []domain.DiscountLine{{PromotionID: "pro-run", Label: "Run week", Amount: 87_500}, {PromotionID: "pro-socks", Label: "SOCKS · Socks off", Amount: 20_000}},
	}
}

func TestShopperOrderPricedLikeTheStorefront(t *testing.T) {
	got, why := RepriceShopperOrder(basket(), priceBook())
	if why != "" {
		t.Fatalf("refused: %s", why)
	}
	if got.Total != 867_500 || got.PointsEarned != 86*2 {
		t.Errorf("total %d, points %d", got.Total, got.PointsEarned)
	}
	if len(got.DiscountLines) != 2 || got.DiscountLines[1].PromotionID != "pro-socks" || got.DiscountLines[1].Label != "SOCKS · Socks off" {
		t.Errorf("discount lines %+v", got.DiscountLines)
	}
}

func TestShopperOrderOfAPKPBrandCarriesPPN(t *testing.T) {
	b := priceBook()
	b.Tenant.Tax = &domain.TaxSettings{PKP: true, PricesIncludeTax: false, Profile: "standard"}
	o := basket()
	tax := ComputeOrderTax(o.Lines, o.Discount, *b.Tenant.Tax, func(id string) string { return "" })
	if tax.PPN <= 0 {
		t.Fatalf("no PPN: %+v", tax)
	}
	o.Total += tax.PPN
	got, why := RepriceShopperOrder(o, b)
	if why != "" {
		t.Fatalf("refused: %s", why)
	}
	if got.Tax == nil || got.Tax.PPN != tax.PPN || got.PointsEarned != got.Total/10_000*2 {
		t.Errorf("tax %+v, total %d, points %d", got.Tax, got.Total, got.PointsEarned)
	}
	// The same order without its PPN is a price the shopper did not see.
	if _, why := RepriceShopperOrder(basket(), b); why != PriceChanged {
		t.Errorf("total without PPN: %q", why)
	}
}

func TestShopperOrderBelowFreeShippingPaysTheCourier(t *testing.T) {
	o := domain.Order{TenantID: "ten-x", Courier: "sicepat",
		Lines:    []domain.OrderLine{{ProductID: "prd-sock", VariantID: "var-sock", Qty: 1, Price: 50_000}},
		Subtotal: 50_000, Shipping: 15_000, Total: 65_000}
	if _, why := RepriceShopperOrder(o, priceBook()); why != "" {
		t.Fatalf("refused: %s", why)
	}
	free := o
	free.Shipping, free.Total = 0, 50_000
	if _, why := RepriceShopperOrder(free, priceBook()); why != PriceChanged {
		t.Errorf("free shipping under the threshold: %q", why)
	}
	b := priceBook()
	b.Tenant.ShippingCouriers = []string{"jne"}
	if _, why := RepriceShopperOrder(o, b); why != PriceChanged {
		t.Errorf("a courier the store does not offer: %q", why)
	}
	unknown := o
	unknown.Courier = "drone"
	if _, why := RepriceShopperOrder(unknown, priceBook()); why != PriceChanged {
		t.Errorf("an unknown courier: %q", why)
	}
}

func TestTamperedShopperOrdersAreRefused(t *testing.T) {
	cases := map[string]func(o *domain.Order){
		"unit price":        func(o *domain.Order) { o.Lines[1].Price = 1 },
		"add-on left out":   func(o *domain.Order) { o.Lines[0].Modifiers = nil },
		"discount":          func(o *domain.Order) { o.Discount += 1 },
		"shipping":          func(o *domain.Order) { o.Shipping = 18_000; o.Total += 18_000 },
		"total":             func(o *domain.Order) { o.Total = 1 },
		"subtotal":          func(o *domain.Order) { o.Subtotal = 1 },
		"zero quantity":     func(o *domain.Order) { o.Lines[1].Qty = 0 },
		"negative quantity": func(o *domain.Order) { o.Lines[1].Qty = -5 },
		"archived product":  func(o *domain.Order) { o.Lines[1].ProductID, o.Lines[1].VariantID = "prd-old", "var-old" },
		"variant of another product": func(o *domain.Order) {
			o.Lines[1].VariantID = "var-shoe-41"
		},
		"unknown add-on":     func(o *domain.Order) { o.Lines[0].Modifiers[0].OptionID = "opt-free" },
		"ended code":         func(o *domain.Order) { o.VoucherCode = ptr("ENDED") },
		"segment-only code":  func(o *domain.Order) { o.VoucherCode = ptr("VIP") },
		"used-up code":       func(o *domain.Order) { o.VoucherCode = ptr("GONE") },
		"code that is not":   func(o *domain.Order) { o.VoucherCode = ptr("FREE100") },
		"agent line, no bot": func(o *domain.Order) { addAgentLine(o, 1_000) },
	}
	for name, change := range cases {
		o := basket()
		change(&o)
		if _, why := RepriceShopperOrder(o, priceBook()); why == "" {
			t.Errorf("%s: placed", name)
		}
	}
	// Prices the shopper never saw keep the order as sent, so nothing of it is stored.
	o := basket()
	o.Total = 1
	if got, _ := RepriceShopperOrder(o, priceBook()); got.Total != 1 {
		t.Errorf("refused order changed: %d", got.Total)
	}
}

func addAgentLine(o *domain.Order, amount int) {
	o.DiscountLines = append(o.DiscountLines, domain.DiscountLine{PromotionID: AgentNegotiationID, Label: "Negosiasi agen", Amount: amount})
	o.Discount += amount
	o.Total -= amount
}

// agentOrder is a 41 bought by a chat assistant with QRIS: 800.000 minus the automatic 80.000, so the
// agent may take up to 5% of 720.000 = 36.000 under the policy.
func agentOrder(negotiated int) domain.Order {
	o := domain.Order{TenantID: "ten-x", Courier: "jne", PaymentTypeID: ptr("pay-qris"), Channel: "agent",
		Lines:    []domain.OrderLine{{ProductID: "prd-shoe", VariantID: "var-shoe-41", Qty: 1, Price: 800_000}},
		Subtotal: 800_000, Discount: 80_000, Total: 720_000,
		Agent:         &domain.AgentOrderInfo{Kind: "chat_assistant"},
		DiscountLines: []domain.DiscountLine{{PromotionID: "pro-run", Label: "Run week", Amount: 80_000}}}
	if negotiated > 0 {
		addAgentLine(&o, negotiated)
	}
	return o
}

func agentBook() PriceBook {
	b := priceBook()
	b.AgentPolicy = &domain.AgentPolicy{TenantID: "ten-x", Enabled: true, Negotiation: true, MaxAutoDiscountPct: 5,
		PaymentTypeIDs: []string{"pay-qris"}, Kinds: []string{"chat_assistant"}}
	return b
}

func TestAgentDiscountStaysInsideThePolicy(t *testing.T) {
	got, why := RepriceShopperOrder(agentOrder(36_000), agentBook())
	if why != "" {
		t.Fatalf("refused: %s", why)
	}
	if got.Total != 684_000 || got.Agent.Negotiated != 36_000 || got.DiscountLines[1].Label != "Negosiasi agen" {
		t.Errorf("total %d, negotiated %d, lines %+v", got.Total, got.Agent.Negotiated, got.DiscountLines)
	}
	if _, why := RepriceShopperOrder(agentOrder(0), agentBook()); why != "" {
		t.Errorf("no negotiation: %s", why)
	}
	if _, why := RepriceShopperOrder(agentOrder(37_000), agentBook()); why != AgentDiscountRefused {
		t.Errorf("above the policy: %q", why)
	}
	refused := map[string]func(b *PriceBook, o *domain.Order){
		"policy off":          func(b *PriceBook, _ *domain.Order) { b.AgentPolicy.Enabled = false },
		"no negotiation":      func(b *PriceBook, _ *domain.Order) { b.AgentPolicy.Negotiation = false },
		"no policy":           func(b *PriceBook, _ *domain.Order) { b.AgentPolicy = nil },
		"payment not allowed": func(_ *PriceBook, o *domain.Order) { o.PaymentTypeID = ptr("pay-cod") },
		"agent not allowed":   func(_ *PriceBook, o *domain.Order) { o.Agent.Kind = "wallet_agent" },
		"negative discount":   func(_ *PriceBook, o *domain.Order) { o.DiscountLines[1].Amount = -36_000 },
	}
	for name, change := range refused {
		b, o := agentBook(), agentOrder(36_000)
		change(&b, &o)
		if _, why := RepriceShopperOrder(o, b); why == "" {
			t.Errorf("%s: placed", name)
		}
	}
}

func TestAgentDiscountCapRoundsLikeThePlanner(t *testing.T) {
	o := agentOrder(0)
	p := agentBook().AgentPolicy
	// Math.round(50.000 x 5 / 100 / 1000) x 1000 = Math.round(2.5) x 1000.
	for payable, want := range map[int]int{50_000: 3_000, 49_000: 2_000, 720_000: 36_000, 0: 0} {
		if got := AgentDiscountCap(o, p, payable); got != want {
			t.Errorf("payable %d: cap %d, want %d", payable, got, want)
		}
	}
}
