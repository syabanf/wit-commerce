package rules_test

import (
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// The same versions are pinned in packages/fixtures/test/legal.test.ts, so the API and the
// storefront agree on which terms a shopper accepted.
func TestTermsVersionMatchesTheStorefront(t *testing.T) {
	days, window := 5, 14
	etas := map[string]domain.EtaDays{"jne": {Min: 1, Max: 2}, "pickup": {}}
	tenant := domain.Tenant{Name: "Lari.", ReturnWindowDays: &window, CourierEtaDays: etas, Legal: &domain.SellerLegal{
		EntityName: "PT Lari Nusantara", Address: "Jl. Senopati 10 · Kebayoran Baru", ComplaintDays: &days,
	}}
	if got := rules.TermsVersion(tenant); got != "1.b9b751ae" {
		t.Errorf("filled: %s", got)
	}
	if got := rules.TermsVersion(domain.Tenant{Name: "Lari."}); got != "1.3052ede8" {
		t.Errorf("empty: %s", got)
	}
}

func TestAddWorkingDaysSkipsWeekends(t *testing.T) {
	for _, c := range []struct {
		at   string
		n    int
		want string
	}{
		{"2026-10-09T16:00:00+07:00", 3, "2026-10-14T16:00:00+07:00"}, // Friday
		{"2026-10-10T10:00:00+07:00", 1, "2026-10-12T10:00:00+07:00"}, // Saturday
		{"2026-10-05T09:41:00+07:00", 0, "2026-10-05T09:41:00+07:00"},
	} {
		if got := rules.AddWorkingDays(c.at, c.n); got != c.want {
			t.Errorf("%s + %d: %s, want %s", c.at, c.n, got, c.want)
		}
	}
}

func TestLegalBlocker(t *testing.T) {
	zero := 0
	for _, c := range []struct {
		legal domain.SellerLegal
		ok    bool
	}{
		{domain.SellerLegal{NIB: "1234567890123", NPWP: "01.234.567.8-901.000", Phone: "+62 812-3456-7890", Email: "a@b.id"}, true},
		{domain.SellerLegal{NPWP: "0123456789012345"}, true},
		{domain.SellerLegal{NIB: "123456789012"}, false},
		{domain.SellerLegal{NPWP: "1234"}, false},
		{domain.SellerLegal{Phone: "0812 abc"}, false},
		{domain.SellerLegal{ComplaintDays: &zero}, false},
		{domain.SellerLegal{BusinessType: "firma"}, false},
	} {
		if got := rules.LegalBlocker(rules.NormalizeLegal(c.legal)) == ""; got != c.ok {
			t.Errorf("%+v: ok %v, want %v", c.legal, got, c.ok)
		}
	}
}
