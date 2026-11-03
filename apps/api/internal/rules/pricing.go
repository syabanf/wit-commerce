package rules

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// The pricing engine (packages/fixtures/src/pricing.ts): which promotions a cart earns and what each
// one is worth. The storefront prices carts with it and the server checks orders with it.

// PricedLine is one cart line with its unit price, modifiers included.
type PricedLine struct {
	ProductID  string `json:"productId"`
	CategoryID string `json:"categoryId"`
	Qty        int    `json:"qty"`
	UnitPrice  int    `json:"unitPrice"`
}

// CartContext is everything the engine reads.
type CartContext struct {
	Lines         []PricedLine
	Promotions    []domain.Promotion
	Categories    []domain.Category
	Code          string
	PaymentTypeID string
	SellerID      string
	Now           int64
}

// AppliedDiscount is one promotion the cart earned.
type AppliedDiscount struct {
	PromotionID string `json:"promotionId"`
	Label       string `json:"label"`
	Amount      int    `json:"amount"`
}

// CartPrice is the engine's answer.
type CartPrice struct {
	Subtotal      int                `json:"subtotal"`
	Discounts     []AppliedDiscount  `json:"discounts"`
	Discount      int                `json:"discount"`
	FreeShipping  bool               `json:"freeShipping"`
	CodeError     *string            `json:"codeError"`
	PaymentOffers []domain.Promotion `json:"paymentOffers"`
}

func isOpen(p domain.Promotion, now int64) bool {
	return p.Status == "active" && clock.Ms(p.StartAt) <= now && clock.Ms(p.EndAt) >= now &&
		(p.UsageLimit == nil || p.Used < *p.UsageLimit)
}

// ScopedLines are the lines a promotion counts: its categories (sub-categories included) and
// products, or every line.
func ScopedLines(p domain.Promotion, lines []PricedLine, categories []domain.Category) []PricedLine {
	if len(p.CategoryIDs) == 0 && len(p.ProductIDs) == 0 {
		return append([]PricedLine(nil), lines...)
	}
	parent := map[string]string{}
	for _, c := range categories {
		if c.ParentID != nil {
			parent[c.ID] = *c.ParentID
		}
	}
	var out []PricedLine
	for _, l := range lines {
		if contains(p.ProductIDs, l.ProductID) || contains(p.CategoryIDs, l.CategoryID) ||
			contains(p.CategoryIDs, parent[l.CategoryID]) {
			out = append(out, l)
		}
	}
	return out
}

// BxgyDiscount: for every full set of buy + get units, the cheapest get units take the discount.
func BxgyDiscount(p domain.Promotion, lines []PricedLine) int {
	buy, get := deref(p.BuyQty), deref(p.GetQty)
	if buy < 1 || get < 1 {
		return 0
	}
	var units []int
	for _, l := range lines {
		for range l.Qty {
			units = append(units, l.UnitPrice)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(units)))
	sets := len(units) / (buy + get)
	free := units[len(units)-sets*get:]
	sum := 0
	for _, price := range free {
		sum += price
	}
	pct := 100
	if p.GetDiscountPct != nil {
		pct = *p.GetDiscountPct
	}
	return roundHalfUp(float64(sum) * float64(pct) / 100)
}

func deref(n *int) int {
	if n == nil {
		return 0
	}
	return *n
}

// roundHalfUp matches JavaScript's Math.round for the positive numbers money math produces.
func roundHalfUp(f float64) int { return int(math.Floor(f + 0.5)) }

// PromotionValue is what one promotion takes off scoped lines, before trigger and payment checks.
func PromotionValue(p domain.Promotion, lines []PricedLine, categories []domain.Category) int {
	scoped := ScopedLines(p, lines, categories)
	base := 0
	for _, l := range scoped {
		base += l.Qty * l.UnitPrice
	}
	switch p.Kind {
	case "percentage":
		raw := roundHalfUp(float64(base) * float64(p.Value) / 100)
		if p.MaxDiscount == nil {
			return raw
		}
		return min(raw, *p.MaxDiscount)
	case "fixed":
		return min(p.Value, base)
	case "bxgy":
		return BxgyDiscount(p, scoped)
	case "bundle":
		return max(0, base-p.Value)
	}
	return 0
}

