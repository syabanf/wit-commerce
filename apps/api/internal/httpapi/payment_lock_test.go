package httpapi_test

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// confirmation is a shopper's report of a manual payment.
func confirmation(o domain.Order, proofURL string) map[string]any {
	return map[string]any{"amount": o.Total, "channel": "BCA", "senderName": "Rina Wijaya",
		"transferredAt": "2026-10-05T10:00", "proofUrl": proofURL}
}

// shopUpload posts data as a payment proof with the shopper's token.
func (e *env) shopUpload(store, token string, data []byte) (int, uploaded) {
	e.t.Helper()
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	part, err := form.CreateFormFile("file", "transfer.png")
	if err != nil {
		e.t.Fatal(err)
	}
	_, _ = part.Write(data)
	_ = form.Close()
	req, _ := http.NewRequest("POST", e.url+"/shop/"+store+"/payment-proof", &buf)
	req.Header.Set("Content-Type", form.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var out uploaded
	if res.StatusCode == http.StatusCreated {
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			e.t.Fatal(err)
		}
	}
	return res.StatusCode, out
}

// TestShopperCannotSetPaidByAnyRoute tries every route a shopper's token reaches with an order or
// a payment in its body, and the staff routes that move payment, and finds the order still unpaid.
func TestShopperCannotSetPaidByAnyRoute(t *testing.T) {
	e, _ := midtransEnv(t)
	o, out := e.placeWith("lari", "ten-lari", "ord-lock-0001", "pay-lari-ovo", "ewallet")
	if o.PaymentStatus != "pending" || o.Status != "confirmed" || paidSteps(o) != 0 {
		t.Fatalf("guest placement: %s/%s, paid steps %d", o.Status, o.PaymentStatus, paidSteps(o))
	}
	shopper := out.Token

	// A signed-in shopper's own order, built as paid and shipped with a refund on it.
	built := o
	built.ID, built.Code = "ord-lock-0002", "LARI-9lock2"
	built.Status, built.PaymentStatus, built.RefundedAmount = "shipped", "paid", 0
	built.PaymentConfirmation = &domain.PaymentConfirmation{Status: "confirmed", Amount: o.Total}
	built.CancelRefund = &domain.CancelRefund{Status: "succeeded", Amount: o.Total}
	built.Events = append([]domain.OrderEvent{{ID: "oev-lock-paid", At: o.CreatedAt, By: "storefront", Status: new(string), Note: "Paid"}}, built.Events...)
	*built.Events[0].Status = "paid"
	if code := e.call("POST", "/shop/lari/orders", shopper, map[string]any{"order": built}, nil); code != 200 {
		t.Fatalf("signed-in placement: %d", code)
	}
	got := e.order(built.ID)
	if got.PaymentStatus != "pending" || got.Status != "confirmed" || paidSteps(got) != 0 || got.PaymentConfirmation != nil || got.CancelRefund != nil {
		t.Errorf("signed-in placement: %s/%s, paid steps %d, confirmation %+v, refund %+v", got.Status, got.PaymentStatus, paidSteps(got), got.PaymentConfirmation, got.CancelRefund)
	}

	// A payment confirmation carrying a status of its own is still only a claim.
	body := confirmation(o, "")
	body["status"], body["paymentStatus"] = "confirmed", "paid"
	e.expect(200, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", shopper, body)
	if got := e.order(o.ID); got.PaymentStatus != "pending" || got.PaymentConfirmation.Status != "submitted" {
		t.Errorf("confirmation: %s, %s", got.PaymentStatus, got.PaymentConfirmation.Status)
	}
	// Returns and leads take no order fields that could pay one.
	e.call("POST", "/shop/lari/returns", shopper, map[string]any{"id": "ret-lock", "orderId": o.ID, "paymentStatus": "paid",
		"items": []any{map[string]any{"variantId": o.Lines[0].VariantID, "qty": 1, "reason": "damaged"}}}, nil)

	// Staff routes refuse the shopper's token.
	for _, path := range []string{"/orders/" + o.ID + "/advance", "/orders/" + o.ID + "/payment/confirm", "/orders/" + o.ID + "/payment/reject", "/orders/" + o.ID + "/refund"} {
		if code := e.call("POST", path, shopper, map[string]any{"reason": "x", "amount": 1}, nil); code != http.StatusUnauthorized && code != http.StatusForbidden {
			t.Errorf("POST %s with a shopper token: %d", path, code)
		}
	}
	if code := e.call("POST", "/orders", shopper, map[string]any{"order": built}, nil); code != http.StatusUnauthorized && code != http.StatusForbidden {
		t.Errorf("POST /orders with a shopper token: %d", code)
	}
	for _, id := range []string{o.ID, built.ID} {
		if got := e.order(id); got.PaymentStatus != "pending" || paidSteps(got) != 0 {
			t.Errorf("%s ended %s with %d paid steps", id, got.PaymentStatus, paidSteps(got))
		}
	}
}

// TestPaymentConfirmationFlow: the shopper reports a transfer with a proof image, staff reject it,
// the shopper sends it again and staff confirm it, which alone turns the order paid.
func TestPaymentConfirmationFlow(t *testing.T) {
	m := setupMedia(t)
	e := m.env
	// Without Midtrans keys, Lari's QRIS is a static code the shopper pays by hand.
	o, out := e.placeWith("lari", "ten-lari", "ord-check-0001", "pay-lari-qris", "qris")
	shopper := out.Token
	if code, _ := e.shopUpload("lari", "", picture(t, "png", 4, 4)); code != http.StatusUnauthorized {
		t.Errorf("upload without a token: %d", code)
	}
	code, proof := e.shopUpload("lari", shopper, picture(t, "png", 4, 4))
	if code != http.StatusCreated {
		t.Fatalf("proof upload: %d", code)
	}
	// Only an image uploaded to this store counts as proof.
	e.expect(http.StatusUnprocessableEntity, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", shopper,
		confirmation(o, "https://elsewhere.example.com/media/ten-lari/med-forged.png"))
	// Another shopper cannot report a payment for this order.
	_, other := e.placeWith("lari", "ten-lari", "ord-check-0002", "pay-lari-qris", "qris")
	e.expect(http.StatusNotFound, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", other.Token, confirmation(o, ""))

	e.expect(200, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", shopper, confirmation(o, proof.URL))
	got := e.order(o.ID)
	if pc := got.PaymentConfirmation; pc == nil || pc.Status != "submitted" || pc.ProofURL != proof.URL || got.PaymentStatus != "pending" {
		t.Fatalf("submitted: %s %+v", got.PaymentStatus, pc)
	}
	e.expect(http.StatusConflict, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", shopper, confirmation(o, ""))
	// Staff check the confirmation instead of stepping past it.
	e.expect(http.StatusConflict, "POST", "/orders/"+o.ID+"/advance", e.admin, map[string]any{})
	// The proof stays out of the brand's image library.
	var library struct {
		Items []uploaded `json:"items"`
	}
	e.call("GET", "/media?tenantId=ten-lari", e.admin, nil, &library)
	for _, it := range library.Items {
		if it.ID == proof.ID {
			t.Error("the payment proof shows in the media library")
		}
	}

	e.expect(http.StatusUnprocessableEntity, "POST", "/orders/"+o.ID+"/payment/reject", e.admin, map[string]string{"reason": " "})
	e.expect(200, "POST", "/orders/"+o.ID+"/payment/reject", e.admin, map[string]string{"reason": "No transfer from Rina Wijaya on 5 October"})
	got = e.order(o.ID)
	if pc := got.PaymentConfirmation; pc.Status != "rejected" || !strings.Contains(pc.RejectReason, "No transfer") || got.PaymentStatus != "pending" {
		t.Fatalf("rejected: %s %+v", got.PaymentStatus, pc)
	}
	e.expect(http.StatusConflict, "POST", "/orders/"+o.ID+"/payment/confirm", e.admin, nil)

	e.expect(200, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", shopper, confirmation(o, ""))
	e.expect(200, "POST", "/orders/"+o.ID+"/payment/confirm", e.admin, nil)
	got = e.order(o.ID)
	if got.PaymentStatus != "paid" || got.Status != "paid" || got.PaymentConfirmation.Status != "confirmed" || got.PaymentConfirmation.ReviewedBy == "" || paidSteps(got) != 1 {
		t.Fatalf("confirmed: %s/%s %+v, paid steps %d", got.Status, got.PaymentStatus, got.PaymentConfirmation, paidSteps(got))
	}
	e.expect(http.StatusConflict, "POST", "/orders/"+o.ID+"/payment/confirm", e.admin, nil)
}

// TestGatewayOrderTakesNoPaymentConfirmation: an order Midtrans collects is paid on Midtrans's page.
func TestGatewayOrderTakesNoPaymentConfirmation(t *testing.T) {
	e, _ := midtransEnv(t)
	o, out := e.placeWith("lari", "ten-lari", "ord-check-0003", "pay-lari-qris", "qris")
	e.expect(http.StatusConflict, "POST", "/shop/lari/orders/"+o.ID+"/payment-confirmation", out.Token, confirmation(o, ""))
	if code := e.notify(o, "settlement", "SB-Mid-server-wrongkey0000"); code != http.StatusUnauthorized {
		t.Errorf("bad signature: %d", code)
	}
	if got := e.order(o.ID); got.PaymentStatus != "pending" {
		t.Errorf("after a forged notification: %s", got.PaymentStatus)
	}
}

// paidByMidtrans places a Lari QRIS order and settles it through a verified notification.
func paidByMidtrans(t *testing.T, e *env, fake *fakeMidtrans, id string) domain.Order {
	t.Helper()
	o, _ := e.placeWith("lari", "ten-lari", id, "pay-lari-qris", "qris")
	fake.answer(o, "settlement")
	if code := e.notify(o, "settlement", sandboxKey); code != 200 {
		t.Fatalf("notify: %d", code)
	}
	if got := e.order(id); got.PaymentStatus != "paid" {
		t.Fatalf("settlement: %s", got.PaymentStatus)
	}
	return e.order(id)
}

// TestCancellingAMidtransOrderRefundsThroughMidtrans: a refused refund still cancels the order with
// the refund owed and the reason; a lost answer stays pending; the retry finds the refund under its
// key, so Midtrans refunds once, and the order closes refunded with the gateway's reference.
func TestCancellingAMidtransOrderRefundsThroughMidtrans(t *testing.T) {
	e, fake := midtransEnv(t)
	o := paidByMidtrans(t, e, fake, "ord-cxl-0001")
	cancel := map[string]any{"reason": "out_of_stock", "note": ""}

	fake.mu.Lock()
	fake.refuseWith = "Transaction cannot be refunded"
	fake.mu.Unlock()
	e.expect(200, "POST", "/orders/"+o.ID+"/cancel", e.admin, cancel)
	got := e.order(o.ID)
	if r := got.CancelRefund; got.Status != "cancelled" || got.PaymentStatus != "paid" || got.RefundedAmount != 0 || r == nil || r.Status != "failed" || r.Amount != o.Total || !strings.Contains(r.Error, "cannot be refunded") {
		t.Fatalf("after a refusal: %s/%s refunded %d, %+v", got.Status, got.PaymentStatus, got.RefundedAmount, got.CancelRefund)
	}
	// A partial refund cannot bypass the cancellation's refund.
	e.expect(http.StatusConflict, "POST", "/orders/"+o.ID+"/refund", e.admin, map[string]any{"amount": 1000, "note": ""})

	fake.mu.Lock()
	fake.refuseWith, fake.dropNext = "", true
	fake.mu.Unlock()
	e.expect(http.StatusConflict, "POST", "/orders/"+o.ID+"/cancel-refund", e.admin, map[string]any{})
	if r := e.order(o.ID).CancelRefund; r.Status != "pending" {
		t.Fatalf("after a lost answer: %+v", r)
	}

	// Naming a bank transfer while Midtrans may have refunded still asks Midtrans first.
	e.expect(200, "POST", "/orders/"+o.ID+"/cancel-refund", e.admin, map[string]any{"reference": "BCA-1", "refundedOn": "2026-10-06"})
	fake.mu.Lock()
	calls, held := fake.refundCall, fake.refunds["cancel-"+o.ID+"-2"]
	fake.mu.Unlock()
	if calls != 2 || held != o.Total {
		t.Errorf("refund calls %d, Midtrans holds %d of %d", calls, held, o.Total)
	}
	got = e.order(o.ID)
	if r := got.CancelRefund; got.Status != "refunded" || got.PaymentStatus != "refunded" || got.RefundedAmount != o.Total ||
		r.Status != "succeeded" || r.Method != "midtrans" || r.Reference != "cancel-"+o.ID+"-2" || r.Error != "" {
		t.Fatalf("refunded: %s/%s %d %+v", got.Status, got.PaymentStatus, got.RefundedAmount, got.CancelRefund)
	}
	var kind string
	_ = e.db.Pool.QueryRow(t.Context(), `select kind from payment_refunds where refund_key = $1`, "cancel-"+o.ID+"-2").Scan(&kind)
	if kind != "cancellation" {
		t.Errorf("refund kind %q", kind)
	}
	e.expect(http.StatusConflict, "POST", "/orders/"+o.ID+"/cancel-refund", e.admin, map[string]any{})

	// When Midtrans refunds at once, the cancellation closes the order refunded.
	o = paidByMidtrans(t, e, fake, "ord-cxl-0002")
	e.expect(200, "POST", "/orders/"+o.ID+"/cancel", e.admin, cancel)
	if got := e.order(o.ID); got.Status != "refunded" || got.CancelRefund.Reference != "cancel-"+o.ID+"-1" {
		t.Errorf("cancel with a refund: %s %+v", got.Status, got.CancelRefund)
	}
}

// TestManualCancellationRefundNeedsTransferProof: an order paid outside a gateway owes its refund
// until staff record the transfer reference and date.
func TestManualCancellationRefundNeedsTransferProof(t *testing.T) {
	e, _ := midtransEnv(t)
	o, _ := e.placeWith("lari", "ten-lari", "ord-cxl-0003", "pay-lari-ovo", "ewallet")
	e.expect(200, "POST", "/orders/"+o.ID+"/advance", e.admin, map[string]any{})
	if got := e.order(o.ID); got.PaymentStatus != "paid" {
		t.Fatalf("staff marked it paid: %s", got.PaymentStatus)
	}
	e.expect(200, "POST", "/orders/"+o.ID+"/cancel", e.admin, map[string]any{"reason": "customer_request", "note": ""})
	got := e.order(o.ID)
	if r := got.CancelRefund; got.Status != "cancelled" || r == nil || r.Status != "owed" || r.Amount != o.Total {
		t.Fatalf("owed: %s %+v", got.Status, got.CancelRefund)
	}
	e.expect(http.StatusUnprocessableEntity, "POST", "/orders/"+o.ID+"/cancel-refund", e.admin, map[string]any{"reference": "BCA-9"})
	e.expect(200, "POST", "/orders/"+o.ID+"/cancel-refund", e.admin, map[string]any{"reference": "BCA-9", "refundedOn": "2026-10-06"})
	got = e.order(o.ID)
	if r := got.CancelRefund; got.Status != "refunded" || got.RefundedAmount != o.Total || r.Method != "manual" || r.Reference != "BCA-9" || r.RefundedOn != "2026-10-06" {
		t.Fatalf("refunded: %s %d %+v", got.Status, got.RefundedAmount, got.CancelRefund)
	}

	// Proof given with the cancellation closes the order at once.
	o, _ = e.placeWith("lari", "ten-lari", "ord-cxl-0004", "pay-lari-ovo", "ewallet")
	e.expect(200, "POST", "/orders/"+o.ID+"/advance", e.admin, map[string]any{})
	e.expect(200, "POST", "/orders/"+o.ID+"/cancel", e.admin,
		map[string]any{"reason": "customer_request", "note": "", "refundReference": "BCA-10", "refundedOn": "2026-10-06"})
	if got := e.order(o.ID); got.Status != "refunded" || got.CancelRefund.Reference != "BCA-10" {
		t.Errorf("cancel with proof: %s %+v", got.Status, got.CancelRefund)
	}
}
