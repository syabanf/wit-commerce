package rules

import (
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Blockers return the sentence the UI shows beside a disabled action, or "" when the action may run.
// The service refuses the action with the same sentence, so the two never disagree.

var closed = map[string]bool{"completed": true, "cancelled": true, "returned": true, "refunded": true}

// StockLookup finds the level for a variant or option at a warehouse.
type StockLookup struct {
	Stock         []domain.StockLevel
	ModifierStock []domain.ModifierStockLevel
	Modifiers     []domain.ModifierGroup
	Products      []domain.Product
}

func (s StockLookup) level(variantID, warehouseID string) *domain.StockLevel {
	for i := range s.Stock {
		l := &s.Stock[i]
		if l.VariantID == variantID && l.WarehouseID == warehouseID {
			return l
		}
	}
	return nil
}

func (s StockLookup) modifierLevel(optionID, warehouseID string) *domain.ModifierStockLevel {
	for i := range s.ModifierStock {
		l := &s.ModifierStock[i]
		if l.OptionID == optionID && l.WarehouseID == warehouseID {
			return l
		}
	}
	return nil
}

func (s StockLookup) option(optionID string) *domain.ModifierOption {
	for _, g := range s.Modifiers {
		for i := range g.Options {
			if g.Options[i].ID == optionID {
				return &g.Options[i]
			}
		}
	}
	return nil
}

// physicalVariant reports whether a physical product owns the variant.
func (s StockLookup) physicalVariant(variantID string) bool {
	for _, p := range s.Products {
		if p.Type != "physical" {
			continue
		}
		for _, v := range p.Variants {
			if v.ID == variantID {
				return true
			}
		}
	}
	return false
}

// OrderAdvanceBlocker mirrors orderAdvanceBlocker.
func OrderAdvanceBlocker(o domain.Order, s StockLookup) string {
	if closed[o.Status] {
		return "This order is closed."
	}
	next, ok := NextOrderStatus(o.Status, o.PaymentMethod)
	if !ok {
		return "This order has no next step."
	}
	if next != "packed" {
		return ""
	}
	demand := VariantDemand(o)
	for _, variantID := range demand.Keys {
		qty := demand.Qty[variantID]
		level := s.level(variantID, o.WarehouseID)
		if level == nil && s.physicalVariant(variantID) {
			return "A product variant has no stock at this warehouse. Receive stock before packing."
		}
		if level != nil && level.OnHand < qty {
			return fmt.Sprintf("Only %d left of a line that needs %d. Receive stock or move the order to another warehouse.", level.OnHand, qty)
		}
	}
	modifiers := ModifierDemand(o)
	for _, optionID := range modifiers.Keys {
		qty := modifiers.Qty[optionID]
		option := s.option(optionID)
		if option == nil || !option.Tracked() {
			continue
		}
		level := s.modifierLevel(optionID, o.WarehouseID)
		if level == nil || level.OnHand < qty {
			onHand := 0
			if level != nil {
				onHand = level.OnHand
			}
			return fmt.Sprintf("Only %d left of %s; this order needs %d. Receive modifier stock before packing.", onHand, option.Name, qty)
		}
	}
	return ""
}

// OrderCancelBlocker mirrors orderCancelBlocker.
func OrderCancelBlocker(o domain.Order) string {
	if closed[o.Status] {
		return "This order is already closed."
	}
	if o.Status == "shipped" || o.Status == "delivered" {
		return "The parcel has left the warehouse. Start a return instead."
	}
	return ""
}

// OrderRefundBlocker mirrors orderRefundBlocker.
func OrderRefundBlocker(o domain.Order) string {
	if o.PaymentStatus != "paid" {
		return "Nothing to refund: the payment never arrived."
	}
	if o.RefundedAmount >= o.Total {
		return "The full amount is already refunded."
	}
	return ""
}

// ProductActivateBlocker mirrors productActivateBlocker; attributes are the definitions that apply.
func ProductActivateBlocker(p domain.Product, attributes []domain.AttributeDef) string {
	if len(p.Variants) == 0 {
		return "Add at least one variant before activating."
	}
	var missing []string
	for _, a := range attributes {
		if a.Required && strings.TrimSpace(p.Attributes[a.ID]) == "" {
			missing = append(missing, strings.ToLower(a.Name))
		}
	}
	if len(missing) > 0 {
		return "Fill in " + ListOf(missing) + " before activating."
	}
	if p.Price <= 0 && !p.Assisted {
		return "Set a price, or sell it through Talk to sales."
	}
	return ""
}

// PagePublishBlocker mirrors pagePublishBlocker.
func PagePublishBlocker(p domain.Page) string {
	for _, s := range p.Sections {
		if s.Rule == "required" && s.Hidden {
			return "The " + SectionKindLabel[s.Kind] + " section is required. Show it before publishing."
		}
	}
	for _, s := range p.Sections {
		if s.Kind == "hero" && !s.Hidden {
			if strings.TrimSpace(s.Headline) == "" {
				return "The hero needs a headline."
			}
			break
		}
	}
	if strings.TrimSpace(p.Seo.Title) == "" {
		return "Add a meta title so the page can be found in search."
	}
	return ""
}

// CampaignLaunchBlocker mirrors campaignLaunchBlocker.
func CampaignLaunchBlocker(c domain.Campaign, audience int) string {
	if c.Status == "running" {
		return "The campaign is already running."
	}
	if c.Status == "completed" {
		return "The campaign has ended. Duplicate it to run it again."
	}
	if len(c.Channels) == 0 {
		return "Choose at least one channel."
	}
	if c.SegmentID == nil {
		return "Choose an audience segment."
	}
	if audience == 0 {
		return "The audience segment has no customers yet."
	}
	return ""
}

// LeadMoveBlocker mirrors leadMoveBlocker.
func LeadMoveBlocker(l domain.Lead, stage string) string {
	if l.Stage == "won" || l.Stage == "lost" {
		return "This lead is closed. Reopen it as a new lead."
	}
	if stage == "won" && l.Value <= 0 {
		return "Enter the deal value before marking it won."
	}
	return ""
}

// SellerTemplateBlocker mirrors sellerTemplateBlocker.
func SellerTemplateBlocker(s domain.Seller, templateID string) string {
	if !contains(s.AllowedTemplateIDs, templateID) {
		return "The tenant admin has not allowed this template for this seller."
	}
	return ""
}

// StockAdjustBlocker mirrors stockAdjustBlocker.
func StockAdjustBlocker(onHand, reserved, delta int) string {
	if onHand+delta >= reserved {
		return ""
	}
	if reserved > 0 {
		return fmt.Sprintf("Stock cannot drop below the %d units reserved for open orders.", reserved)
	}
	return fmt.Sprintf("Stock cannot drop below zero. Remove at most %d units.", onHand)
}

// SegmentRemoveBlocker mirrors segmentRemoveBlocker.
func SegmentRemoveBlocker(s domain.Segment, campaigns []domain.Campaign) string {
	if s.BuiltIn {
		return "Built-in segments cannot be removed."
	}
	var using []string
	for _, c := range campaigns {
		if c.SegmentID != nil && *c.SegmentID == s.ID && c.Status != "completed" {
			using = append(using, c.Name)
		}
	}
	if len(using) > 0 {
		return "Used by " + ListOf(using) + ". Change their audience or wait until they complete."
	}
	return ""
}

// CategoryRemoveBlocker mirrors categoryRemoveBlocker.
func CategoryRemoveBlocker(c domain.Category, products []domain.Product, categories []domain.Category) string {
	used := 0
	for _, p := range products {
		if p.CategoryID == c.ID {
			used++
		}
	}
	if used > 0 {
		noun := "products use"
		if used == 1 {
			noun = "product uses"
		}
		return fmt.Sprintf("%d %s this category. Move them to another category first.", used, noun)
	}
	children := 0
	for _, x := range categories {
		if x.ParentID != nil && *x.ParentID == c.ID {
			children++
		}
	}
	if children > 0 {
		noun := "sub-categories sit"
		if children == 1 {
			noun = "sub-category sits"
		}
		return fmt.Sprintf("%d %s under it. Move or remove them first.", children, noun)
	}
	return ""
}

// OrderPlaceBlocker mirrors orderPlaceBlocker: every line needs enough sellable stock.
func OrderPlaceBlocker(o domain.Order, s StockLookup) string {
	if len(o.Lines) == 0 {
		return "Your cart is empty."
	}
	demand := VariantDemand(o)
	for _, variantID := range demand.Keys {
		qty := demand.Qty[variantID]
		level := s.level(variantID, o.WarehouseID)
		if level == nil && s.physicalVariant(variantID) {
			return "One item has no stock at this warehouse. Remove it or try again after restocking."
		}
		if level != nil && level.OnHand-level.Reserved < qty {
			left := max(0, level.OnHand-level.Reserved)
			if left > 0 {
				return fmt.Sprintf("Only %d left of one item. Lower the quantity to continue.", left)
			}
			return "One item just sold out. Remove it to continue."
		}
	}
	modifiers := ModifierDemand(o)
	for _, optionID := range modifiers.Keys {
		qty := modifiers.Qty[optionID]
		option := s.option(optionID)
		if option == nil || !option.Tracked() {
			continue
		}
		left := 0
		if level := s.modifierLevel(optionID, o.WarehouseID); level != nil {
			left = max(0, level.OnHand-level.Reserved)
		}
		if left < qty {
			return fmt.Sprintf("%s has only %d left. Lower the quantity or choose another option.", option.Name, left)
		}
	}
	return ""
}

// PaymentTypeDisableBlocker mirrors paymentTypeDisableBlocker: a store needs one way to pay.
func PaymentTypeDisableBlocker(t domain.PaymentType, all []domain.PaymentType) string {
	for _, x := range all {
		if x.TenantID == t.TenantID && x.ID != t.ID && x.Enabled {
			return ""
		}
	}
	return "Keep at least one payment type on, or shoppers cannot check out."
}

// ListOf is "A", "A and B", "A, B and C" (Intl.ListFormat en-GB conjunction).
func ListOf(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	case 2:
		return items[0] + " and " + items[1]
	}
	return strings.Join(items[:len(items)-1], ", ") + " and " + items[len(items)-1]
}
