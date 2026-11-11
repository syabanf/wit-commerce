package currency_test

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/currency"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// fakeFrankfurter answers /latest the way Frankfurter does. With noIDRBase it refuses IDR as a base,
// and with down it fails every call.
type fakeFrankfurter struct {
	mu        sync.Mutex
	calls     []string
	noIDRBase bool
	down      bool
}

func (f *fakeFrankfurter) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, r.URL.Query().Get("from"))
	switch {
	case f.down:
		w.WriteHeader(http.StatusBadGateway)
	case r.URL.Path != "/latest":
		w.WriteHeader(http.StatusNotFound)
	case r.URL.Query().Get("from") == "IDR" && !f.noIDRBase:
		_, _ = w.Write([]byte(`{"amount":1.0,"base":"IDR","date":"2026-11-10","rates":{"AUD":0.000080197,"CNY":0.0003693,"EUR":0.000049371,"GBP":0.000041247,"JPY":0.0087573,"MYR":0.00022456,"SGD":0.000070773,"THB":0.0018525,"USD":0.000055364}}`))
	case r.URL.Query().Get("from") == "EUR":
		_, _ = w.Write([]byte(`{"amount":1.0,"base":"EUR","date":"2026-11-10","rates":{"IDR":20000,"USD":1.1,"JPY":180}}`))
	default:
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"not found"}`))
	}
}

func (f *fakeFrankfurter) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

func setup(t *testing.T) (*currency.Currency, *fakeFrankfurter) {
	t.Helper()
	db := testdb.Open(t)
	fake := &fakeFrankfurter{}
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	c := &currency.Currency{
		Runtime: &kernel.Runtime{DB: db, Clock: clock.New(time.Now()), HTTP: srv.Client()},
		Log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		URL:     srv.URL,
	}
	return c, fake
}

func rates(t *testing.T, c *currency.Currency) map[string]currency.Rate {
	t.Helper()
	got, err := c.List(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]currency.Rate{}
	for _, r := range got.Rates {
		out[r.Code] = r
	}
	return out
}

var admin = kernel.Meta{P: auth.Principal{Kind: auth.KindUser, ID: "usr-dewi", Role: "platform_admin"}, At: clock.Iso(time.Now())}

func TestWithoutSavedRatesTheFallbackApplies(t *testing.T) {
	c, fake := setup(t)
	for code, r := range rates(t, c) {
		if r.Source != currency.SourceFallback || r.Rate != currency.Fallback[code] || r.UpdatedAt != nil {
			t.Errorf("%s: %+v, want the fallback", code, r)
		}
	}
	if fake.count() != 0 {
		t.Error("listing rates called Frankfurter")
	}
}

func TestRefreshReadsTheIDRBaseAndKeepsManualRates(t *testing.T) {
	c, _ := setup(t)
	manual := 0.00007
	if _, err := c.Save(t.Context(), admin, currency.RatesInput{Rates: []currency.RateInput{{Code: "USD", Source: "manual", Rate: &manual}}}); err != nil {
		t.Fatal(err)
	}
	out := c.Refresh(t.Context())
	if !out.Ok || out.Updated != 8 {
		t.Fatalf("refresh: %+v, want 8 automatic rates written", out)
	}
	got := rates(t, c)
	if r := got["USD"]; r.Source != currency.SourceManual || r.Rate != manual {
		t.Errorf("the refresh overwrote the manual USD rate: %+v", r)
	}
	if r := got["JPY"]; r.Source != currency.SourceAuto || r.Rate != 0.0087573 || r.AgeSeconds == nil {
		t.Errorf("JPY: %+v, want the fetched rate", r)
	}

	// Back to automatic: the next refresh writes it.
	if _, err := c.Save(t.Context(), admin, currency.RatesInput{Rates: []currency.RateInput{{Code: "USD", Source: "auto"}}}); err != nil {
		t.Fatal(err)
	}
	c.Refresh(t.Context())
	if r := rates(t, c)["USD"]; r.Source != currency.SourceAuto || r.Rate != 0.000055364 {
		t.Errorf("USD after switching back: %+v", r)
	}
}

func TestAFailedRefreshKeepsTheSavedRates(t *testing.T) {
	c, fake := setup(t)
	c.Refresh(t.Context())
	before := rates(t, c)
	fake.mu.Lock()
	fake.down = true
	fake.mu.Unlock()
	out := c.Refresh(t.Context())
	if out.Ok || out.Error == "" {
		t.Fatalf("refresh against a failing host: %+v", out)
	}
	for code, r := range rates(t, c) {
		if r.Rate != before[code].Rate || r.Source != currency.SourceAuto {
			t.Errorf("%s changed after a failed refresh: %+v", code, r)
		}
	}
}

func TestWithoutAnIDRBaseTheRefreshDerivesFromEUR(t *testing.T) {
	c, fake := setup(t)
	fake.noIDRBase = true
	if out := c.Refresh(t.Context()); !out.Ok || out.Updated != 3 {
		t.Fatalf("refresh: %+v, want EUR, USD and JPY", out)
	}
	got := rates(t, c)
	for code, want := range map[string]float64{"EUR": 1.0 / 20000, "USD": 1.1 / 20000, "JPY": 180.0 / 20000} {
		if r := got[code]; r.Source != currency.SourceAuto || r.Rate != want {
			t.Errorf("%s: %+v, want %g", code, r, want)
		}
	}
	if r := got["SGD"]; r.Source != currency.SourceFallback {
		t.Errorf("SGD had no rate in the answer but changed: %+v", r)
	}
}

func TestTheTimerRefreshesAtMostOnceADay(t *testing.T) {
	c, fake := setup(t)
	c.RefreshIfDue(t.Context())
	c.RefreshIfDue(t.Context())
	if n := fake.count(); n != 1 {
		t.Fatalf("Frankfurter called %d times, want 1", n)
	}
	// A new process reads the last refresh from the table and waits too.
	again := &currency.Currency{Runtime: c.Runtime, Log: c.Log, URL: c.URL}
	again.RefreshIfDue(t.Context())
	if n := fake.count(); n != 1 {
		t.Errorf("a restart refreshed again: %d calls", n)
	}
}

func TestSaveRefusesBadInput(t *testing.T) {
	c, _ := setup(t)
	zero, rate := 0.0, 1.0
	for name, in := range map[string]currency.RateInput{
		"unknown code":   {Code: "XYZ", Source: "manual", Rate: &rate},
		"rupiah":         {Code: "IDR", Source: "manual", Rate: &rate},
		"no rate":        {Code: "USD", Source: "manual"},
		"zero rate":      {Code: "USD", Source: "manual", Rate: &zero},
		"unknown source": {Code: "USD", Source: "ecb"},
	} {
		if _, err := c.Save(t.Context(), admin, currency.RatesInput{Rates: []currency.RateInput{in}}); err == nil {
			t.Errorf("%s: saved", name)
		}
	}
}

// The Go fallback table must match the one the apps use without an API.
func TestFallbackMatchesTheFixtures(t *testing.T) {
	src, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "packages", "fixtures", "src", "currency.ts"))
	if err != nil {
		t.Fatal(err)
	}
	block := regexp.MustCompile(`(?s)FALLBACK_RATES[^{]*\{(.*?)\}`).FindSubmatch(src)
	if block == nil {
		t.Fatal("FALLBACK_RATES not found in currency.ts")
	}
	found := map[string]float64{}
	for _, m := range regexp.MustCompile(`([A-Z]{3}):\s*([0-9.e-]+)`).FindAllSubmatch(block[1], -1) {
		v, err := strconv.ParseFloat(string(m[2]), 64)
		if err != nil {
			t.Fatal(err)
		}
		found[string(m[1])] = v
	}
	if len(found) != len(currency.Fallback) {
		t.Errorf("fixtures list %d rates, Go lists %d", len(found), len(currency.Fallback))
	}
	for code, want := range currency.Fallback {
		if found[code] != want {
			t.Errorf("%s: fixtures %g, Go %g", code, found[code], want)
		}
	}
}
