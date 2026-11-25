package httpapi_test

import (
	"context"
	"io"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/pdf"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// invoice downloads a PDF and returns its status and text.
func (e *env) invoice(path, token string) (int, []string) {
	e.t.Helper()
	req, err := http.NewRequest("GET", e.url+path, nil)
	if err != nil {
		e.t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 {
		return res.StatusCode, nil
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/pdf" {
		e.t.Fatalf("content type %q", ct)
	}
	info, err := pdf.Inspect(body)
	if err != nil {
		e.t.Fatal(err)
	}
	return 200, slices.Concat(info.Text...)
}

// guestOrder places an order as a new guest and returns the shopper's token.
func (e *env) guestOrder(orderID, customerID string, change ...func(map[string]any)) string {
	e.t.Helper()
	order := e.placeable(orderID, customerID)
	for _, c := range change {
		c(order)
	}
	e.price(order)
	customer := map[string]any{"id": customerID, "tenantId": "ten-lari", "code": "LARI-C9" + customerID[len(customerID)-4:], "name": "Rina Guest", "email": customerID + "@example.com"}
	var out struct {
		Token string `json:"token"`
	}
	if code := e.call("POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": customer}, &out); code != 200 || out.Token == "" {
		e.t.Fatalf("place %s: %d", orderID, code)
	}
	return out.Token
}

var invoiceNumber = regexp.MustCompile(`^INV/LARI/\d{4}/\d{2}/(\d{4})$`)

func numberIn(text []string) string {
	for _, s := range text {
		if invoiceNumber.MatchString(s) {
			return s
		}
	}
	return ""
}

func TestTaxSettingsAndInvoices(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	pkp := map[string]any{"pkp": true, "pricesIncludeTax": false, "profile": "standard"}

	// PKP needs an NPWP, and the brand's settings permission.
	e.expect(200, "PUT", "/tenants/ten-lari/legal", e.admin, map[string]any{"entityName": "PT Lari Nusantara"})
	e.expect(422, "PUT", "/tenants/ten-lari/tax", e.admin, pkp)
	e.expect(403, "PUT", "/tenants/ten-lari/tax", e.login("maya@lari.co.id"), pkp)
	e.expect(200, "PUT", "/tenants/ten-lari/legal", e.admin, map[string]any{"entityName": "PT Lari Nusantara", "npwp": "01.234.567.8-901.000", "address": "Jl. Senopati 10"})
	e.expect(422, "PUT", "/tenants/ten-lari/tax", e.admin, map[string]any{"pkp": true, "pricesIncludeTax": false, "profile": "standard", "ratePct": 0})
	e.expect(200, "PUT", "/tenants/ten-lari/tax", e.admin, pkp)
	// The NPWP stays while PKP is on.
	e.expect(409, "PUT", "/tenants/ten-lari/legal", e.admin, map[string]any{"entityName": "PT Lari Nusantara"})

	// With prices excluding PPN the server adds it to the total, whatever the client sent.
	shopper := e.guestOrder("ord-inv-1", "cus-inv-0001")
	o, err := store.Get[domain.Order](ctx, e.db.Pool, "orders", "ord-inv-1")
	if err != nil {
		t.Fatal(err)
	}
	if o.Tax == nil || o.Tax.PPN <= 0 || o.Total != o.Subtotal-o.Discount+o.Tax.PPN+o.Shipping {
		t.Fatalf("taxed order: total %d, tax %+v", o.Total, o.Tax)
	}

	// The shopper's invoice: the first download issues the number, the next shows the same one.
	if code, _ := e.invoice("/shop/lari/orders/ord-inv-1/invoice.pdf", ""); code != 401 {
		t.Errorf("without a token: %d", code)
	}
	code, text := e.invoice("/shop/lari/orders/ord-inv-1/invoice.pdf", shopper)
	first := numberIn(text)
	if code != 200 || first == "" {
		t.Fatalf("shopper invoice: %d %q", code, text)
	}
	if !slices.Contains(text, "NPWP 01.234.567.8-901.000") || !slices.ContainsFunc(text, func(s string) bool { return strings.Contains(s, "Faktur Pajak") }) {
		t.Errorf("the invoice lacks the NPWP or the Faktur Pajak note: %q", text)
	}
	if _, again := e.invoice("/shop/lari/orders/ord-inv-1/invoice.pdf", shopper); numberIn(again) != first {
		t.Errorf("the number changed: %s then %s", first, numberIn(again))
	}

	// Another shopper cannot read it; staff can, with the same number.
	other := e.guestOrder("ord-inv-2", "cus-inv-0002")
	if code, _ := e.invoice("/shop/lari/orders/ord-inv-1/invoice.pdf", other); code != 404 {
		t.Errorf("another shopper's order: %d", code)
	}
	if _, staff := e.invoice("/orders/ord-inv-1/invoice.pdf?tenantId=ten-lari", e.admin); numberIn(staff) != first {
		t.Errorf("staff see %q, the shopper %q", numberIn(staff), first)
	}

	// The brand's sequence moves on with the next order.
	_, second := e.invoice("/shop/lari/orders/ord-inv-2/invoice.pdf", other)
	a, b := invoiceNumber.FindStringSubmatch(first), invoiceNumber.FindStringSubmatch(numberIn(second))
	if a == nil || b == nil || a[1] >= b[1] {
		t.Errorf("sequence: %s then %s", first, numberIn(second))
	}

	// A cancelled order that was never paid, and has no number, gets none.
	e.guestOrder("ord-inv-3", "cus-inv-0003", func(o map[string]any) { o["paymentStatus"], o["paymentMethod"] = "pending", "cod" })
	e.expect(200, "POST", "/orders/ord-inv-3/cancel", e.admin, map[string]any{"reason": "customer_request", "note": ""})
	if code, _ := e.invoice("/orders/ord-inv-3/invoice.pdf?tenantId=ten-lari", e.admin); code != 409 {
		t.Errorf("cancelled order: %d", code)
	}

	// Turning PKP off brings orders back to what they were.
	e.expect(200, "PUT", "/tenants/ten-lari/tax", e.admin, map[string]any{"pkp": false, "pricesIncludeTax": true, "profile": "standard"})
	e.guestOrder("ord-inv-4", "cus-inv-0004")
	if o, _ := store.Get[domain.Order](ctx, e.db.Pool, "orders", "ord-inv-4"); o.Tax != nil || o.Total != o.Subtotal-o.Discount+o.Shipping {
		t.Errorf("untaxed order: total %d, tax %+v", o.Total, o.Tax)
	}
}
