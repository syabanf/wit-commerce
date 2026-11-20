package rules

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Returns mirror the return rules in packages/fixtures/src/rules.ts. A return covers some units of
// one order and moves requested → approved → received → refunded, or ends rejected or cancelled. An
// order turns "returned" when refunded returns cover every unit it holds; a partial return leaves
// the order's status alone and shows in its refunded amount.

// DefaultReturnWindowDays is how long after delivery a shopper may ask when the brand set nothing.
const DefaultReturnWindowDays = 7

// ReturnReasons are the reasons an item may carry.
var ReturnReasons = []string{"damaged", "wrong_item", "not_as_described", "size_or_fit", "changed_mind", "late_delivery", "hidden_defect", "expired"}

// LegalReturnWorkingDays mirrors LEGAL_RETURN_WORKING_DAYS: PP 80/2019 Pasal 69(1).
const LegalReturnWorkingDays = 2

// LegalReturnReasons mirrors LEGAL_RETURN_REASONS: the Pasal 69(2) reasons the store must take
// inside the legal window and pays return shipping for.
var LegalReturnReasons = []string{"damaged", "wrong_item", "not_as_described", "late_delivery", "hidden_defect", "expired"}

// IsLegalReturnReason mirrors isLegalReturnReason.
func IsLegalReturnReason(reason string) bool { return slices.Contains(LegalReturnReasons, reason) }

// LegalReturnDeadline mirrors legalReturnDeadline: the end of the second working day (Monday to
// Friday, WIB) after the day of delivery, in milliseconds.
func LegalReturnDeadline(deliveredMs int64) int64 {
	day := clock.FromMs(deliveredMs)
	day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, clock.WIB)
	for left := LegalReturnWorkingDays; left > 0; {
		day = day.AddDate(0, 0, 1)
		if wd := day.Weekday(); wd != time.Saturday && wd != time.Sunday {
			left--
		}
	}
	return day.UnixMilli() + clock.Day - 1
}

// ReturnShippingPayer mirrors returnShippingPayer.
func ReturnShippingPayer(items []domain.ReturnItem) string {
	for _, item := range items {
		if IsLegalReturnReason(item.Reason) {
			return "brand"
		}
	}
	return "shopper"
}

// ShippingPayerOf mirrors shippingPayerOf.
func ShippingPayerOf(r domain.OrderReturn) string {
	if r.ShippingPaidBy != "" {
		return r.ShippingPaidBy
	}
	return ReturnShippingPayer(r.Items)
}

// ReturnDeadline mirrors returnDeadline; ok is false when the store takes no such requests.
func ReturnDeadline(o domain.Order, windowDays int, reason string) (deadline int64, ok bool) {
	delivered := clock.Ms(DeliveredAt(o))
	var brand int64
	if windowDays > 0 {
		brand, ok = delivered+int64(windowDays)*clock.Day, true
	}
	if !IsLegalReturnReason(reason) {
		return brand, ok
	}
	return max(brand, LegalReturnDeadline(delivered)), true
}

// returnWindowBlocker mirrors returnWindowBlocker.
func returnWindowBlocker(o domain.Order, windowDays int, reason string, now int64) string {
	deadline, ok := ReturnDeadline(o, windowDays, reason)
	if !ok {
		return "This store takes change-of-mind and fit returns by message. Contact the store."
	}
	if now <= deadline {
		return ""
	}
	if windowDays > 0 && deadline == clock.Ms(DeliveredAt(o))+int64(windowDays)*clock.Day {
		return fmt.Sprintf("The %d-day return window for this order has closed.", windowDays)
	}
	return fmt.Sprintf("The %d-working-day return window for this order has closed.", LegalReturnWorkingDays)
}

// ShopperEmailKinds are the shopper emails a brand may switch off, in display order.
var ShopperEmailKinds = []string{"order_placed", "payment_received", "order_shipped", "order_cancelled", "return_update"}

// ReturnWindowDays mirrors returnWindowDays.
func ReturnWindowDays(t domain.Tenant) int {
	if t.ReturnWindowDays == nil {
		return DefaultReturnWindowDays
	}
	return *t.ReturnWindowDays
}

// IsOpenReturn is a return still under way.
func IsOpenReturn(r domain.OrderReturn) bool {
	return r.Status == "requested" || r.Status == "approved" || r.Status == "received"
}

// returnedQty mirrors returnedQty: units per variant held by returns keep accepts.
func returnedQty(orderID string, returns []domain.OrderReturn, keep func(domain.OrderReturn) bool) map[string]int {
	held := map[string]int{}
	for _, r := range returns {
		if r.OrderID != orderID || !keep(r) {
			continue
		}
		for _, item := range r.Items {
			held[item.VariantID] += item.Qty
		}
	}
	return held
}

func notDropped(r domain.OrderReturn) bool { return r.Status != "rejected" && r.Status != "cancelled" }

// DeliveredAt mirrors deliveredAt: the delivered step on the timeline, else when the order was placed.
func DeliveredAt(o domain.Order) string {
	for _, e := range o.Events {
		if e.Status != nil && *e.Status == "delivered" {
			return e.At
		}
	}
	return o.CreatedAt
}

