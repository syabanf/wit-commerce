package httpapi_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// returnOf reads one return as staff see it.
func (e *env) returnOf(id string) domain.OrderReturn {
	e.t.Helper()
	var r domain.OrderReturn
	if code := e.call("GET", "/returns/"+id+"?tenantId=ten-lari", e.admin, nil, &r); code != 200 {
		e.t.Fatalf("read return %s: %d", id, code)
	}
	return r
}

// TestMidtransRefundForAReturn refunds a return of a Midtrans order through the Midtrans refund API:
// a refusal keeps the return received with the reason, a lost answer is retried under the same
// refund key without a second refund, and the success records the gateway's reference.
func TestMidtransRefundForAReturn(t *testing.T) {
	e, fake := midtransEnv(t)
	o, _ := e.placeWith("lari", "ten-lari", "ord-mt-0100", "pay-lari-qris", "qris")
	fake.answer(o, "settlement")
	if code := e.notify(o, "settlement", sandboxKey); code != 200 {
		t.Fatalf("notify: %d", code)
	}
	for range 8 {
		if e.order(o.ID).Status == "delivered" {
			break
		}
		if code := e.call("POST", "/orders/"+o.ID+"/advance", e.admin, map[string]any{"trackingNo": "JNE1"}, nil); code != 200 {
			t.Fatalf("advance: %d", code)
		}
	}
	ask := map[string]any{"id": "ret-mt-1", "orderId": o.ID, "note": "",
		"items": []any{map[string]any{"variantId": o.Lines[0].VariantID, "qty": 1, "reason": "late_delivery"}}}
	e.expect(200, "POST", "/returns", e.admin, ask)
	if r := e.returnOf("ret-mt-1"); r.ShippingPaidBy != "brand" {
		t.Errorf("late delivery: shipping paid by %q", r.ShippingPaidBy)
	}
	e.expect(200, "POST", "/returns/ret-mt-1/approve", e.admin, map[string]string{"note": ""})
	e.expect(200, "POST", "/returns/ret-mt-1/receive", e.admin, map[string]bool{"restock": true})
	refund := map[string]any{"amount": 100_000_000, "note": "", "shippingCost": 9_000}

	// Midtrans says no: the return stays received and shows why.
	fake.mu.Lock()
	fake.refuseWith = "Transaction cannot be refunded"
	fake.mu.Unlock()
	e.expect(http.StatusConflict, "POST", "/returns/ret-mt-1/refund", e.admin, refund)
	if r := e.returnOf("ret-mt-1"); r.Status != "received" || r.GatewayStatus != "failed" || !strings.Contains(r.GatewayError, "cannot be refunded") {
		t.Fatalf("after a refusal: %s %s %q", r.Status, r.GatewayStatus, r.GatewayError)
	}

	// Midtrans refunds but the answer is lost: still received, pending, not open to a manual transfer.
	fake.mu.Lock()
	fake.refuseWith, fake.dropNext = "", true
	fake.mu.Unlock()
	e.expect(http.StatusConflict, "POST", "/returns/ret-mt-1/refund", e.admin, refund)
	if r := e.returnOf("ret-mt-1"); r.Status != "received" || r.GatewayStatus != "pending" {
		t.Fatalf("after a lost answer: %s %s", r.Status, r.GatewayStatus)
	}

	// The retry, even one that names a bank transfer, asks Midtrans first, finds the refund under its
	// key and records it at the amount Midtrans refunded, without a second refund call.
	e.expect(200, "POST", "/returns/ret-mt-1/refund", e.admin,
		map[string]any{"amount": 1000, "note": "", "reference": "BCA-1", "refundedOn": "2026-10-06"})
	fake.mu.Lock()
	calls, refunds := fake.refundCall, len(fake.refunds)
	fake.mu.Unlock()
	if calls != 2 || refunds != 1 {
		t.Errorf("refund calls %d, refunds held %d", calls, refunds)
	}
	r := e.returnOf("ret-mt-1")
	if r.Status != "refunded" || r.RefundMethod != "midtrans" || r.RefundReference != "ret-mt-1-2" || r.GatewayStatus != "succeeded" || r.GatewayError != "" {
		t.Fatalf("refunded return: %+v", r)
	}
	if r.RefundShipping != 9_000 || fake.refunds["ret-mt-1-2"] != r.RefundAmount {
		t.Errorf("refunded %d with shipping %d; Midtrans holds %d", r.RefundAmount, r.RefundShipping, fake.refunds["ret-mt-1-2"])
	}
	if got := e.order(o.ID).RefundedAmount; got != r.RefundAmount {
		t.Errorf("order refunded %d, return %d", got, r.RefundAmount)
	}
	e.expect(http.StatusConflict, "POST", "/returns/ret-mt-1/refund", e.admin, refund)
}

// TestManualRefundAfterAGatewayRefusal lets staff record a bank transfer once Midtrans said no.
func TestManualRefundAfterAGatewayRefusal(t *testing.T) {
	e, fake := midtransEnv(t)
	o, _ := e.placeWith("lari", "ten-lari", "ord-mt-0101", "pay-lari-qris", "qris")
	fake.answer(o, "settlement")
	e.notify(o, "settlement", sandboxKey)
	for range 8 {
		if e.order(o.ID).Status == "delivered" {
			break
		}
		e.call("POST", "/orders/"+o.ID+"/advance", e.admin, map[string]any{"trackingNo": "JNE1"}, nil)
	}
	e.expect(200, "POST", "/returns", e.admin, map[string]any{"id": "ret-mt-2", "orderId": o.ID, "note": "",
		"items": []any{map[string]any{"variantId": o.Lines[0].VariantID, "qty": 1, "reason": "changed_mind"}}})
	e.expect(200, "POST", "/returns/ret-mt-2/approve", e.admin, map[string]string{"note": ""})
	e.expect(200, "POST", "/returns/ret-mt-2/receive", e.admin, map[string]bool{"restock": true})
	fake.mu.Lock()
	fake.refuseWith = "Payment type does not support refund"
	fake.mu.Unlock()
	e.expect(http.StatusConflict, "POST", "/returns/ret-mt-2/refund", e.admin, map[string]any{"amount": 100_000_000, "note": ""})
	e.expect(200, "POST", "/returns/ret-mt-2/refund", e.admin,
		map[string]any{"amount": 100_000_000, "note": "", "shippingCost": 9_000, "reference": "BCA-77", "refundedOn": "2026-10-07"})
	r := e.returnOf("ret-mt-2")
	if r.Status != "refunded" || r.RefundMethod != "manual" || r.RefundReference != "BCA-77" || r.RefundedOn != "2026-10-07" {
		t.Fatalf("manual refund: %+v", r)
	}
	// The shopper pays return shipping for a change of mind, so none was added.
	if r.ShippingPaidBy != "shopper" || r.RefundShipping != 0 {
		t.Errorf("change of mind: paid by %s, shipping refunded %d", r.ShippingPaidBy, r.RefundShipping)
	}
}
