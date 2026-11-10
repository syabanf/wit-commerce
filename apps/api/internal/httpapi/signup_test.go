package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// demoEnv is setup with demo sign-in on.
func demoEnv(t *testing.T) *env {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Hub: events.New(), DemoLogin: true,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	return &env{t: t, url: srv.URL + "/api/v1", db: db}
}

// problem sends a request and returns the status and the problem code.
func (e *env) problem(method, path, token string, body any) (int, string) {
	e.t.Helper()
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, e.url+path, bytes.NewReader(raw))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var p struct {
		Code string `json:"code"`
	}
	_ = json.NewDecoder(res.Body).Decode(&p)
	return res.StatusCode, p.Code
}

func signUpBody(subdomain, email string) map[string]string {
	return map[string]string{
		"storeName": "Kopi Senja", "subdomain": subdomain, "industry": "fnb", "templateId": "tpl-editorial",
		"ownerName": "Rina Wijaya", "email": email, "password": "a-long-password",
	}
}

type signedUp struct {
	Token string      `json:"token"`
	User  domain.User `json:"user"`
}

func (e *env) signUp(subdomain, email string) signedUp {
	e.t.Helper()
	var out signedUp
	if code := e.call("POST", "/auth/signup", "", signUpBody(subdomain, email), &out); code != 200 {
		e.t.Fatalf("sign up: %d", code)
	}
	return out
}

