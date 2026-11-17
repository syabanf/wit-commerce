package httpapi_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/billing"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

const platformAdmin = "dewi@commerceos.id"

// overview reads Lari's Plan & usage as its tenant admin.
func (e *env) overview() service.PlanOverview {
	e.t.Helper()
	var out service.PlanOverview
	if code := e.call("GET", "/tenants/ten-lari/plan", e.admin, nil, &out); code != 200 {
		e.t.Fatalf("plan overview: %d", code)
	}
	return out
}

// tightenGrowth saves Growth's limits with change applied, as the platform admin.
func (e *env) tightenGrowth(change func(*billing.Limits)) {
	e.t.Helper()
	limits := billing.Defaults["growth"].Limits
	change(&limits)
	e.expect(200, "PUT", "/settings/plans/growth", e.login(platformAdmin), billing.PlanInput{Price: 750_000, Limits: limits})
}

func (e *env) expectPlanLimit(method, path, token string, body any) {
	e.t.Helper()
	if status, code := e.problem(method, path, token, body); status != 409 || code != billing.LimitCode {
		e.t.Errorf("%s %s: got %d %s, want 409 %s", method, path, status, code, billing.LimitCode)
	}
}

func copyOf[T any](t *testing.T, db *store.DB, collection, id string) T {
	t.Helper()
	v, err := store.Get[T](context.Background(), db.Pool, collection, id)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestSeededBrandsFitTheirPlans(t *testing.T) {
	e := setup(t)
	o := e.overview()
	if o.Plan != "growth" {
		t.Fatalf("lari is on %s", o.Plan)
	}
	limits := o.Plans[1].Limits
	for _, key := range billing.LimitKeys {
		if o.Usage[key] > int64(limits.Of(key)) {
			t.Errorf("lari uses %d %s, over the growth limit of %d", o.Usage[key], key, limits.Of(key))
		}
	}
	if o.Usage[billing.Products] != 30 || o.Usage[billing.Warehouses] != 2 {
		t.Errorf("usage: %+v", o.Usage)
	}
}

func TestEachLimitRefusesAtTheBoundary(t *testing.T) {
	e := setup(t)
	used := e.overview().Usage
	e.tightenGrowth(func(l *billing.Limits) {
		l.Products, l.Sellers, l.Warehouses = int(used[billing.Products])+1, int(used[billing.Sellers])+1, int(used[billing.Warehouses])+1
		l.Staff, l.Currencies = int(used[billing.Staff])+1, 2
	})

	product := copyOf[domain.Product](t, e.db, "products", "prd-lr-101")
	product.ID, product.Code = "prd-plan-1", "PLAN-1"
	e.expect(200, "PUT", "/products/prd-plan-1", e.admin, product)
	product.ID, product.Code = "prd-plan-2", "PLAN-2"
	e.expectPlanLimit("PUT", "/products/prd-plan-2", e.admin, product)
	// An edit of a product that exists is not a creation and still passes.
	product = copyOf[domain.Product](t, e.db, "products", "prd-lr-101")
	product.Name = "Renamed at the limit"
	e.expect(200, "PUT", "/products/prd-lr-101", e.admin, product)

	sellers, _ := store.ListTenant[domain.Seller](context.Background(), e.db.Pool, "sellers", "ten-lari")
	seller := sellers[0]
	seller.ID, seller.Code, seller.Slug = "sel-plan-1", "PLAN1", "plan-one"
	e.expect(200, "PUT", "/sellers/sel-plan-1", e.admin, seller)
	seller.ID, seller.Code, seller.Slug = "sel-plan-2", "PLAN2", "plan-two"
	e.expectPlanLimit("PUT", "/sellers/sel-plan-2", e.admin, seller)

	wh := map[string]string{"tenantId": "ten-lari", "code": "BDG", "name": "Bandung", "city": "Bandung"}
	e.expect(200, "POST", "/warehouses", e.admin, wh)
	wh["code"] = "SBY"
	e.expectPlanLimit("POST", "/warehouses", e.admin, wh)

	e.create(e.admin, newStaff("seat@example.com", "marketing", "ten-lari"))
	e.expectPlanLimit("POST", "/users", e.admin, newStaff("over@example.com", "marketing", "ten-lari"))

	e.expect(200, "PUT", "/tenants/ten-lari/display-currencies", e.admin, map[string]any{"currencies": []string{"USD", "SGD"}})
	e.expectPlanLimit("PUT", "/tenants/ten-lari/display-currencies", e.admin, map[string]any{"currencies": []string{"USD", "SGD", "JPY"}})

	_, why := e.problem("PUT", "/sellers/sel-plan-2", e.admin, seller)
	if why != billing.LimitCode {
		t.Fatalf("seller refusal: %s", why)
	}
	var p httpapi.Problem
	if status := e.call("POST", "/warehouses", e.admin, wh, &p); status != 409 {
		t.Fatalf("warehouse: %d", status)
	}
}

func TestLimitSentenceNamesTheLimitAndThePlan(t *testing.T) {
	err := billing.LimitReached(billing.Defaults["starter"], billing.Warehouses)
	if got := err.Error(); !strings.Contains(got, "Starter plan allows 1 warehouse.") {
		t.Errorf("sentence: %s", got)
	}
}

func TestMediaStorageLimit(t *testing.T) {
	e := setupMedia(t)
	e.tightenGrowth(func(l *billing.Limits) { l.MediaMB = 0 })
	if code, _ := e.upload(e.admin, "ten-lari", picture(t, "png", 8, 8)); code != 409 {
		t.Errorf("upload past the storage limit: %d, want 409", code)
	}
	e.tightenGrowth(func(l *billing.Limits) { l.MediaMB = 1 })
	if code, _ := e.upload(e.admin, "ten-lari", picture(t, "png", 8, 8)); code != 201 {
		t.Errorf("upload below the storage limit: %d, want 201", code)
	}
	if used := e.overview().Usage[billing.MediaMB]; used != 1 {
		t.Errorf("media usage: %d MB, want 1", used)
	}
}

func TestAssistantDailyCapComesFromThePlan(t *testing.T) {
	e, _, prompts := assistantEnv(t)
	e.tightenGrowth(func(l *billing.Limits) { l.AssistantPerDay = 2 })
	e.expect(200, "POST", assistantPath, e.admin, ask("hi", "/"))
	e.expect(200, "POST", assistantPath, e.admin, ask("hi", "/"))
	e.expectPlanLimit("POST", assistantPath, e.admin, ask("hi", "/"))
	if len(*prompts) != 2 {
		t.Errorf("the model took %d calls, want 2", len(*prompts))
	}
	if used := e.overview().Usage[billing.AssistantPerDay]; used != 3 {
		t.Errorf("assistant usage: %d, want 3", used)
	}
}

func TestApprovedUpgradeLiftsTheLimit(t *testing.T) {
	e := setup(t)
	e.tightenGrowth(func(l *billing.Limits) { l.Products = 30 })
	product := copyOf[domain.Product](t, e.db, "products", "prd-lr-101")
	product.ID, product.Code = "prd-up-1", "UP-1"
	e.expectPlanLimit("PUT", "/products/prd-up-1", e.admin, product)

	var asked billing.PlanRequest
	if code := e.call("POST", "/tenants/ten-lari/plan-requests", e.admin, map[string]string{"plan": "enterprise", "note": "More products"}, &asked); code != 201 {
		t.Fatalf("request: %d", code)
	}
	e.expect(409, "POST", "/tenants/ten-lari/plan-requests", e.admin, map[string]string{"plan": "growth"})
	// The brand admin cannot answer their own request.
	e.expect(403, "POST", "/plan-requests/"+asked.ID+"/decide", e.admin, map[string]any{"approve": true})

	dewi := e.login(platformAdmin)
	var decided billing.PlanRequest
	if code := e.call("POST", "/plan-requests/"+asked.ID+"/decide", dewi, map[string]any{"approve": true}, &decided); code != 200 || decided.Status != "approved" {
		t.Fatalf("decide: %d %+v", code, decided)
	}
	e.expect(409, "POST", "/plan-requests/"+asked.ID+"/decide", dewi, map[string]any{"approve": false})
	if o := e.overview(); o.Plan != "enterprise" || len(o.Requests) != 1 {
		t.Errorf("after approval: plan %s, %d requests", o.Plan, len(o.Requests))
	}
	e.expect(200, "PUT", "/products/prd-up-1", e.admin, product)
}

func TestDeclinedRequestKeepsThePlan(t *testing.T) {
	e := setup(t)
	var asked billing.PlanRequest
	e.call("POST", "/tenants/ten-lari/plan-requests", e.admin, map[string]string{"plan": "enterprise"}, &asked)
	e.expect(200, "POST", "/plan-requests/"+asked.ID+"/decide", e.login(platformAdmin), map[string]any{"approve": false, "note": "Talk to us first"})
	if o := e.overview(); o.Plan != "growth" || o.Requests[0].Status != "declined" {
		t.Errorf("after decline: %s %+v", o.Plan, o.Requests)
	}
}

func TestInvoicesIssueOncePerMonth(t *testing.T) {
	e := setup(t)
	dewi := e.login(platformAdmin)
	e.expect(200, "POST", "/system/tick", dewi, nil)
	e.expect(200, "POST", "/system/tick", dewi, nil)
	var plans struct {
		Invoices []billing.Invoice `json:"invoices"`
	}
	if code := e.call("GET", "/settings/plans", dewi, nil, &plans); code != 200 {
		t.Fatalf("plans: %d", code)
	}
	// The period is the month on the app clock. Lari and Aruna on Growth, Teknika on Enterprise; a second tick in the month adds nothing.
	if len(plans.Invoices) != 3 {
		t.Fatalf("got %d invoices, want 3: %+v", len(plans.Invoices), plans.Invoices)
	}
	for _, inv := range plans.Invoices {
		want := billing.Defaults[inv.Plan].Price
		if inv.Status != "due" || inv.Amount != want || inv.Period != inv.IssuedAt[:7] {
			t.Errorf("invoice: %+v", inv)
		}
	}
	// A store on the free plan gets none.
	e.signUp("kopi-senja", "rina@example.com")
	e.expect(200, "POST", "/system/tick", dewi, nil)
	e.call("GET", "/settings/plans", dewi, nil, &plans)
	if len(plans.Invoices) != 3 {
		t.Errorf("a free store was invoiced: %d", len(plans.Invoices))
	}

	var lari billing.Invoice
	for _, inv := range plans.Invoices {
		if inv.TenantID == "ten-lari" {
			lari = inv
		}
	}
	e.expect(403, "POST", "/invoices/"+lari.ID+"/status", e.admin, map[string]string{"status": "paid"})
	var paid billing.Invoice
	if code := e.call("POST", "/invoices/"+lari.ID+"/status", dewi, map[string]string{"status": "paid"}, &paid); code != 200 || paid.Status != "paid" || paid.PaidAt == nil {
		t.Errorf("mark paid: %d %+v", code, paid)
	}
	e.expect(422, "POST", "/invoices/"+lari.ID+"/status", dewi, map[string]string{"status": "refunded"})
	if o := e.overview(); len(o.Invoices) != 1 || o.Invoices[0].Status != "paid" {
		t.Errorf("brand invoices: %+v", o.Invoices)
	}
}

func TestOnlyAPlatformAdminChangesPlans(t *testing.T) {
	e := setup(t)
	body := billing.PlanInput{Price: 1, Limits: billing.Defaults["starter"].Limits}
	e.expect(401, "GET", "/settings/plans", "", nil)
	e.expect(403, "GET", "/settings/plans", e.admin, nil)
	e.expect(403, "PUT", "/settings/plans/starter", e.admin, body)
	e.expect(403, "PUT", "/tenants/ten-lari/plan", e.admin, map[string]string{"plan": "enterprise"})
	e.expect(403, "PUT", "/settings/captcha", e.admin, map[string]string{"siteKey": "x", "secret": "y"})
	key := e.issue("catalog:write").Secret
	e.expect(403, "GET", "/tenants/ten-lari/plan", key, nil)
	// A staff member who is not a brand admin sees no plan, and no admin sees another brand's.
	e.expect(403, "GET", "/tenants/ten-lari/plan", e.login("maya@lari.co.id"), nil)
	e.expect(403, "GET", "/tenants/ten-teknika/plan", e.admin, nil)

	dewi := e.login(platformAdmin)
	bad := body
	bad.Limits.Warehouses = 0
	e.expect(422, "PUT", "/settings/plans/starter", dewi, bad)
	e.expect(404, "PUT", "/settings/plans/platinum", dewi, body)
	e.expect(200, "PUT", "/settings/plans/starter", dewi, body)
	e.expect(200, "PUT", "/tenants/ten-lari/plan", dewi, map[string]string{"plan": "enterprise"})
	if o := e.overview(); o.Plan != "enterprise" || o.Plans[0].Price != 1 || o.Plans[0].UpdatedBy == nil {
		t.Errorf("after platform changes: %s %+v", o.Plan, o.Plans[0])
	}
}

func TestSharedLimiterCountsAcrossInstances(t *testing.T) {
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	var urls []string
	for range 2 {
		srv := httptest.NewServer(httpapi.New(httpapi.Options{
			DB: db, Clock: clock.New(time.Now()), Signer: signer, Hub: events.New(),
			Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
		}))
		t.Cleanup(srv.Close)
		urls = append(urls, srv.URL+"/api/v1")
	}
	// Sign-up allows 5 an hour per client. Each instance alone would allow 5; together they allow 5.
	statuses := []int{}
	for i := range 6 {
		e := &env{t: t, url: urls[i%2], db: db}
		body := signUpBody("", "x"+string(rune('a'+i))+"@example.com")
		body["website"] = "bot"
		status, _ := e.problem("POST", "/auth/signup", "", body)
		statuses = append(statuses, status)
	}
	for i, s := range statuses[:5] {
		if s != 422 {
			t.Errorf("sign-up %d: %d, want 422", i+1, s)
		}
	}
	if statuses[5] != 429 {
		t.Errorf("sixth sign-up across two instances: %d, want 429", statuses[5])
	}
}

// fakeTurnstile answers siteverify: success for the token "good", failure otherwise.
type fakeTurnstile struct {
	mu      sync.Mutex
	secrets []string
}

func (f *fakeTurnstile) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	f.mu.Lock()
	f.secrets = append(f.secrets, r.PostForm.Get("secret")+" "+r.Header.Get("X-Asked-Host")+r.URL.Path)
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if r.PostForm.Get("response") == "good" {
		_, _ = w.Write([]byte(`{"success":true}`))
		return
	}
	_, _ = w.Write([]byte(`{"success":false,"error-codes":["invalid-input-response"]}`))
}

