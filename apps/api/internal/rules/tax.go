package rules

import (
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// PPN mirrors packages/fixtures/src/tax.ts. Both sides must give the same rupiah for the same order,
// so every division below runs the same float64 steps in the same order as the TypeScript.

const (
	DefaultPPNRate        = 12.0
	DefaultDppNumerator   = 11
	DefaultDppDenominator = 12
	MaxTaxOverrides       = 500
)

var TaxProfiles = []string{"standard", "luxury", "exempt"}

// RoundHalfUp mirrors roundHalfUp: whole rupiah, halves up.
func RoundHalfUp(x float64) int { return int(math.Floor(x + 0.5)) }

// NormalizeTax mirrors normalizeTax.
func NormalizeTax(t domain.TaxSettings) domain.TaxSettings {
	if len(t.Overrides) == 0 {
		t.Overrides = nil
		return t
	}
	out := make([]domain.TaxOverride, len(t.Overrides))
	for i, o := range t.Overrides {
		o.ID = strings.TrimSpace(o.ID)
		out[i] = o
	}
	t.Overrides = out
	return t
}

// TaxBlocker mirrors taxBlocker.
func TaxBlocker(t domain.TaxSettings, legal *domain.SellerLegal) string {
	if !slices.Contains(TaxProfiles, t.Profile) {
		return "Pick standard, luxury or exempt as the default profile."
	}
	if t.PKP && (legal == nil || legal.NPWP == "") {
		return "Add the NPWP in the seller identity before turning PKP on."
	}
	if r := t.RatePct; r != nil && !(!math.IsInf(*r, 0) && !math.IsNaN(*r) && *r > 0 && *r <= 100) {
		return "The PPN rate is a percentage above 0 and up to 100."
	}
	num, den := t.DppNumerator, t.DppDenominator
	if (num == nil) != (den == nil) {
		return "Set both parts of the tax base fraction, or neither."
	}
	if num != nil && !(*num > 0 && *den > 0 && *num <= *den && *den <= 1000) {
		return "The tax base is a fraction such as 11/12, at most 1."
	}
	if len(t.Overrides) > MaxTaxOverrides {
		return fmt.Sprintf("Keep at most %d overrides.", MaxTaxOverrides)
	}
	seen := map[string]bool{}
	for _, o := range t.Overrides {
		id := strings.TrimSpace(o.ID)
		if (o.Kind != "product" && o.Kind != "category") || id == "" || !slices.Contains(TaxProfiles, o.Profile) {
			return "Each override names a product or category and a profile."
		}
		key := o.Kind + ":" + id
		if seen[key] {
			return "Each product or category takes one override."
		}
		seen[key] = true
	}
	return ""
}

// TaxProfileOf mirrors taxProfileOf: the product's override, else its category's, else the default.
func TaxProfileOf(t domain.TaxSettings, productID, categoryID string) string {
	category := ""
	for _, o := range t.Overrides {
		if o.Kind == "product" && o.ID == productID {
			return o.Profile
		}
		if category == "" && categoryID != "" && o.Kind == "category" && o.ID == categoryID {
			category = o.Profile
		}
	}
	if category != "" {
		return category
	}
	return t.Profile
}

// ComputeOrderTax mirrors orderTax: the discount spread over the lines by value, then DPP and PPN
// rounded per line, and the totals as the sums of the lines.
func ComputeOrderTax(lines []domain.OrderLine, discount int, t domain.TaxSettings, categoryOf func(productID string) string) domain.OrderTax {
	rate := DefaultPPNRate
	if t.RatePct != nil {
		rate = *t.RatePct
	}
	dppNum, dppDen := DefaultDppNumerator, DefaultDppDenominator
	if t.DppNumerator != nil && t.DppDenominator != nil {
		dppNum, dppDen = *t.DppNumerator, *t.DppDenominator
	}
	total := 0
	for _, l := range lines {
		total += l.Qty * l.Price
	}
	off := max(0, min(discount, total))
	out := domain.OrderTax{PricesIncludeTax: t.PricesIncludeTax, RatePct: rate, DppNumerator: dppNum, DppDenominator: dppDen,
		Lines: make([]domain.OrderTaxLine, 0, len(lines))}
	running, shared := 0, 0
	for _, l := range lines {
		gross := l.Qty * l.Price
		running += gross
		upTo := 0
		if total > 0 {
			upTo = RoundHalfUp(float64(off) * float64(running) / float64(total))
		}
		share := upTo - shared
		shared = upTo
		amount := gross - share
		profile := TaxProfileOf(t, l.ProductID, categoryOf(l.ProductID))
		line := domain.OrderTaxLine{Profile: profile, Net: amount}
		if profile != "exempt" {
			num, den := float64(dppNum), float64(dppDen)
			if profile == "luxury" {
				num, den = 1, 1
			}
			if t.PricesIncludeTax {
				line.PPN = RoundHalfUp(float64(amount) * rate * num / (100*den + rate*num))
				line.Net = amount - line.PPN
				line.DPP = RoundHalfUp(float64(line.Net) * num / den)
			} else {
				line.DPP = RoundHalfUp(float64(amount) * num / den)
				line.PPN = RoundHalfUp(float64(line.DPP) * rate / 100)
			}
		}
		out.DPP += line.DPP
		out.PPN += line.PPN
		out.Lines = append(out.Lines, line)
	}
	return out
}

// AddedTax mirrors addedTax: PPN paid on top of the prices.
func AddedTax(t *domain.OrderTax) int {
	if t == nil || t.PricesIncludeTax {
		return 0
	}
	return t.PPN
}

// WithOrderTax mirrors withOrderTax: a PKP brand's order carries its PPN, and with prices excluding
// PPN its total adds it. Shipping carries no PPN from the brand. Other brands' orders carry none.
func WithOrderTax(o domain.Order, tenant domain.Tenant, products []domain.Product) domain.Order {
	if tenant.Tax == nil || !tenant.Tax.PKP {
		o.Tax = nil
		return o
	}
	categories := make(map[string]string, len(products))
	for _, p := range products {
		categories[p.ID] = p.CategoryID
	}
	tax := ComputeOrderTax(o.Lines, o.Discount, *tenant.Tax, func(id string) string { return categories[id] })
	o.Tax = &tax
	if !tenant.Tax.PricesIncludeTax {
		o.Total = max(0, o.Subtotal-o.Discount+tax.PPN+o.Shipping)
	}
	return o
}