func (e *env) count(table string) int {
	e.t.Helper()
	var n int
	if err := e.db.Pool.QueryRow(e.t.Context(), `select count(*) from `+table).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

type subdomainCheck struct {
	Available   bool     `json:"available"`
	Reason      string   `json:"reason"`
	Suggestions []string `json:"suggestions"`
}

func (e *env) checkSubdomain(name string) subdomainCheck {
	e.t.Helper()
	var out subdomainCheck
	if code := e.call("GET", "/signup/subdomain?name="+url.QueryEscape(name), "", nil, &out); code != 200 {
		e.t.Fatalf("check %s: %d", name, code)
	}
	return out
}

func TestSubdomainCheckOffersFreeNames(t *testing.T) {
	e := setup(t)
	if c := e.checkSubdomain("kopi-senja"); !c.Available || len(c.Suggestions) != 0 {
		t.Errorf("free name: %+v", c)
	}
	for _, name := range []string{"admin", "x", "-lari", "Lari Shop"} {
		if c := e.checkSubdomain(name); c.Available || c.Reason == "" {
			t.Errorf("%q should be refused: %+v", name, c)
		}
	}
	taken := e.checkSubdomain("lari")
	if taken.Available || len(taken.Suggestions) != 3 {
		t.Fatalf("taken name: %+v", taken)
	}
	for _, s := range taken.Suggestions {
		if c := e.checkSubdomain(s); !c.Available {
			t.Errorf("suggestion %s is not free", s)
		}
	}
}

func TestCreatingATenantNeverReplacesAnExistingOne(t *testing.T) {
	e := setup(t)
	admin := e.login("dewi@commerceos.id")
	lari, err := store.Get[domain.Tenant](t.Context(), e.db.Pool, "tenants", "ten-lari")
	if err != nil {
		t.Fatal(err)
	}
	sameID := lari
	sameID.Name, sameID.Subdomain = "Overwritten", "overwritten"
	sameSubdomain := lari
	sameSubdomain.ID, sameSubdomain.Name = "ten-other", "Other"
	reserved := sameSubdomain
	reserved.Subdomain = "admin"
	for _, c := range []struct {
		tenant domain.Tenant
		status int
		code   string
	}{{sameID, 409, "TENANT_EXISTS"}, {sameSubdomain, 409, "SUBDOMAIN_TAKEN"}, {reserved, 422, "INVALID"}} {
		if status, code := e.problem("POST", "/tenants", admin, c.tenant); status != c.status || code != c.code {
			t.Errorf("create %s/%s: %d %s, want %d %s", c.tenant.ID, c.tenant.Subdomain, status, code, c.status, c.code)
		}
		setup := map[string]any{
			"tenant":       c.tenant,
			"page":         domain.Page{ID: "page-new", TenantID: c.tenant.ID, Kind: "home", Slug: "/"},
			"warehouse":    domain.Warehouse{ID: "wh-new", TenantID: c.tenant.ID},
			"paymentTypes": []domain.PaymentType{{ID: "pay-new", TenantID: c.tenant.ID}},
		}
		if status, code := e.problem("POST", "/tenants/setup", admin, setup); status != c.status || code != c.code {
			t.Errorf("setup %s/%s: %d %s, want %d %s", c.tenant.ID, c.tenant.Subdomain, status, code, c.status, c.code)
		}
	}
	after, _ := store.Get[domain.Tenant](t.Context(), e.db.Pool, "tenants", "ten-lari")
	if after.Name != lari.Name || after.Subdomain != "lari" || e.count("pages where id = 'page-new'") != 0 {
		t.Errorf("an existing tenant changed: %+v", after)
	}
}

func TestSignUpCreatesAStoreAndSignsTheOwnerIn(t *testing.T) {
	e := setup(t)
	out := e.signUp("kopi-senja", "Rina@Example.com")
	if out.Token == "" || out.User.Role != "tenant_admin" || out.User.Email != "rina@example.com" || len(out.User.TenantIDs) != 1 {
		t.Fatalf("answer: %+v", out)
	}
	var me struct {
		User    domain.User `json:"user"`
		EmailOn bool        `json:"emailOn"`
	}
	if code := e.call("GET", "/auth/me", out.Token, nil, &me); code != 200 || me.User.ID != out.User.ID || me.EmailOn || me.User.EmailVerifiedAt != nil {
		t.Fatalf("me: %d %+v", code, me)
	}
	var state struct {
		State struct {
			Tenants      []domain.Tenant      `json:"tenants"`
			Pages        []domain.Page        `json:"pages"`
			Warehouses   []domain.Warehouse   `json:"warehouses"`
			PaymentTypes []domain.PaymentType `json:"paymentTypes"`
			Products     []domain.Product     `json:"products"`
		} `json:"state"`
	}
	if code := e.call("GET", "/state", out.Token, nil, &state); code != 200 {
		t.Fatalf("state: %d", code)
	}
	s := state.State
	if len(s.Tenants) != 1 || s.Tenants[0].ID != out.User.TenantIDs[0] || s.Tenants[0].Source != "signup" || s.Tenants[0].Subdomain != "kopi-senja" {
		t.Fatalf("tenants: %+v", s.Tenants)
	}
	if s.Tenants[0].Code != "KOPISENJA" || s.Tenants[0].Industry != "fnb" {
		t.Errorf("tenant: %+v", s.Tenants[0])
	}
	if len(s.Pages) != 1 || s.Pages[0].Status != "draft" || s.Pages[0].Kind != "home" || s.Pages[0].TemplateID != "tpl-editorial" {
		t.Fatalf("pages: %+v", s.Pages)
	}
	if hero := s.Pages[0].Sections[0]; hero.Kind != "hero" || hero.Headline != "Welcome to Kopi Senja" {
		t.Errorf("hero: %+v", hero)
	}
	if len(s.Warehouses) != 1 || len(s.PaymentTypes) != 2 || len(s.Products) != 0 {
		t.Errorf("warehouses %d, payment types %d, products %d", len(s.Warehouses), len(s.PaymentTypes), len(s.Products))
	}
	// The new owner signs in with the password, and the address is gone.
	e.signIn("rina@example.com", "a-long-password")
	if c := e.checkSubdomain("kopi-senja"); c.Available {
		t.Error("the address is still offered")
	}
	// With email off, nothing waits on a confirmation.
	e.expect(200, "POST", "/pages/"+s.Pages[0].ID+"/publish", out.Token, nil)
}

func TestSignUpRefusalsCreateNothing(t *testing.T) {
	e := setup(t)
	tables := []string{"tenants", "users", "credentials", "pages", "warehouses", "payment_types"}
	before := map[string]int{}
	for _, table := range tables {
		before[table] = e.count(table)
	}
	for _, c := range []struct {
		name   string
		body   map[string]string
		status int
		code   string
	}{
		{"taken email", signUpBody("kopi-senja", "andi@lari.co.id"), 409, "EMAIL_TAKEN"},
		{"taken subdomain", signUpBody("lari", "rina@example.com"), 409, "SUBDOMAIN_TAKEN"},
		{"reserved subdomain", signUpBody("admin", "rina@example.com"), 422, "INVALID"},
		{"honeypot", func() map[string]string {
			b := signUpBody("kopi-senja", "rina@example.com")
			b["website"] = "spam.example"
			return b
		}(), 422, "INVALID"},
	} {
		if status, code := e.problem("POST", "/auth/signup", "", c.body); status != c.status || code != c.code {
			t.Errorf("%s: %d %s, want %d %s", c.name, status, code, c.status, c.code)
		}
	}
	for _, table := range tables {
		if n := e.count(table); n != before[table] {
			t.Errorf("a refused sign-up left %d rows in %s", n-before[table], table)
		}
	}
}

func TestSignUpsAreCapped(t *testing.T) {
	e := setup(t)
	weak := signUpBody("kopi-senja", "rina@example.com")
	weak["password"] = "short"
	for range 3 {
		e.expect(422, "POST", "/auth/signup", "", weak)
	}
	// A fourth try on one email waits an hour.
	e.expect(429, "POST", "/auth/signup", "", weak)
	// The client's fifth try still counts; the sixth waits.
	e.expect(422, "POST", "/auth/signup", "", map[string]string{"email": "other@example.com", "password": "short"})
	e.expect(429, "POST", "/auth/signup", "", map[string]string{"email": "third@example.com", "password": "short"})
}

func TestDemoAccountsLeaveSignUpsOut(t *testing.T) {
	e := demoEnv(t)
	out := e.signUp("kopi-senja", "rina@example.com")
	var demo struct {
		Users   []domain.User   `json:"users"`
		Tenants []domain.Tenant `json:"tenants"`
	}
	if code := e.call("GET", "/auth/demo-accounts", "", nil, &demo); code != 200 {
		t.Fatalf("demo accounts: %d", code)
	}
	if len(demo.Tenants) != 3 || len(demo.Users) != 9 {
		t.Errorf("demo lists %d tenants and %d users", len(demo.Tenants), len(demo.Users))
	}
	for _, u := range demo.Users {
		if u.ID == out.User.ID {
			t.Error("the new owner is listed")
		}
	}
}

func TestOwnerConfirmsEmailBeforePublishing(t *testing.T) {
	e, box := mailEnv(t)
	out := e.signUp("kopi-senja", "rina@example.com")
	token, link := box.link(t, 1)
	if !strings.HasPrefix(link, "https://shop.example.com/verify-email?token=") {
		t.Errorf("link: %s", link)
	}
	var page string
	if err := e.db.Pool.QueryRow(t.Context(), `select id from pages where tenant_id = $1`, out.User.TenantIDs[0]).Scan(&page); err != nil {
		t.Fatal(err)
	}
	if status, code := e.problem("POST", "/pages/"+page+"/publish", out.Token, nil); status != 409 || code != "EMAIL_UNVERIFIED" {
		t.Errorf("publish before confirming: %d %s", status, code)
	}
	if status, code := e.problem("POST", "/pages/"+page+"/schedule", out.Token, map[string]string{"at": "2030-01-01T09:00:00+07:00"}); status != 409 || code != "EMAIL_UNVERIFIED" {
		t.Errorf("schedule before confirming: %d %s", status, code)
	}
	// A new link replaces the first.
	e.expect(202, "POST", "/auth/verify/resend", out.Token, nil)
	fresh, _ := box.link(t, 2)
	e.expect(410, "POST", "/auth/verify", "", map[string]string{"token": token})
	e.expect(204, "POST", "/auth/verify", "", map[string]string{"token": fresh})
	e.expect(410, "POST", "/auth/verify", "", map[string]string{"token": fresh})
	var me struct {
		User    domain.User `json:"user"`
		EmailOn bool        `json:"emailOn"`
	}
	if e.call("GET", "/auth/me", out.Token, nil, &me); !me.EmailOn || me.User.EmailVerifiedAt == nil {
		t.Errorf("me after confirming: %+v", me)
	}
	e.expect(409, "POST", "/auth/verify/resend", out.Token, nil)
	e.expect(200, "POST", "/pages/"+page+"/publish", out.Token, nil)
	// Stores that did not come from sign-up publish as before.
	andi := e.signIn("andi@lari.co.id", password)
	var lariHome string
	if err := e.db.Pool.QueryRow(t.Context(), `select id from pages where tenant_id = 'ten-lari' and data->>'kind' = 'home'`).Scan(&lariHome); err != nil {
		t.Fatal(err)
	}
	e.expect(200, "POST", "/pages/"+lariHome+"/publish", andi, nil)
}

func TestStaffAndOwnersShareOneEmailSpace(t *testing.T) {
	e := setup(t)
	e.signUp("kopi-senja", "rina@example.com")
	if status, code := e.problem("POST", "/users", e.admin, newStaff("Rina@example.com", "marketing", "ten-lari")); status != 409 || code != "EMAIL_TAKEN" {
		t.Errorf("staff on an owner's email: %d %s", status, code)
	}
}
