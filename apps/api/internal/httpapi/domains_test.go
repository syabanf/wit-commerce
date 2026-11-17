package httpapi_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// fakeDNS answers from maps; a name it does not hold has no records. slow makes every lookup wait
// for the caller's deadline.
type fakeDNS struct {
	mu    sync.Mutex
	txt   map[string][]string
	cname map[string]string
	hosts map[string][]string
	slow  bool
}

var errNoSuchHost = errors.New("no such host")

func (f *fakeDNS) wait(ctx context.Context) error {
	f.mu.Lock()
	slow := f.slow
	f.mu.Unlock()
	if slow {
		<-ctx.Done()
		return ctx.Err()
	}
	return nil
}

func (f *fakeDNS) LookupTXT(ctx context.Context, name string) ([]string, error) {
	if err := f.wait(ctx); err != nil {
		return nil, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if v, ok := f.txt[name]; ok {
		return v, nil
	}
	return nil, errNoSuchHost
}

func (f *fakeDNS) LookupCNAME(ctx context.Context, host string) (string, error) {
	if err := f.wait(ctx); err != nil {
		return "", err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if v, ok := f.cname[host]; ok {
		return v, nil
	}
	return host + ".", nil
}

func (f *fakeDNS) LookupHost(ctx context.Context, host string) ([]string, error) {
	if err := f.wait(ctx); err != nil {
		return nil, err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.hosts[host], nil
}

func (f *fakeDNS) set(fn func(f *fakeDNS)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	fn(f)
}

const askSecret = "proxy-secret"

// domainEnv runs the API with store hosts under shops.example.com, a fake resolver and A records
// allowed to 203.0.113.10.
func domainEnv(t *testing.T) (*env, *fakeDNS) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	dns := &fakeDNS{txt: map[string][]string{}, cname: map[string]string{}, hosts: map[string][]string{}}
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	vault, _ := auth.DeriveVault("test")
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
		PublicURL: "https://console.example.com", StoreRootDomain: "shops.example.com",
		DNS: dns, DNSTimeout: 200 * time.Millisecond, DomainTargetIPs: []string{"203.0.113.10"},
		DomainAskSecret: askSecret,
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login("dewi@commerceos.id")
	return e, dns
}

func (e *env) tenant(id string) domain.Tenant {
	e.t.Helper()
	tenant, err := store.Get[domain.Tenant](e.t.Context(), e.db.Pool, "tenants", id)
	if err != nil {
		e.t.Fatal(err)
	}
	return tenant
}

type domainCheck struct {
	DomainStatus identity.DomainStatus `json:"domainStatus"`
}

func (e *env) checkDomain(token, tenantID string) identity.DomainStatus {
	e.t.Helper()
	var out domainCheck
	if code := e.call("POST", "/tenants/"+tenantID+"/domain/verify", token, nil, &out); code != 200 {
		e.t.Fatalf("verify: %d", code)
	}
	return out.DomainStatus
}

func TestDomainValidation(t *testing.T) {
	e, _ := domainEnv(t)
	andi := e.login("andi@lari.co.id")
	for _, bad := range []string{
		"", "Www.TokoSaya.com", "tokosaya", "http://tokosaya.com", "tokosaya.com/shop", "203.0.113.5",
		"tokosaya.com:8443", "localhost", "shop.localhost", "store.test", "-bad.com", "a..b.com",
		"lari.shops.example.com", "shops.example.com", "www.shops.example.com", "console.example.com",
		"x.commerce.reddie.id", strings.Repeat("a", 64) + ".com",
	} {
		if code, _ := e.problem("PUT", "/tenants/ten-lari/domain", andi, map[string]any{"domain": bad}); code != 422 {
			t.Errorf("%q: %d, want 422", bad, code)
		}
	}
	for _, good := range []string{"www.tokosaya.com", "tokosaya.co.id", "xn--80ak6aa92e.com"} {
		if code := e.call("PUT", "/tenants/ten-lari/domain", andi, map[string]any{"domain": good}, nil); code != 200 {
			t.Errorf("%q: %d, want 200", good, code)
		}
	}
}

func TestDomainIsUniqueAcrossBrands(t *testing.T) {
	e, _ := domainEnv(t)
	e.expect(200, "PUT", "/tenants/ten-lari/domain", e.admin, map[string]any{"domain": "www.tokosaya.com"})
	for _, taken := range []string{"tokosaya.com", "www.tokosaya.com"} {
		code, problem := e.problem("PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": taken})
		if code != 409 || problem != "DOMAIN_TAKEN" {
			t.Errorf("%s: %d %s, want 409 DOMAIN_TAKEN", taken, code, problem)
		}
	}
	// Two writes that both passed the check: the index refuses the second, and the API says why.
	_, err := e.db.Pool.Exec(t.Context(), `update tenants set data = data || '{"domain":"tokosaya.com","domainToken":"t"}' where id = 'ten-teknika'`)
	if err == nil || !strings.Contains(err.Error(), "tenants_domain_idx") {
		t.Errorf("the unique index let a second brand claim the domain: %v", err)
	}
}

func TestSettingADomainResetsVerification(t *testing.T) {
	e, dns := domainEnv(t)
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": "www.teknika-store.com"})
	first := e.tenant("ten-teknika")
	if first.DomainVerified || !strings.HasPrefix(first.DomainToken, "wit-verify-") {
		t.Fatalf("new domain: verified %v token %q", first.DomainVerified, first.DomainToken)
	}
	dns.set(func(f *fakeDNS) {
		f.txt["_wit-commerce.www.teknika-store.com"] = []string{first.DomainToken}
		f.cname["www.teknika-store.com"] = "teknika.shops.example.com."
	})
	if !e.checkDomain(e.admin, "ten-teknika").Verified {
		t.Fatal("right records did not verify")
	}
	// Saving the same domain keeps the proof; a new one starts over with a new token.
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": "www.teknika-store.com"})
	if !e.tenant("ten-teknika").DomainVerified {
		t.Error("saving the same domain dropped its verification")
	}
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": "teknika-store.com"})
	next := e.tenant("ten-teknika")
	if next.DomainVerified || next.DomainVerifiedAt != "" || next.DomainToken == first.DomainToken {
		t.Errorf("a new domain kept the old proof: %+v", next)
	}
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": nil})
	if gone := e.tenant("ten-teknika"); gone.Domain != nil || gone.DomainToken != "" {
		t.Errorf("disconnect left %+v", gone)
	}
}

func TestVerifyNeedsTheTokenAndThePlatformTarget(t *testing.T) {
	e, dns := domainEnv(t)
	hendra := e.login("hendra@teknika.co.id")
	const name = "www.teknika-store.com"
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", hendra, map[string]any{"domain": name})
	token := e.tenant("ten-teknika").DomainToken
	txt := "_wit-commerce." + name

	status := e.checkDomain(hendra, "ten-teknika")
	if status.Verified || *status.Owned || *status.Pointed || status.Detail == "" {
		t.Errorf("no records: %+v", status)
	}

	dns.set(func(f *fakeDNS) {
		f.txt[txt] = []string{"wit-verify-wrong"}
		f.cname[name] = "teknika.shops.example.com."
	})
	status = e.checkDomain(hendra, "ten-teknika")
	if status.Verified || *status.Owned || !*status.Pointed {
		t.Errorf("wrong TXT: %+v", status)
	}
	if r := status.Records[0]; r.Type != "TXT" || *r.OK || len(r.Found) != 1 || r.Found[0] != "wit-verify-wrong" || r.Value != token {
		t.Errorf("TXT record result: %+v", r)
	}

	dns.set(func(f *fakeDNS) { f.txt[txt] = []string{token}; f.cname[name] = "lari.shops.example.com." })
	status = e.checkDomain(hendra, "ten-teknika")
	if status.Verified || !*status.Owned || *status.Pointed || !strings.Contains(status.Detail, "lari.shops.example.com") {
		t.Errorf("CNAME to another store: %+v", status)
	}

	dns.set(func(f *fakeDNS) { delete(f.cname, name); f.hosts[name] = []string{"198.51.100.7"} })
	if status = e.checkDomain(hendra, "ten-teknika"); status.Verified || *status.Pointed {
		t.Errorf("A record to another server: %+v", status)
	}

	dns.set(func(f *fakeDNS) { f.cname[name] = "teknika.shops.example.com."; f.slow = true })
	if status = e.checkDomain(hendra, "ten-teknika"); status.Verified || !strings.Contains(status.Detail, "in time") {
		t.Errorf("timeout: %+v", status)
	}
	if e.tenant("ten-teknika").DomainVerified {
		t.Fatal("a failed check verified the domain")
	}

	dns.set(func(f *fakeDNS) { f.slow = false })
	status = e.checkDomain(hendra, "ten-teknika")
	if !status.Verified || status.VerifiedAt == "" || !*status.Records[1].OK {
		t.Fatalf("right records: %+v", status)
	}
	if got := e.tenant("ten-teknika"); !got.DomainVerified || got.DomainVerifiedAt == "" || got.CustomDomain() != name {
		t.Errorf("after a passing check: %+v", got)
	}
}

func TestVerifyAcceptsTheTargetAddresses(t *testing.T) {
	e, dns := domainEnv(t)
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": "teknika-store.com"})
	token := e.tenant("ten-teknika").DomainToken
	dns.set(func(f *fakeDNS) {
		f.txt["_wit-commerce.teknika-store.com"] = []string{token}
		f.hosts["teknika-store.com"] = []string{"203.0.113.10"}
	})
	if status := e.checkDomain(e.admin, "ten-teknika"); !status.Verified {
		t.Errorf("A record to the platform: %+v", status)
	}
}

func TestOnlyVerifiedDomainsServeAStore(t *testing.T) {
	e, dns := domainEnv(t)
	byHost := func(host string) (int, string) {
		var out struct {
			Store string `json:"store"`
		}
		code := e.call("GET", "/shop/by-host?host="+host, "", nil, &out)
		return code, out.Store
	}
	allowed := func(query string) int { return e.call("GET", "/internal/domain-allowed?"+query, "", nil, nil) }

	// The seeded brands carry domains no check ever proved.
	if code, _ := byHost("www.lari.co.id"); code != 404 {
		t.Errorf("a seeded, never checked domain served a store: %d", code)
	}
	e.expect(200, "PUT", "/tenants/ten-teknika/domain", e.admin, map[string]any{"domain": "www.teknika-store.com"})
	for _, host := range []string{"www.teknika-store.com", "teknika-store.com", "unknown.com", ""} {
		if code, _ := byHost(host); code != 404 {
			t.Errorf("unverified %q: %d, want 404", host, code)
		}
		if code := allowed("secret=" + askSecret + "&domain=" + host); code != 404 {
			t.Errorf("domain-allowed unverified %q: %d, want 404", host, code)
		}
	}
	token := e.tenant("ten-teknika").DomainToken
	dns.set(func(f *fakeDNS) {
		f.txt["_wit-commerce.www.teknika-store.com"] = []string{token}
		f.cname["www.teknika-store.com"] = "teknika.shops.example.com."
	})
	e.checkDomain(e.admin, "ten-teknika")
	for _, host := range []string{"www.teknika-store.com", "teknika-store.com", "WWW.Teknika-Store.com:443"} {
		if code, store := byHost(host); code != 200 || store != "teknika" {
			t.Errorf("verified %q: %d %q", host, code, store)
		}
	}
	if code := allowed("secret=" + askSecret + "&domain=www.teknika-store.com"); code != 200 {
		t.Errorf("domain-allowed verified: %d", code)
	}
	if code := allowed("domain=www.teknika-store.com"); code != 403 {
		t.Errorf("domain-allowed without the secret: %d, want 403", code)
	}
}

func TestDomainPermissions(t *testing.T) {
	e, _ := domainEnv(t)
	body := map[string]any{"domain": "www.tokosaya.com"}
	for _, email := range []string{"maya@lari.co.id", "budi@lari.co.id", "fahmi@lari.co.id"} {
		token := e.login(email)
		e.expect(403, "PUT", "/tenants/ten-lari/domain", token, body)
		e.expect(403, "POST", "/tenants/ten-lari/domain/verify", token, nil)
		e.expect(403, "GET", "/tenants/ten-lari/domain", token, nil)
	}
	// A brand admin reaches only their own brands.
	andi := e.login("andi@lari.co.id")
	e.expect(403, "PUT", "/tenants/ten-teknika/domain", andi, body)
	e.expect(403, "POST", "/tenants/ten-teknika/domain/verify", andi, nil)
	e.expect(401, "PUT", "/tenants/ten-lari/domain", "", body)
	e.expect(200, "PUT", "/tenants/ten-lari/domain", andi, body)
	var status identity.DomainStatus
	if code := e.call("GET", "/tenants/ten-lari/domain", andi, nil, &status); code != 200 || len(status.Records) != 3 {
		t.Errorf("GET domain: %d %+v", code, status)
	}
}
