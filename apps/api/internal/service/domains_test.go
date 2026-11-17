package service_test

import (
	"context"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// switchDNS answers the right records while on is true, and nothing after.
type switchDNS struct{ on *bool }

func (d switchDNS) LookupTXT(context.Context, string) ([]string, error) {
	if *d.on {
		return []string{"wit-verify-recheck"}, nil
	}
	return nil, nil
}

func (d switchDNS) LookupCNAME(_ context.Context, host string) (string, error) {
	if *d.on {
		return "teknika.shops.example.com.", nil
	}
	return host, nil
}

func (switchDNS) LookupHost(context.Context, string) ([]string, error) { return nil, nil }

func TestDailyRecheckUnverifiesAfterThreeFailures(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	on := true
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))})
	svc.Identity.Domains = identity.DomainConfig{StoreRoot: "shops.example.com", Resolver: switchDNS{&on}}
	m := service.Meta{P: principal("usr-dewi"), At: clock.FixtureNow}
	name := "www.teknika-store.com"
	if _, err := svc.SetDomain(ctx, m, "ten-teknika", &name, "wit-verify-recheck"); err != nil {
		t.Fatal(err)
	}
	if status, _, err := svc.VerifyDomain(ctx, m, "ten-teknika"); err != nil || !status.Verified {
		t.Fatalf("verify: %+v %v", status, err)
	}
	tenant := func() domain.Tenant {
		got, err := store.Get[domain.Tenant](ctx, db.Pool, "tenants", "ten-teknika")
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	day := func(n int) string {
		return clock.Iso(clock.FromMs(clock.Ms(clock.FixtureNow) + int64(n)*24*clock.Hour))
	}

	// Within a day of the last check nothing is asked.
	on = false
	if d, err := svc.RecheckDomains(ctx, clock.FixtureNow); err != nil || !d.Empty() {
		t.Fatalf("recheck before a day: %v %v", d, err)
	}
	for n := 1; n <= 2; n++ {
		if _, err := svc.RecheckDomains(ctx, day(n)); err != nil {
			t.Fatal(err)
		}
		if got := tenant(); !got.DomainVerified || got.DomainCheckFailures != n {
			t.Fatalf("after %d failures: verified %v, failures %d", n, got.DomainVerified, got.DomainCheckFailures)
		}
	}
	// A passing check in between starts the count again.
	on = true
	if _, err := svc.RecheckDomains(ctx, day(3)); err != nil {
		t.Fatal(err)
	}
	if got := tenant(); got.DomainCheckFailures != 0 {
		t.Fatalf("a passing check kept %d failures", got.DomainCheckFailures)
	}
	on = false
	for n := 4; n <= 6; n++ {
		if _, err := svc.RecheckDomains(ctx, day(n)); err != nil {
			t.Fatal(err)
		}
	}
	got := tenant()
	if got.DomainVerified || got.CustomDomain() != "" {
		t.Errorf("three failures in a row left the domain verified: %+v", got)
	}
	if got.DomainToken != "wit-verify-recheck" || got.Domain == nil {
		t.Error("an unverified domain lost its token, so the brand must start over")
	}
	if _, ok, _ := svc.StoreByDomain(ctx, name); ok {
		t.Error("an unverified domain still serves the store")
	}
}