func turnstileEnv(t *testing.T) (*env, *fakeTurnstile) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	fake := &fakeTurnstile{}
	cf := httptest.NewServer(fake)
	t.Cleanup(cf.Close)
	target, _ := url.Parse(cf.URL)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	vault, _ := auth.DeriveVault("test")
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(),
		Outbound: &http.Client{Transport: askedHost{target}, Timeout: 5 * time.Second},
		Log:      slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login(platformAdmin)
	return e, fake
}

func (e *env) siteKey() string {
	e.t.Helper()
	var cfg struct {
		TurnstileSiteKey string `json:"turnstileSiteKey"`
	}
	if code := e.call("GET", "/config", "", nil, &cfg); code != 200 {
		e.t.Fatalf("config: %d", code)
	}
	return cfg.TurnstileSiteKey
}

func TestTurnstileOffChangesNothing(t *testing.T) {
	e, fake := turnstileEnv(t)
	if key := e.siteKey(); key != "" {
		t.Errorf("site key while off: %q", key)
	}
	e.expect(200, "POST", "/auth/signup", "", signUpBody("kopi-senja", "rina@example.com"))
	e.expect(200, "POST", "/shop/lari/register", "", map[string]string{"name": "Sari", "email": "sari@example.com", "password": "a-long-password"})
	if len(fake.secrets) != 0 {
		t.Errorf("Cloudflare was asked while Turnstile is off")
	}
}

