package httpapi_test

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

type privacyList struct {
	Requests []domain.PrivacyRequest `json:"requests"`
}

// tablesHolding names every table whose rows mention the value anywhere.
func (e *env) tablesHolding(value string) []string {
	e.t.Helper()
	ctx := context.Background()
	rows, err := e.db.Pool.Query(ctx, `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)
	if err != nil {
		e.t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			e.t.Fatal(err)
		}
		tables = append(tables, name)
	}
	rows.Close()
	var hits []string
	for _, table := range tables {
		var n int
		if err := e.db.Pool.QueryRow(ctx, `select count(*) from "`+table+`" t where strpos(lower(t::text), lower($1)) > 0`, value).Scan(&n); err != nil {
			e.t.Fatal(err)
		}
		if n > 0 {
			hits = append(hits, table)
		}
	}
	return hits
}

// TestErasureRemovesPersonalDataEverywhere runs a shopper through an order, email, a webhook and a
// staff note, has them ask for erasure, and then finds their email, phone and name in no table,
// while the order keeps its total.
func TestErasureRemovesPersonalDataEverywhere(t *testing.T) {
	e, box := mailEnv(t)
	e.admin = e.login("andi@lari.co.id")
	ctx := context.Background()
	if _, err := e.db.Pool.Exec(ctx, `insert into webhook_endpoints (id, tenant_id, url, events, secret_sealed, created_by, created_at)
		values ('wh-privacy', 'ten-lari', 'https://hooks.example.com', '{customer.created,customer.updated}', '\x00', 'test', now())`); err != nil {
		t.Fatal(err)
	}
	const email, phone, name = "erase.me@example.com", "+6281299887766", "Rahasia Sekali"
	var shopper struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	reg := map[string]string{"name": name, "email": email, "phone": phone, "password": shopPassword}
	if code := e.call("POST", "/shop/lari/register", "", reg, &shopper); code != 200 {
		t.Fatalf("register: %d", code)
	}
	id := shopper.Customer.ID
	if code := e.call("POST", "/shop/lari/orders", shopper.Token, map[string]any{"order": e.placeable("ord-erase-1", id)}, nil); code != 200 {
		t.Fatalf("place: %d", code)
	}
	box.count()
	e.expect(200, "POST", "/customers/"+id+"/notes", e.admin, map[string]string{"note": "Call " + name + " at " + phone})
	// The admin assistant keeps staff questions for 90 days, and one may name the shopper.
	if _, err := e.db.Pool.Exec(ctx, `insert into assistant_log (id, tenant_id, user_id, at, question) values ('ans-erase', 'ten-lari', 'usr-andi', now(), $1)`,
		"Has "+name+" ("+email+", "+phone+") paid?"); err != nil {
		t.Fatal(err)
	}
	e.expect(200, "POST", "/shop/lari/consent", shopper.Token, map[string]any{"granted": true, "source": "checkout", "textVersion": "2026-11"})
	if hits := e.tablesHolding(email); len(hits) == 0 {
		t.Fatal("the email is nowhere before erasure; the check below proves nothing")
	}

	// An order on its way keeps the contact details.
	var list privacyList
	if code := e.call("POST", "/shop/lari/privacy-requests", shopper.Token, map[string]string{"kind": "erasure", "note": "Please forget me"}, &list); code != 200 || len(list.Requests) != 1 {
		t.Fatalf("request erasure: %d %+v", code, list)
	}
	req := list.Requests[0]
	requested, _ := time.Parse(time.RFC3339, req.RequestedAt)
	due, _ := time.Parse(time.RFC3339, req.DueAt)
	if due.Sub(requested) != 72*time.Hour || req.Status != "open" {
		t.Errorf("due %s after %s, status %s", req.DueAt, req.RequestedAt, req.Status)
	}
	if code, why := e.problem("POST", "/customers/privacy-requests/"+req.ID+"/complete", e.admin, map[string]string{"note": ""}); code != 409 || why != "REFUSED" {
		t.Fatalf("erase with an order on its way: %d %s", code, why)
	}
	for e.order("ord-erase-1").Status != "delivered" {
		if code := e.call("POST", "/orders/ord-erase-1/advance", e.admin, map[string]any{"trackingNo": "JNE1"}, nil); code != 200 {
			t.Fatalf("advance: %d", code)
		}
	}
	total := e.order("ord-erase-1").Total
	maya := e.login("maya@lari.co.id")
	e.expect(403, "POST", "/customers/privacy-requests/"+req.ID+"/complete", maya, map[string]string{"note": ""})
	e.expect(200, "POST", "/customers/privacy-requests/"+req.ID+"/complete", e.admin, map[string]string{"note": "Done"})

	for _, value := range []string{email, phone, name} {
		if hits := e.tablesHolding(value); len(hits) > 0 {
			t.Errorf("%q is still in %v", value, hits)
		}
	}
	o := e.order("ord-erase-1")
	if o.Total != total || len(o.Lines) == 0 || o.CreatedAt == "" {
		t.Errorf("the order lost its record: %+v", o)
	}
	var count int
	_ = e.db.Pool.QueryRow(ctx, `select count(*) from email_tokens where subject_id = $1`, id).Scan(&count)
	if count != 0 {
		t.Errorf("%d email links remain", count)
	}
	e.expect(401, "GET", "/shop/lari/me", shopper.Token, nil)
	e.expect(401, "POST", "/shop/lari/login", "", map[string]string{"email": email, "password": shopPassword})
	if code := e.call("GET", "/customers/privacy-requests?tenantId=ten-lari&status=completed", e.admin, nil, &list); code != 200 || len(list.Requests) != 1 || list.Requests[0].HandledBy == nil {
		t.Errorf("completed requests: %d %+v", code, list)
	}
	// The same email signs up again as a new customer.
	reg["name"] = "Someone New"
	e.expect(200, "POST", "/shop/lari/register", "", reg)
}

func TestShopperGetsTheirDataAfterAnAccessRequest(t *testing.T) {
	e := setup(t)
	var shopper struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	reg := map[string]string{"name": "Dewi", "email": "dewi.export@example.com", "phone": "+62812", "password": shopPassword}
	if code := e.call("POST", "/shop/lari/register", "", reg, &shopper); code != 200 {
		t.Fatalf("register: %d", code)
	}
	e.expect(409, "GET", "/shop/lari/export", shopper.Token, nil)
	var list privacyList
	e.call("POST", "/shop/lari/privacy-requests", shopper.Token, map[string]string{"kind": "access", "note": ""}, &list)
	e.expect(409, "POST", "/shop/lari/privacy-requests", shopper.Token, map[string]string{"kind": "access", "note": ""})
	e.expect(422, "POST", "/shop/lari/privacy-requests", shopper.Token, map[string]string{"kind": "everything", "note": ""})
	e.expect(200, "POST", "/customers/privacy-requests/"+list.Requests[0].ID+"/complete", e.admin, map[string]string{"note": ""})
	var out struct {
		Customer        domain.Customer         `json:"customer"`
		PrivacyRequests []domain.PrivacyRequest `json:"privacyRequests"`
	}
	if code := e.call("GET", "/shop/lari/export", shopper.Token, nil, &out); code != 200 || out.Customer.Email != "dewi.export@example.com" || len(out.PrivacyRequests) != 1 {
		t.Errorf("export: %d %+v", code, out)
	}
	e.expect(200, "GET", "/customers/"+shopper.Customer.ID+"/export", e.admin, nil)
	e.expect(403, "GET", "/customers/"+shopper.Customer.ID+"/export", e.login("maya@lari.co.id"), nil)
}

func TestUnsubscribeLinkWithdrawsConsentAtOnce(t *testing.T) {
	e := setup(t)
	var shopper struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	reg := map[string]string{"name": "Nina", "email": "nina.offers@example.com", "phone": "+62812", "password": shopPassword}
	if code := e.call("POST", "/shop/lari/register", "", reg, &shopper); code != 200 {
		t.Fatalf("register: %d", code)
	}
	id := shopper.Customer.ID
	e.expect(200, "POST", "/shop/lari/consent", shopper.Token, map[string]any{"granted": true, "source": "account", "textVersion": "2026-11"})
	e.expect(422, "POST", "/shop/lari/consent", shopper.Token, map[string]any{"granted": false, "source": "staff"})
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	token := signer.Seal("unsubscribe", id)
	page := func(method, token string) (int, string) {
		var res *http.Response
		var err error
		target := e.url + "/unsubscribe?token=" + url.QueryEscape(token)
		if method == "GET" {
			res, err = http.Get(target)
		} else {
			res, err = http.PostForm(target, url.Values{"List-Unsubscribe": {"One-Click"}})
		}
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(body)
	}
	consent := func() *domain.MarketingConsent {
		var me struct {
			Customer domain.Customer `json:"customer"`
		}
		e.call("GET", "/shop/lari/me", shopper.Token, nil, &me)
		return me.Customer.MarketingConsent
	}
	// Opening the link, as a mail scanner does, withdraws nothing.
	if code, body := page("GET", token); code != 200 || !strings.Contains(body, `<form method="post">`) || !consent().Granted {
		t.Fatalf("GET: %d, consent %+v", code, consent())
	}
	if code, _ := page("POST", token); code != 200 {
		t.Fatalf("POST: %d", code)
	}
	if c := consent(); c == nil || c.Granted || c.Source != "unsubscribe" || c.TextVersion != "2026-11" {
		t.Errorf("after unsubscribe: %+v", c)
	}
	var n int
	_ = e.db.Pool.QueryRow(context.Background(), `select count(*) from customer_events where customer_id = $1 and data->>'label' = 'Withdrew marketing consent · unsubscribe'`, id).Scan(&n)
	if n != 1 {
		t.Errorf("%d unsubscribe events", n)
	}
	if code, _ := page("POST", token); code != 200 {
		t.Errorf("second POST: %d", code)
	}
	if code, _ := page("POST", signer.Seal("reset", id)); code != 400 {
		t.Errorf("a token for another purpose: %d", code)
	}
	if code, _ := page("GET", token+"x"); code != 400 {
		t.Errorf("a tampered token: %d", code)
	}
}