func blocker(p domain.Promotion, ctx CartContext, subtotal, value int) string {
	if p.SellerID != nil && *p.SellerID != ctx.SellerID {
		return "This code only works in its seller's store."
	}
	if subtotal < p.MinSpend {
		return fmt.Sprintf("Spend at least %s to use this code.", FmtIdr(p.MinSpend))
	}
	if p.Kind != "free_shipping" && value <= 0 {
		if p.Kind == "bxgy" {
			return fmt.Sprintf("Add %d qualifying items to use this code.", deref(p.BuyQty)+deref(p.GetQty))
		}
		return "Nothing in your cart qualifies for this code."
	}
	return ""
}

// PriceCart prices a cart: every open automatic promotion plus the typed code, each counted once.
func PriceCart(ctx CartContext) CartPrice {
	subtotal := 0
	for _, l := range ctx.Lines {
		subtotal += l.Qty * l.UnitPrice
	}
	var open []domain.Promotion
	for _, p := range ctx.Promotions {
		if isOpen(p, ctx.Now) {
			open = append(open, p)
		}
	}
	paysWith := func(p domain.Promotion) bool {
		return len(p.PaymentTypeIDs) == 0 || (ctx.PaymentTypeID != "" && contains(p.PaymentTypeIDs, ctx.PaymentTypeID))
	}
	var discounts []AppliedDiscount
	freeShipping := false
	var codeError *string

	apply := func(p domain.Promotion) {
		value := PromotionValue(p, ctx.Lines, ctx.Categories)
		if blocker(p, ctx, subtotal, value) != "" {
			return
		}
		if p.Kind == "free_shipping" {
			freeShipping = true
			return
		}
		label := p.Name
		if p.Trigger == "code" {
			label = p.Code + " · " + p.Name
		}
		discounts = append(discounts, AppliedDiscount{PromotionID: p.ID, Label: label, Amount: value})
	}

	for _, p := range open {
		if p.Trigger == "automatic" && paysWith(p) {
			apply(p)
		}
	}

	if typed := strings.ToUpper(strings.TrimSpace(ctx.Code)); typed != "" {
		var found *domain.Promotion
		for i := range ctx.Promotions {
			p := &ctx.Promotions[i]
			if strings.ToUpper(p.Code) == typed && p.Trigger == "code" {
				found = p
				break
			}
		}
		var msg string
		switch {
		case found == nil:
			msg = "This code does not exist."
		case !isOpen(*found, ctx.Now):
			msg = "This code is not active right now."
		case !paysWith(*found):
			msg = "This code works with another payment type. Choose it at the payment step."
		default:
			msg = blocker(*found, ctx, subtotal, PromotionValue(*found, ctx.Lines, ctx.Categories))
			if msg == "" {
				apply(*found)
			}
		}
		if msg != "" {
			codeError = &msg
		}
	}

	// Discounts never take the cart below zero.
	left := subtotal
	capped := make([]AppliedDiscount, 0, len(discounts))
	for _, d := range discounts {
		amount := min(d.Amount, left)
		left -= amount
		if amount > 0 {
			capped = append(capped, AppliedDiscount{PromotionID: d.PromotionID, Label: d.Label, Amount: amount})
		}
	}
	offers := []domain.Promotion{}
	for _, p := range open {
		if len(p.PaymentTypeIDs) > 0 && p.Trigger == "automatic" && !paysWith(p) {
			offers = append(offers, p)
		}
	}
	return CartPrice{
		Subtotal:      subtotal,
		Discounts:     capped,
		Discount:      subtotal - left,
		FreeShipping:  freeShipping,
		CodeError:     codeError,
		PaymentOffers: offers,
	}
}

// FmtIdr formats rupiah like the apps: "Rp 125.000".
func FmtIdr(value int) string {
	neg := value < 0
	if neg {
		value = -value
	}
	s := fmt.Sprint(value)
	var b strings.Builder
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(ch)
	}
	if neg {
		return "-Rp " + b.String()
	}
	return "Rp " + b.String()
}