func TestTurnstileRefusesABadTokenAndAcceptsAGoodOne(t *testing.T) {
	e, fake := turnstileEnv(t)
	const secret = "0x4AAAAAAAtestsecretkey"
	e.expect(422, "PUT", "/settings/captcha", e.admin, map[string]string{"siteKey": "0x4AAAAAAAsitekey"})
	var saved struct {
		SiteKey     string `json:"siteKey"`
		SecretLast4 string `json:"secretLast4"`
		Secret      string `json:"secret"`
	}
	if code := e.call("PUT", "/settings/captcha", e.admin, map[string]string{"siteKey": "0x4AAAAAAAsitekey", "secret": secret}, &saved); code != 200 || saved.Secret != "" || saved.SecretLast4 != "tkey" {
		t.Fatalf("save: %d %+v", code, saved)
	}
	if key := e.siteKey(); key != "0x4AAAAAAAsitekey" {
		t.Errorf("site key: %q", key)
	}

	body := signUpBody("kopi-senja", "rina@example.com")
	if status, code := e.problem("POST", "/auth/signup", "", body); status != 422 || code != "CAPTCHA_FAILED" {
		t.Errorf("no token: %d %s", status, code)
	}
	body["captchaToken"] = "bad"
	if status, code := e.problem("POST", "/auth/signup", "", body); status != 422 || code != "CAPTCHA_FAILED" {
		t.Errorf("bad token: %d %s", status, code)
	}
	body["captchaToken"] = "good"
	e.expect(200, "POST", "/auth/signup", "", body)

	reg := map[string]string{"name": "Sari", "email": "sari@example.com", "password": "a-long-password", "captchaToken": "bad"}
	if status, code := e.problem("POST", "/shop/lari/register", "", reg); status != 422 || code != "CAPTCHA_FAILED" {
		t.Errorf("register with a bad token: %d %s", status, code)
	}
	reg["captchaToken"] = "good"
	e.expect(200, "POST", "/shop/lari/register", "", reg)

	fake.mu.Lock()
	for _, s := range fake.secrets {
		if s != secret+" challenges.cloudflare.com/turnstile/v0/siteverify" {
			t.Errorf("siteverify call: %q", s)
		}
	}
	fake.mu.Unlock()

	// Both keys empty turns the check off again.
	e.expect(200, "PUT", "/settings/captcha", e.admin, map[string]string{})
	e.expect(200, "POST", "/auth/signup", "", signUpBody("teh-pagi", "budi@example.com"))
}