// ReturnRequestBlocker mirrors returnRequestBlocker. who is "staff" or "shopper"; now is in
// milliseconds; returns are the tenant's returns.
func ReturnRequestBlocker(o domain.Order, returns []domain.OrderReturn, items []domain.ReturnItem, who string, now int64, windowDays int) string {
	delivered := o.Status == "delivered" || o.Status == "completed"
	if who == "shopper" {
		if !delivered {
			return "You can ask for a return once the order is delivered."
		}
	} else if !delivered && o.Status != "shipped" {
		return "Only a shipped or delivered order can be returned."
	}
	if len(items) == 0 {
		return "Choose at least one item to return."
	}
	bought := VariantDemand(o).Qty
	held := returnedQty(o.ID, returns, notDropped)
	open := returnedQty(o.ID, returns, IsOpenReturn)
	seen := map[string]bool{}
	for _, item := range items {
		if bought[item.VariantID] == 0 {
			return "One item is not part of this order."
		}
		if seen[item.VariantID] {
			return "List each item once."
		}
		seen[item.VariantID] = true
		if !slices.Contains(ReturnReasons, item.Reason) {
			return "Choose a reason for each item."
		}
		if who == "shopper" {
			if closed := returnWindowBlocker(o, windowDays, item.Reason, now); closed != "" {
				return closed
			}
		}
		if item.Qty < 1 {
			return "Enter how many units to return."
		}
		if open[item.VariantID] > 0 {
			return "One item already has an open return. Finish that one first."
		}
		if left := bought[item.VariantID] - held[item.VariantID]; item.Qty > left {
			if left > 0 {
				return fmt.Sprintf("Only %d of one item can still be returned.", left)
			}
			return "One item was already returned in full."
		}
	}
	return ""
}

// ReturnDecideBlocker mirrors returnDecideBlocker.
func ReturnDecideBlocker(r domain.OrderReturn) string {
	if r.Status != "requested" {
		return "Only a requested return can be approved or rejected."
	}
	return ""
}

// ReturnReceiveBlocker mirrors returnReceiveBlocker.
func ReturnReceiveBlocker(r domain.OrderReturn) string {
	if r.Status != "approved" {
		return "Approve the return before marking it received."
	}
	return ""
}

// ReturnCancelBlocker mirrors returnCancelBlocker.
func ReturnCancelBlocker(r domain.OrderReturn) string {
	if r.Status != "requested" && r.Status != "approved" {
		return "Only a return that has not been received can be cancelled."
	}
	return ""
}

// ReturnRefundBlocker mirrors returnRefundBlocker.
func ReturnRefundBlocker(r domain.OrderReturn, o domain.Order) string {
	if r.Status != "received" {
		return "Mark the return received before refunding it."
	}
	return OrderRefundBlocker(o)
}

// ReturnItemsPaid mirrors returnItemsPaid: the line value of the returned units, less their share of
// the order's discount. Shipping is not part of it.
func ReturnItemsPaid(o domain.Order, items []domain.ReturnItem) int {
	value := 0
	for _, item := range items {
		units, total := 0, 0
		for _, l := range o.Lines {
			if l.VariantID == item.VariantID {
				units += l.Qty
				total += l.Qty * l.Price
			}
		}
		if units > 0 {
			value += item.Qty * total / units
		}
	}
	if o.Subtotal <= 0 {
		return 0
	}
	// With prices excluding PPN the shopper also paid the PPN on top of the goods.
	return value * max(0, o.Subtotal-o.Discount+AddedTax(o.Tax)) / o.Subtotal
}

// ReturnRefundCap mirrors returnRefundCap.
func ReturnRefundCap(o domain.Order, r domain.OrderReturn) int {
	return max(0, min(ReturnItemsPaid(o, r.Items), o.Total-o.RefundedAmount))
}

// ReturnRefundSplit mirrors returnRefundSplit: the items part and the return shipping part.
func ReturnRefundSplit(o domain.Order, r domain.OrderReturn, amount, shippingCost int) (items, shipping int) {
	items = max(0, min(amount, ReturnRefundCap(o, r)))
	if ShippingPayerOf(r) == "brand" {
		shipping = max(0, min(shippingCost, o.Total-o.RefundedAmount-items))
	}
	return items, shipping
}

// ReturnRefundProofBlocker mirrors returnRefundProofBlocker (Pasal 71). method "" means manual.
func ReturnRefundProofBlocker(method, reference, refundedOn string) string {
	if method == "" {
		method = "manual"
	}
	if method != "manual" && method != "midtrans" {
		return "Choose how the money went back."
	}
	if strings.TrimSpace(reference) == "" {
		if method == "midtrans" {
			return "The gateway gave no refund reference."
		}
		return "Enter the transfer reference so the shopper can trace the money."
	}
	if method == "manual" && strings.TrimSpace(refundedOn) == "" {
		return "Enter the date the money was sent."
	}
	return ""
}

// OrderFullyReturned mirrors orderFullyReturned.
func OrderFullyReturned(o domain.Order, returns []domain.OrderReturn) bool {
	refunded := returnedQty(o.ID, returns, func(r domain.OrderReturn) bool { return r.Status == "refunded" })
	demand := VariantDemand(o)
	for _, variantID := range demand.Keys {
		if refunded[variantID] < demand.Qty[variantID] {
			return false
		}
	}
	return len(o.Lines) > 0
}
