package httpapi_test

import (
	"encoding/json"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// TestShopperReturnRunsToARefund walks one return through every step over HTTP: the shopper asks
// from their store, staff approve, receive and refund it, and the state carries it only while open.
func TestShopperReturnRunsToARefund(t *testing.T) {
	e := setup(t)
	var shopper struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	reg := map[string]string{"name": "Rina", "email": "rina.returns@example.com", "phone": "+62812", "password": shopPassword}
	if code := e.call("POST", "/shop/lari/register", "", reg, &shopper); code != 200 {
		t.Fatalf("register: %d", code)
	}
	order := e.placeable("ord-return-1", shopper.Customer.ID)
	if code := e.call("POST", "/shop/lari/orders", shopper.Token, map[string]any{"order": order}, nil); code != 200 {
		t.Fatalf("place: %d", code)
	}
	ask := map[string]any{"id": "ret-http-1", "orderId": "ord-return-1", "note": "Sole came loose",
		"items": []any{map[string]any{"variantId": e.order("ord-return-1").Lines[0].VariantID, "qty": 1, "reason": "damaged"}}}
	// Before delivery the shopper is told to wait.
	if code, why := e.problem("POST", "/shop/lari/returns", shopper.Token, ask); code != 409 || why != "REFUSED" {
		t.Fatalf("early request: %d %q", code, why)
	}
	for range 8 {
		if e.order("ord-return-1").Status == "delivered" {
			break
		}
		if code := e.call("POST", "/orders/ord-return-1/advance", e.admin, map[string]any{"trackingNo": "JNE1"}, nil); code != 200 {
			t.Fatalf("advance: %d", code)
		}
	}
	e.expect(401, "POST", "/shop/lari/returns", "", ask)
	if code := e.call("POST", "/shop/lari/returns", shopper.Token, ask, nil); code != 200 {
		t.Fatalf("shopper request: %d", code)
	}
	if !e.stateHasReturn("ret-http-1") {
		t.Error("the open return is not in the state")
	}
	var me struct {
		Returns []domain.OrderReturn `json:"returns"`
	}
	e.call("GET", "/shop/lari/me", shopper.Token, nil, &me)
	if len(me.Returns) != 1 || me.Returns[0].Status != "requested" || me.Returns[0].RequestedBy != "shopper" {
		t.Fatalf("shopper sees %+v", me.Returns)
	}

	for _, step := range []struct {
		path string
		body any
	}{{"approve", map[string]string{"note": ""}}, {"receive", map[string]bool{"restock": true}}} {
		if code := e.call("POST", "/returns/ret-http-1/"+step.path, e.admin, step.body, nil); code != 200 {
			t.Fatalf("%s: %d", step.path, code)
		}
	}
	// Pasal 71: an order paid outside Midtrans is refunded only with the transfer recorded.
	e.expect(422, "POST", "/returns/ret-http-1/refund", e.admin, map[string]any{"amount": 100_000_000, "note": ""})
	for _, step := range []struct {
		path string
		body any
	}{{"refund", map[string]any{"amount": 100_000_000, "note": "", "reference": "BCA-889", "refundedOn": "2026-10-06"}}} {
		if code := e.call("POST", "/returns/ret-http-1/"+step.path, e.admin, step.body, nil); code != 200 {
			t.Fatalf("%s: %d", step.path, code)
		}
	}
	if o := e.order("ord-return-1"); o.RefundedAmount == 0 || o.RefundedAmount >= o.Total {
		t.Errorf("a one-unit return refunded %d of %d", o.RefundedAmount, o.Total)
	}
	if e.stateHasReturn("ret-http-1") {
		t.Error("the refunded return is still in the state")
	}
	var page struct {
		Rows         []domain.OrderReturn `json:"rows"`
		StatusCounts map[string]int       `json:"statusCounts"`
	}
	if code := e.call("GET", "/views/returns?tenantId=ten-lari&status=refunded", e.admin, nil, &page); code != 200 {
		t.Fatalf("views/returns: %d", code)
	}
	if len(page.Rows) != 1 || page.Rows[0].ID != "ret-http-1" || page.StatusCounts["refunded"] != 1 {
		t.Errorf("views/returns: %+v", page)
	}
	var one domain.OrderReturn
	if code := e.call("GET", "/returns/ret-http-1?tenantId=ten-lari", e.admin, nil, &one); code != 200 || len(one.Events) != 4 {
		t.Errorf("read one return: %d, %d events", code, len(one.Events))
	}
	e.expect(403, "GET", "/views/returns?tenantId=ten-teknika", e.admin, nil)
}

func (e *env) stateHasReturn(id string) bool {
	e.t.Helper()
	var out struct {
		State map[string][]json.RawMessage `json:"state"`
	}
	e.call("GET", "/state", e.admin, nil, &out)
	for _, raw := range out.State["returns"] {
		var r domain.OrderReturn
		_ = json.Unmarshal(raw, &r)
		if r.ID == id {
			return true
		}
	}
	return false
}
