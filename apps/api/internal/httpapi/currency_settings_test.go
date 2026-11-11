package httpapi_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/currency"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// currencyEnv runs the API with a fake Frankfurter behind the outbound client, signed in as the
// platform admin. Every outbound call reaches the fake, whatever host the API asked for.
func currencyEnv(t *testing.T) (*env, *atomic.Int32) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"amount":1.0,"base":"IDR","date":"2026-11-10","rates":{"USD":0.00006,"SGD":0.00008,"JPY":0.009}}`))
	}))
	t.Cleanup(fake.Close)
	target, _ := url.Parse(fake.URL)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	vault, _ := auth.DeriveVault("test")
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(),
		Outbound: &http.Client{Transport: askedHost{target}, Timeout: 5 * time.Second},
		Log:      slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login("dewi@commerceos.id")
	return e, &calls
}

func TestOnlyAPlatformAdminReachesCurrencySettings(t *testing.T) {
	e, calls := currencyEnv(t)
	andi := e.login("andi@lari.co.id")
	rate := 0.0001
	body := map[string]any{"rates": []currency.RateInput{{Code: "USD", Source: "manual", Rate: &rate}}}
	var key struct {
		Secret string `json:"secret"`
	}
	e.call("POST", "/tenants/ten-lari/credentials", e.admin, map[string]any{"name": "ERP", "scopes": []string{"catalog:read"}}, &key)
	for _, token := range []string{andi, key.Secret} {
		e.expect(403, "GET", "/settings/currencies", token, nil)
		e.expect(403, "PUT", "/settings/currencies", token, body)
		e.expect(403, "POST", "/settings/currencies/refresh", token, nil)
	}
	e.expect(401, "GET", "/settings/currencies", "", nil)
	if calls.Load() != 0 {
		t.Error("a refused refresh called Frankfurter")
	}

	var saved currency.Rates
	if code := e.call("PUT", "/settings/currencies", e.admin, body, &saved); code != 200 {
		t.Fatalf("PUT /settings/currencies: %d", code)
	}
	var refreshed currency.Rates
	if code := e.call("POST", "/settings/currencies/refresh", e.admin, nil, &refreshed); code != 200 {
		t.Fatalf("POST /settings/currencies/refresh: %d", code)
	}
	if refreshed.Refresh == nil || !refreshed.Refresh.Ok || refreshed.Refresh.Updated != 2 {
		t.Errorf("refresh: %+v, want SGD and JPY written and USD kept", refreshed.Refresh)
	}
	for _, r := range refreshed.Rates {
		want := map[string]string{"USD": "manual", "SGD": "auto", "JPY": "auto"}[r.Code]
		if want == "" {
			want = "fallback"
		}
		if r.Source != want {
			t.Errorf("%s: source %s, want %s", r.Code, r.Source, want)
		}
	}
}

func TestShopStateCarriesOnlyTheStoresCurrencies(t *testing.T) {
	e, _ := currencyEnv(t)
	shopRates := func() []currency.ShopRate {
		t.Helper()
		var out struct {
			CurrencyRates []currency.ShopRate `json:"currencyRates"`
		}
		if code := e.call("GET", "/shop/lari/state", "", nil, &out); code != 200 {
			t.Fatalf("GET /shop/lari/state: %d", code)
		}
		return out.CurrencyRates
	}
	if got := shopRates(); len(got) != 0 {
		t.Errorf("a store without display currencies sent rates: %+v", got)
	}

	andi := e.login("andi@lari.co.id")
	e.expect(422, "PUT", "/tenants/ten-lari/display-currencies", andi, map[string]any{"currencies": []string{"XYZ"}})
	e.expect(200, "PUT", "/tenants/ten-lari/display-currencies", andi, map[string]any{"currencies": []string{"JPY", "USD", "JPY"}})
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from tenants where id = 'ten-lari'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var tenant domain.Tenant
	if err := json.Unmarshal(raw, &tenant); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(tenant.DisplayCurrencies, []string{"JPY", "USD"}) {
		t.Errorf("saved display currencies %v, want [JPY USD]", tenant.DisplayCurrencies)
	}

	manual := 0.0001
	e.expect(200, "PUT", "/settings/currencies", e.admin, map[string]any{"rates": []currency.RateInput{{Code: "USD", Source: "manual", Rate: &manual}}})
	want := []currency.ShopRate{{Code: "JPY", Rate: currency.Fallback["JPY"]}, {Code: "USD", Rate: manual}}
	if got := shopRates(); !slices.Equal(got, want) {
		t.Errorf("shop rates %+v, want %+v", got, want)
	}

	// Clearing the list drops the field.
	e.expect(200, "PUT", "/tenants/ten-lari/display-currencies", andi, map[string]any{"currencies": []string{}})
	if err := e.db.Pool.QueryRow(context.Background(), `select data from tenants where id = 'ten-lari'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "displayCurrencies") {
		t.Errorf("an empty list stayed on the tenant: %s", raw)
	}
	// Another brand's staff cannot change it.
	e.expect(403, "PUT", "/tenants/ten-lari/display-currencies", e.login("hendra@teknika.co.id"), map[string]any{"currencies": []string{"USD"}})
}
