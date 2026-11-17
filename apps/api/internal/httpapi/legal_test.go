package httpapi_test

import (
	"context"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// termsVersion is the version of the store's terms a checkout agrees to now.
func (e *env) termsVersion(tenantID string) string {
	e.t.Helper()
	tenant, err := store.Get[domain.Tenant](context.Background(), e.db.Pool, "tenants", tenantID)
	if err != nil {
		e.t.Fatal(err)
	}
	return rules.TermsVersion(tenant)
}

func TestShopOrderNeedsTheCurrentTerms(t *testing.T) {
	e := setup(t)
	guest := func(id string) map[string]any {
		return map[string]any{"id": id, "tenantId": "ten-lari", "code": "LARI-C9" + id[len(id)-4:], "name": "Guest", "email": id + "@example.com"}
	}
	order := e.placeable("ord-terms-1", "cus-terms-1")
	delete(order, "termsVersion")
	if status, code := e.problem("POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guest("cus-terms-1")}); status != 422 || code != "TERMS_NOT_ACCEPTED" {
		t.Errorf("no consent: %d %s", status, code)
	}
	old := e.termsVersion("ten-lari")
	// A change to the brand's details gives the terms a new version, so the old consent no longer counts.
	e.expect(200, "PUT", "/tenants/ten-lari/legal", e.admin, map[string]any{"entityName": " PT Lari Nusantara ", "nib": "1234567890123", "city": "Jakarta Selatan"})
	if e.termsVersion("ten-lari") == old {
		t.Fatal("the terms version did not change with the legal details")
	}
	order["termsVersion"] = old
	if status, code := e.problem("POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guest("cus-terms-1")}); status != 422 || code != "TERMS_NOT_ACCEPTED" {
		t.Errorf("stale consent: %d %s", status, code)
	}
	order["termsVersion"], order["termsAcceptedAt"] = e.termsVersion("ten-lari"), "2000-01-01T00:00:00+07:00"
	e.expect(200, "POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guest("cus-terms-1")})
	saved, err := store.Get[domain.Order](context.Background(), e.db.Pool, "orders", "ord-terms-1")
	if err != nil {
		t.Fatal(err)
	}
	if saved.TermsVersion != e.termsVersion("ten-lari") || saved.TermsAcceptedAt == "" || saved.TermsAcceptedAt == "2000-01-01T00:00:00+07:00" {
		t.Errorf("the order keeps the consent with the server's time: %q at %q", saved.TermsVersion, saved.TermsAcceptedAt)
	}
}

func TestLegalDetailsAndDeliveryDays(t *testing.T) {
	e := setup(t)
	marketing := e.login("maya@lari.co.id")
	e.expect(403, "PUT", "/tenants/ten-lari/legal", marketing, map[string]any{"entityName": "PT Lari"})
	for _, bad := range []map[string]any{
		{"nib": "12345"},
		{"npwp": "12.345"},
		{"businessType": "firma"},
		{"email": "not-an-email"},
		{"phone": "12"},
		{"complaintDays": 0},
		{"disputeForum": "duel"},
	} {
		e.expect(422, "PUT", "/tenants/ten-lari/legal", e.admin, bad)
	}
	e.expect(200, "PUT", "/tenants/ten-lari/legal", e.admin, map[string]any{
		"entityName": "PT Lari Nusantara", "businessType": "pt", "npwp": "01.234.567.8-901.000", "phone": "+62 21 555 0101",
		"email": "help@lari.co.id", "complaintDays": 5, "disputeForum": "bpsk", "address": "  ",
	})
	tenant, err := store.Get[domain.Tenant](context.Background(), e.db.Pool, "tenants", "ten-lari")
	if err != nil {
		t.Fatal(err)
	}
	if tenant.Legal == nil || tenant.Legal.Address != "" || rules.ComplaintDays(tenant) != 5 || tenant.Legal.DisputeForum != "bpsk" {
		t.Errorf("legal: %+v", tenant.Legal)
	}
	e.expect(200, "PUT", "/tenants/ten-lari/legal", e.admin, map[string]any{})
	if tenant, _ = store.Get[domain.Tenant](context.Background(), e.db.Pool, "tenants", "ten-lari"); tenant.Legal != nil {
		t.Errorf("an empty record stays: %+v", tenant.Legal)
	}

	e.expect(422, "PUT", "/tenants/ten-lari/courier-eta", e.admin, map[string]any{"courierEtaDays": map[string]any{"jne": map[string]int{"min": 3, "max": 2}}})
	e.expect(422, "PUT", "/tenants/ten-lari/courier-eta", e.admin, map[string]any{"courierEtaDays": map[string]any{"pos": map[string]int{"min": 1, "max": 2}}})
	e.expect(200, "PUT", "/tenants/ten-lari/courier-eta", e.admin, map[string]any{"courierEtaDays": map[string]any{"jne": map[string]int{"min": 1, "max": 2}}})
	if tenant, _ = store.Get[domain.Tenant](context.Background(), e.db.Pool, "tenants", "ten-lari"); tenant.CourierEtaDays["jne"] != (domain.EtaDays{Min: 1, Max: 2}) {
		t.Errorf("eta: %+v", tenant.CourierEtaDays)
	}
}

func TestShopComplaintOpensATicket(t *testing.T) {
	e := setup(t)
	complaint := map[string]any{
		"subject": "Parcel arrived torn", "message": "The box was open and one shoe is missing.",
		"contact": map[string]string{"name": " Rina ", "email": "rina.complaint@example.com", "phone": ""},
	}
	var out struct {
		Upserts struct {
			Tickets []domain.Ticket `json:"tickets"`
		} `json:"upserts"`
	}
	if code := e.call("POST", "/shop/lari/complaints", "", complaint, &out); code != 200 || len(out.Upserts.Tickets) != 1 {
		t.Fatalf("guest complaint: %d %+v", code, out)
	}
	tk := out.Upserts.Tickets[0]
	if tk.Kind != "complaint" || tk.Channel != "web" || tk.Status != "open" || tk.CustomerID != "" || tk.Contact == nil || tk.Contact.Name != "Rina" {
		t.Errorf("ticket: %+v", tk)
	}
	if tk.SlaDueAt != rules.AddWorkingDays(tk.CreatedAt, rules.DefaultComplaintDays) || tk.Code == "" {
		t.Errorf("sla %s for %s, code %q", tk.SlaDueAt, tk.CreatedAt, tk.Code)
	}

	// A shopper may name only their own order.
	var shopper struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	reg := map[string]string{"name": "Rina", "email": "rina.orders@example.com", "phone": "+62812", "password": shopPassword}
	if code := e.call("POST", "/shop/lari/register", "", reg, &shopper); code != 200 {
		t.Fatalf("register: %d", code)
	}
	e.expect(200, "POST", "/shop/lari/orders", shopper.Token, map[string]any{"order": e.placeable("ord-complaint", shopper.Customer.ID)})
	var other string
	if err := e.db.Pool.QueryRow(context.Background(), `select id from orders where tenant_id = 'ten-lari' and data->>'customerId' <> $1 limit 1`, shopper.Customer.ID).Scan(&other); err != nil {
		t.Fatal(err)
	}
	complaint["orderId"] = other
	e.expect(422, "POST", "/shop/lari/complaints", shopper.Token, complaint)
	complaint["orderId"] = "ord-complaint"
	if code := e.call("POST", "/shop/lari/complaints", shopper.Token, complaint, &out); code != 200 || out.Upserts.Tickets[0].CustomerID != shopper.Customer.ID {
		t.Fatalf("own order: %d %+v", code, out.Upserts.Tickets)
	}

	e.expect(422, "POST", "/shop/lari/complaints", "", map[string]any{"subject": "Hi", "message": "short", "contact": map[string]string{"name": "R"}})
	// Refused complaints count too, so this fifth one from the client is the last in the hour.
	e.expect(200, "POST", "/shop/lari/complaints", "", map[string]any{"subject": "Wrong size", "message": "I ordered 42 and got 40.", "contact": map[string]string{"name": "R", "phone": "0812 3456 7890"}})
	if status, code := e.problem("POST", "/shop/lari/complaints", "", complaint); status != 429 || code != "RATE_LIMITED" {
		t.Errorf("sixth complaint: %d %s", status, code)
	}
}
