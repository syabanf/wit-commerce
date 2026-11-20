package rules

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// packages/fixtures/test/tax.test.ts answers the same file, so both sides charge the same rupiah.
func TestOrderTaxMatchesTheSharedCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "testdata", "tax_cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []struct {
			Name     string
			Tax      domain.TaxSettings
			Discount int
			Lines    []struct {
				ProductID  string `json:"productId"`
				CategoryID string `json:"categoryId"`
				Qty        int    `json:"qty"`
				Price      int    `json:"price"`
			}
			Want struct {
				Lines []domain.OrderTaxLine `json:"lines"`
				DPP   int                   `json:"dpp"`
				PPN   int                   `json:"ppn"`
			}
		}
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	for _, c := range file.Cases {
		t.Run(c.Name, func(t *testing.T) {
			category := map[string]string{}
			lines := make([]domain.OrderLine, len(c.Lines))
			for i, l := range c.Lines {
				category[l.ProductID] = l.CategoryID
				lines[i] = domain.OrderLine{ProductID: l.ProductID, Qty: l.Qty, Price: l.Price}
			}
			got := ComputeOrderTax(lines, c.Discount, c.Tax, func(id string) string { return category[id] })
			if !reflect.DeepEqual(got.Lines, c.Want.Lines) || got.DPP != c.Want.DPP || got.PPN != c.Want.PPN {
				t.Errorf("got %+v, want %+v", got, c.Want)
			}
		})
	}
}

func TestEffectiveRates(t *testing.T) {
	one := func(profile string, includes bool, price int) int {
		return ComputeOrderTax([]domain.OrderLine{{ProductID: "p", Qty: 1, Price: price}}, 0,
			domain.TaxSettings{PKP: true, PricesIncludeTax: includes, Profile: profile}, func(string) string { return "" }).PPN
	}
	for _, c := range []struct {
		profile  string
		includes bool
		price    int
		want     int
	}{
		{"standard", false, 1_000_000, 110_000}, {"luxury", false, 1_000_000, 120_000},
		{"standard", true, 1_110_000, 110_000}, {"luxury", true, 1_120_000, 120_000}, {"exempt", true, 1_000_000, 0},
	} {
		if got := one(c.profile, c.includes, c.price); got != c.want {
			t.Errorf("%s includes=%v %d: PPN %d, want %d", c.profile, c.includes, c.price, got, c.want)
		}
	}
}

func TestWithOrderTax(t *testing.T) {
	o := domain.Order{Lines: []domain.OrderLine{{ProductID: "p", Qty: 2, Price: 50_000}}, Subtotal: 100_000, Discount: 10_000, Shipping: 18_000, Total: 108_000,
		Tax: &domain.OrderTax{PPN: 1}}
	notPKP := WithOrderTax(o, domain.Tenant{}, nil)
	if notPKP.Tax != nil || notPKP.Total != 108_000 {
		t.Errorf("a brand that is not PKP: %+v", notPKP)
	}
	included := WithOrderTax(o, domain.Tenant{Tax: &domain.TaxSettings{PKP: true, PricesIncludeTax: true, Profile: "standard"}}, nil)
	if included.Total != 108_000 || included.Tax.PPN != 8_919 {
		t.Errorf("prices include PPN: total %d, PPN %d", included.Total, included.Tax.PPN)
	}
	added := WithOrderTax(o, domain.Tenant{Tax: &domain.TaxSettings{PKP: true, Profile: "standard"}}, nil)
	if added.Total != 100_000-10_000+9_900+18_000 || added.Tax.PPN != 9_900 {
		t.Errorf("prices exclude PPN: total %d, PPN %d", added.Total, added.Tax.PPN)
	}
}

func TestTaxBlocker(t *testing.T) {
	npwp := &domain.SellerLegal{NPWP: "01.234.567.8-901.000"}
	rate, zero, num, den := 11.0, 0.0, 13, 12
	for _, c := range []struct {
		tax   domain.TaxSettings
		legal *domain.SellerLegal
		ok    bool
	}{
		{domain.TaxSettings{PKP: true, Profile: "standard"}, nil, false},
		{domain.TaxSettings{PKP: true, Profile: "standard"}, npwp, true},
		{domain.TaxSettings{Profile: "zero"}, npwp, false},
		{domain.TaxSettings{Profile: "standard", RatePct: &rate}, npwp, true},
		{domain.TaxSettings{Profile: "standard", RatePct: &zero}, npwp, false},
		{domain.TaxSettings{Profile: "standard", DppNumerator: &num}, npwp, false},
		{domain.TaxSettings{Profile: "standard", DppNumerator: &num, DppDenominator: &den}, npwp, false},
		{domain.TaxSettings{Profile: "standard", Overrides: []domain.TaxOverride{{Kind: "product", ID: "p", Profile: "exempt"}, {Kind: "product", ID: " p ", Profile: "luxury"}}}, npwp, false},
	} {
		if got := TaxBlocker(c.tax, c.legal) == ""; got != c.ok {
			t.Errorf("%+v: allowed %v, want %v", c.tax, got, c.ok)
		}
	}
}
