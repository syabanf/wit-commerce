package rules

import (
	"slices"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// A shopper's order is priced again on the server from the store's own data, the way the storefront
// prices it (apps/storefront/src/lib/cart.ts cartTotals and checkout.ts buildOrder): the price in the
// offer is the price charged (PP 80/2019 Pasal 39 and 46).

// PriceChanged is the refusal when the browser's amounts differ from the store's.
const PriceChanged = "Prices or offers changed since you opened the checkout. Check the new total and place the order again."

// AgentDiscountRefused is the refusal when a buying agent's discount is more than the store allows.
const AgentDiscountRefused = "The store does not allow this agent discount. Ask the agent for a new total."

// AgentNegotiationID marks the discount line a buying agent negotiated (state/agentChat.tsx).
const AgentNegotiationID = "agent-negotiation"

// PaymentUnavailable refuses an order whose payment type the store does not offer for it.
const PaymentUnavailable = "This payment method is not available for this order. Choose another one."

// PaymentTypeBlocker checks a shopper's payment choice against the store's own payment types: it must
// be one of them, switched on, and of the method the order names. With amounts, its limits must also
// allow the order's total, which only means something once the server has priced the order.
func PaymentTypeBlocker(o domain.Order, types []domain.PaymentType, amounts bool) string {
	if o.PaymentTypeID == nil {
		return PaymentUnavailable
	}
	for _, pt := range types {
		if pt.ID != *o.PaymentTypeID {
			continue
		}
		if !pt.Enabled || pt.TenantID != o.TenantID || pt.Method != o.PaymentMethod {
			return PaymentUnavailable
		}
		if amounts && (o.Total < pt.MinAmount || (pt.MaxAmount != nil && o.Total > *pt.MaxAmount)) {
			return PaymentUnavailable
		}
		return ""
	}
	return PaymentUnavailable
}

// CourierFees mirrors COURIERS in apps/storefront/src/lib/checkout.ts.
var CourierFees = map[string]int{"jne": 18_000, "sicepat": 15_000, "gojek": 32_000, "pickup": 0}

// PriceBook is the store's data an order is priced from, besides its products and modifier groups.
type PriceBook struct {
	Tenant      domain.Tenant
	Products    []domain.Product
	Modifiers   []domain.ModifierGroup
	Promotions  []domain.Promotion
	Categories  []domain.Category
	AgentPolicy *domain.AgentPolicy
	// PaymentTypes are the store's own payment types.
	PaymentTypes []domain.PaymentType
	Now          int64
}

// PriceShopperOrder returns the order with every amount taken from the store's data: line prices,
// promotions, shipping, PPN and points. A non-empty reason means the order cannot be priced as sent.
func PriceShopperOrder(o domain.Order, b PriceBook) (domain.Order, string) {
	lines := make([]domain.OrderLine, len(o.Lines))
	priced := make([]PricedLine, len(o.Lines))
	for i, l := range o.Lines {
		line, categoryID, ok := priceLine(l, b)
		if !ok {
			return o, PriceChanged
		}
		lines[i] = line
		priced[i] = PricedLine{ProductID: l.ProductID, CategoryID: categoryID, Qty: l.Qty, UnitPrice: line.Price}
	}
	// The storefront offers no segment-only promotion, so the server honours none either.
	var promotions []domain.Promotion
	for _, p := range b.Promotions {
		if p.SegmentID == nil {
			promotions = append(promotions, p)
		}
	}
	code := ""
	if o.VoucherCode != nil {
		code = *o.VoucherCode
	}
	sellerID := ""
	if o.SellerID != nil {
		sellerID = *o.SellerID
	}
	paymentTypeID := ""
	if o.PaymentTypeID != nil {
		paymentTypeID = *o.PaymentTypeID
	}
	price := PriceCart(CartContext{
		Lines: priced, Promotions: promotions, Categories: b.Categories, Code: code,
		PaymentTypeID: paymentTypeID, SellerID: sellerID, Now: b.Now,
	})
	if code != "" && price.CodeError != nil {
		return o, PriceChanged
	}

	fee, ok := CourierFees[o.Courier]
	if !ok || (len(b.Tenant.ShippingCouriers) > 0 && !slices.Contains(b.Tenant.ShippingCouriers, o.Courier)) {
		return o, PriceChanged
	}
	shipping := fee
	if price.FreeShipping || price.Subtotal >= b.Tenant.Loyalty.FreeShippingMin {
		shipping = 0
	}

	discountLines := make([]domain.DiscountLine, 0, len(price.Discounts)+1)
	for _, d := range price.Discounts {
		discountLines = append(discountLines, domain.DiscountLine{PromotionID: d.PromotionID, Label: d.Label, Amount: d.Amount})
	}
	negotiated, label := 0, "Agent negotiation"
	for _, d := range o.DiscountLines {
		if d.PromotionID == AgentNegotiationID {
			negotiated += d.Amount
			if d.Label != "" && len(d.Label) <= 60 {
				label = d.Label
			}
		}
	}
	if negotiated != 0 {
		if negotiated < 0 || negotiated > AgentDiscountCap(o, b.AgentPolicy, price.Subtotal-price.Discount) {
			return o, AgentDiscountRefused
		}
		discountLines = append(discountLines, domain.DiscountLine{PromotionID: AgentNegotiationID, Label: label, Amount: negotiated})
	}

	out := o
	out.Lines = lines
	out.Subtotal = price.Subtotal
	out.Discount = price.Discount + negotiated
	out.DiscountLines = discountLines
	out.Shipping = shipping
	out.Total = max(0, out.Subtotal-out.Discount+shipping)
	if out.Agent != nil {
		agent := *out.Agent
		agent.Negotiated = negotiated
		out.Agent = &agent
	}
	out = WithOrderTax(out, b.Tenant, b.Products)
	out.PointsEarned = out.Total / 10_000 * b.Tenant.Loyalty.PointsPer10k
	return out, ""
}

// RepriceShopperOrder prices the order like PriceShopperOrder and refuses it when any line price, the
// subtotal, the discount, shipping or the total the shopper saw differs.
func RepriceShopperOrder(o domain.Order, b PriceBook) (domain.Order, string) {
	out, why := PriceShopperOrder(o, b)
	if why != "" {
		return o, why
	}
	for i, l := range o.Lines {
		if l.Price != out.Lines[i].Price {
			return o, PriceChanged
		}
	}
	if o.Subtotal != out.Subtotal || o.Discount != out.Discount || o.Shipping != out.Shipping || o.Total != out.Total {
		return o, PriceChanged
	}
	return out, ""
}

// AgentDiscountCap is the most a buying agent may take off an order, the way the planner computes its
// discount (apps/storefront/src/lib/agent.ts): the policy's percentage of what the shopper pays before
// shipping, rounded to Rp1.000. Zero when the policy is off, does not negotiate, or does not cover the
// agent or the payment type.
func AgentDiscountCap(o domain.Order, p *domain.AgentPolicy, payable int) int {
	if o.Agent == nil || p == nil || !p.Enabled || !p.Negotiation || !slices.Contains(p.Kinds, o.Agent.Kind) {
		return 0
	}
	if len(p.PaymentTypeIDs) > 0 && (o.PaymentTypeID == nil || !slices.Contains(p.PaymentTypeIDs, *o.PaymentTypeID)) {
		return 0
	}
	return roundHalfUp(float64(payable)*float64(p.MaxAutoDiscountPct)/100/1000) * 1000
}

// priceLine is one line at the store's price: the variant's price plus each add-on's, with the add-on
// names and prices from the store. ok is false for a product that is not on sale or a choice it lacks.
func priceLine(l domain.OrderLine, b PriceBook) (line domain.OrderLine, categoryID string, ok bool) {
	if l.Qty < 1 {
		return l, "", false
	}
	var variant *domain.Variant
	for _, p := range b.Products {
		if p.ID != l.ProductID || p.Status != "active" {
			continue
		}
		for i := range p.Variants {
			if p.Variants[i].ID == l.VariantID {
				variant, categoryID = &p.Variants[i], p.CategoryID
			}
		}
	}
	if variant == nil {
		return l, "", false
	}
	line = l
	line.Price = variant.Price
	line.Modifiers = nil
	for _, m := range l.Modifiers {
		option := modifierOption(b.Modifiers, m.GroupID, m.OptionID)
		if option == nil {
			return l, "", false
		}
		line.Modifiers = append(line.Modifiers, domain.OrderLineModifier{
			GroupID: m.GroupID, OptionID: m.OptionID, Name: option.Name, PriceDelta: option.PriceDelta,
		})
		line.Price += option.PriceDelta
	}
	return line, categoryID, true
}

func modifierOption(groups []domain.ModifierGroup, groupID, optionID string) *domain.ModifierOption {
	for _, g := range groups {
		if g.ID != groupID {
			continue
		}
		for i := range g.Options {
			if g.Options[i].ID == optionID {
				return &g.Options[i]
			}
		}
	}
	return nil
}
