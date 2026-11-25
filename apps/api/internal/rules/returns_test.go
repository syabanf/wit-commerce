package rules

import (
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// The same cases run against the TypeScript rules in packages/fixtures/test/returns.test.ts.

func TestLegalReturnDeadlineCountsWorkingDaysInWIB(t *testing.T) {
	for _, c := range []struct{ delivered, want string }{
		// Monday: Tuesday and Wednesday count.
		{"2026-10-05T10:00:00+07:00", "2026-10-07T23:59:59.999+07:00"},
		// Thursday: Friday and Monday.
		{"2026-10-08T10:00:00+07:00", "2026-10-12T23:59:59.999+07:00"},
		// Friday and Saturday: Monday and Tuesday.
		{"2026-10-09T18:00:00+07:00", "2026-10-13T23:59:59.999+07:00"},
		{"2026-10-10T09:00:00+07:00", "2026-10-13T23:59:59.999+07:00"},
		// 23:30 WIB on Friday is still Friday, though it is Friday 16:30 in UTC.
		{"2026-10-09T23:30:00+07:00", "2026-10-13T23:59:59.999+07:00"},
		// 00:30 WIB on Saturday is Friday evening in UTC; the WIB day decides.
		{"2026-10-10T00:30:00+07:00", "2026-10-13T23:59:59.999+07:00"},
	} {
		if got, want := LegalReturnDeadline(clock.Ms(c.delivered), nil), clock.MustParse(c.want).UnixMilli(); got != want {
			t.Errorf("delivered %s: deadline %d ms, want %d", c.delivered, got, want)
		}
	}
}

func deliveredOrder(at string) domain.Order {
	status := "delivered"
	return domain.Order{
		ID: "ord-1", Status: "delivered", CreatedAt: at,
		Lines:    []domain.OrderLine{{ProductID: "p1", VariantID: "v1", Qty: 2, Price: 100_000}},
		Events:   []domain.OrderEvent{{At: at, Status: &status}},
		Subtotal: 200_000, Total: 220_000, Shipping: 20_000, PaymentStatus: "paid",
	}
}

func TestReturnWindowFloorAndReasons(t *testing.T) {
	// Delivered Friday evening: the legal window runs to the end of Tuesday.
	o := deliveredOrder("2026-10-09T18:00:00+07:00")
	ask := func(reason string, now string, window int) string {
		return ReturnRequestBlocker(o, nil, []domain.ReturnItem{{VariantID: "v1", Qty: 1, Reason: reason}}, "shopper", clock.Ms(now), window, nil)
	}
	monday := "2026-10-12T12:00:00+07:00"
	wednesday := "2026-10-14T08:00:00+07:00"
	for _, c := range []struct {
		reason, now string
		window      int
		want        string
	}{
		// Returns off: the legal reasons still pass inside 2 working days, change of mind does not.
		{"late_delivery", monday, 0, ""},
		{"hidden_defect", monday, 0, ""},
		{"expired", monday, 0, ""},
		{"changed_mind", monday, 0, "This store takes change-of-mind and fit returns by message. Contact the store."},
		{"size_or_fit", monday, 0, "This store takes change-of-mind and fit returns by message. Contact the store."},
		{"damaged", wednesday, 0, "The 2-working-day return window for this order has closed."},
		// A 3-day window ends Monday 18:00, before the legal one: damaged still passes on Tuesday.
		{"damaged", "2026-10-13T20:00:00+07:00", 3, ""},
		{"changed_mind", "2026-10-13T20:00:00+07:00", 3, "The 3-day return window for this order has closed."},
		// A 14-day window extends both.
		{"changed_mind", wednesday, 14, ""},
		{"wrong_item", "2026-10-24T08:00:00+07:00", 14, "The 14-day return window for this order has closed."},
		{"bogus", monday, 14, "Choose a reason for each item."},
	} {
		if got := ask(c.reason, c.now, c.window); got != c.want {
			t.Errorf("%s at %s, window %d: %q, want %q", c.reason, c.now, c.window, got, c.want)
		}
	}
}

func TestReturnShippingPayer(t *testing.T) {
	items := func(reasons ...string) []domain.ReturnItem {
		var out []domain.ReturnItem
		for _, r := range reasons {
			out = append(out, domain.ReturnItem{Reason: r})
		}
		return out
	}
	for _, c := range []struct {
		reasons []string
		want    string
	}{
		{[]string{"damaged"}, "brand"},
		{[]string{"late_delivery"}, "brand"},
		{[]string{"changed_mind"}, "shopper"},
		{[]string{"changed_mind", "size_or_fit"}, "shopper"},
		{[]string{"size_or_fit", "expired"}, "brand"},
	} {
		if got := ReturnShippingPayer(items(c.reasons...)); got != c.want {
			t.Errorf("%v: %s, want %s", c.reasons, got, c.want)
		}
	}
}

func TestReturnRefundSplitAndProof(t *testing.T) {
	o := deliveredOrder("2026-10-09T18:00:00+07:00")
	brand := domain.OrderReturn{Items: []domain.ReturnItem{{VariantID: "v1", Qty: 1, Reason: "damaged"}}, ShippingPaidBy: "brand"}
	if items, shipping := ReturnRefundSplit(o, brand, 1_000_000, 15_000); items != 100_000 || shipping != 15_000 {
		t.Errorf("brand pays: %d + %d", items, shipping)
	}
	shopper := brand
	shopper.ShippingPaidBy = "shopper"
	if items, shipping := ReturnRefundSplit(o, shopper, 1_000_000, 15_000); items != 100_000 || shipping != 0 {
		t.Errorf("shopper pays: %d + %d", items, shipping)
	}
	// Shipping never takes the refund past what the order still holds.
	o.RefundedAmount = 110_000
	if items, shipping := ReturnRefundSplit(o, brand, 1_000_000, 15_000); items != 100_000 || shipping != 10_000 {
		t.Errorf("capped: %d + %d", items, shipping)
	}
	for _, c := range []struct{ method, ref, on, want string }{
		{"", "TRF-1", "2026-10-06", ""},
		{"manual", " ", "2026-10-06", "Enter the transfer reference so the shopper can trace the money."},
		{"manual", "TRF-1", "", "Enter the date the money was sent."},
		{"midtrans", "ret-1-1", "", ""},
		{"midtrans", "", "", "The gateway gave no refund reference."},
		{"cash", "x", "y", "Choose how the money went back."},
	} {
		if got := ReturnRefundProofBlocker(c.method, c.ref, c.on); got != c.want {
			t.Errorf("%+v: %q", c, got)
		}
	}
}
