// Package orders owns orders: placing, advancing, cancelling, refunding and noting them.
package orders

import (
	"context"
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/marketing"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// PlaceOrder is orders/place: the storefront's order, with the new customer it created, if any.
// Staff placing an order in the console set its amounts, and the amounts stand.
func (s *Orders) PlaceOrder(ctx context.Context, m kernel.Meta, o domain.Order, customer *domain.Customer) (*kernel.Delta, error) {
	return s.place(ctx, m, o, customer, false)
}

// PlaceShopperOrder is orders/place from the storefront: every amount is priced again from the
// store's data inside the transaction, and the order is refused when the shopper saw another price.
func (s *Orders) PlaceShopperOrder(ctx context.Context, m kernel.Meta, o domain.Order, customer *domain.Customer) (*kernel.Delta, error) {
	return s.place(ctx, m, o, customer, true)
}

func (s *Orders) place(ctx context.Context, m kernel.Meta, o domain.Order, customer *domain.Customer, reprice bool) (*kernel.Delta, error) {
	if reprice && s.Prices == nil {
		return nil, fmt.Errorf("orders: no price book to check a shopper's order")
	}
	if err := kernel.Access(m, o.TenantID); err != nil {
		return nil, err
	}
	if o.ID == "" || o.CustomerID == "" {
		return nil, kernel.Invalid{Reason: "An order needs an id and a customer."}
	}
	if customer != nil && customer.ID != o.CustomerID {
		return nil, kernel.Invalid{Reason: "The new customer must be the order's customer."}
	}
	// A shopper's browser never decides that an order is paid.
	if m.P.Kind == "customer" {
		o = rules.ShopperPlacement(o, m.At)
	}
	if o.PaymentMethod != "cod" && o.PaymentTypeID != nil && s.Payments != nil {
		online, err := s.Payments.CollectsOnline(ctx, o.TenantID, *o.PaymentTypeID, o.Total)
		if err != nil {
			return nil, err
		}
		if online {
			o = awaitingPayment(o)
		}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		if _, err := store.Get[domain.Order](t.Ctx, t.Tx, "orders", o.ID); err == nil {
			return kernel.Refuse("This order was already placed.")
		}
		l, err := inventory.Lookup(t, o)
		if err != nil {
			return err
		}
		if why := rules.OrderPlaceBlocker(o, l); why != "" {
			return kernel.Refuse(why)
		}
		tenant, err := identity.Tenant(t, o.TenantID)
		if err != nil {
			return err
		}
		if reprice {
			if o, err = s.reprice(t, o, tenant, l, m.At); err != nil {
				return err
			}
		} else {
			// The brand's PPN settings decide the order's tax, whatever the client sent.
			o = rules.WithOrderTax(o, tenant, l.Products)
		}
		// Checkouts of one brand pick their order and customer codes one at a time: two that read the
		// same highest code would both insert it. The lock holds until commit.
		if _, err := t.Exec(t.Ctx, `select pg_advisory_xact_lock(hashtext('codes:' || $1))`, o.TenantID); err != nil {
			return err
		}
		// The storefront holds no orders, so its code is often taken; the order then takes the next one.
		var taken bool
		if err := t.QueryRow(t.Ctx, `select exists (select 1 from orders where tenant_id = $1 and code = $2)`,
			o.TenantID, o.Code).Scan(&taken); err != nil {
			return err
		}
		if taken {
			highest, err := store.HighestCode(t.Ctx, t.Tx, "orders", o.TenantID, tenant.Code+"-")
			if err != nil {
				return err
			}
			o.Code = ids.NextCode([]string{highest}, tenant.Code+"-", 5)
		}
		paid := o.PaymentStatus == "paid"
		if err := crm.RecordOrderPlaced(t, o, customer, m.At, m.By()); err != nil {
			return err
		}
		if err := t.Put("orders", o.ID, o); err != nil {
			return err
		}
		t.Emit("order.created", o)
		if paid {
			t.Emit("order.paid", o)
		}
		t.Notify(kernel.Notice{Kind: "order_placed", Order: o})
		// Placing reserves the units until the parcel ships or the order is cancelled.
		if err := inventory.Reserve(t, l, o, +1, false); err != nil {
			return err
		}
		// Every promotion the order earned counts one use.
		return marketing.RedeemPromotions(t, o)
	})
}

// reprice checks a shopper's order against the store's prices, promotions, shipping, PPN and agent
// policy, and returns it with the store's amounts.
func (s *Orders) reprice(t *kernel.Tx, o domain.Order, tenant domain.Tenant, l rules.StockLookup, at string) (domain.Order, error) {
	book, err := s.Prices.PriceBook(t, o.TenantID)
	if err != nil {
		return o, err
	}
	book.Tenant, book.Products, book.Modifiers, book.Now = tenant, l.Products, l.Modifiers, clock.Ms(at)
	priced, why := rules.RepriceShopperOrder(o, book)
	if why == "" {
		// Another checkout may have taken the last use of a promotion since the book was read.
		var spent bool
		if spent, err = marketing.UsageSpent(t, priced); err != nil {
			return o, err
		}
		if spent {
			why = rules.PriceChanged
		}
	}
	if why != "" {
		return o, kernel.Conflict{Code: "PRICE_CHANGED", Reason: why}
	}
	return priced, nil
}

// AdvanceOrder is orders/advance: the next lifecycle step, with payment, points and stock effects.
func (s *Orders) AdvanceOrder(ctx context.Context, m kernel.Meta, id string, trackingNo *string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		next, _ := rules.NextOrderStatus(o.Status, o.PaymentMethod)
		return advance(t, m, o, next, trackingNo)
	})
}

// advance moves an order to next, with the payment, points, stock and webhook effects of that step.
func advance(t *kernel.Tx, m kernel.Meta, o domain.Order, next string, trackingNo *string) error {
	l, err := inventory.Lookup(t, o)
	if err != nil {
		return err
	}
	if why := rules.OrderAdvanceBlocker(o, l); why != "" {
		return kernel.Refuse(why)
	}
	by := m.By()
	note := rules.OrderStatusLabel[next]
	if next == "shipped" && trackingNo != nil && *trackingNo != "" {
		o.TrackingNo = trackingNo
		note = "Tracking " + *trackingNo
	}
	o.Status = next
	if next == "paid" || (next == "delivered" && o.PaymentMethod == "cod") {
		o.PaymentStatus = "paid"
	}
	o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, by, kernel.Ptr(next), note)}, o.Events...)
	if next == "paid" || (next == "processing" && o.PaymentMethod == "cod") {
		if err := crm.RecordOrderPaid(t, o, m.At, by); err != nil {
			return err
		}
	}
	if next == "shipped" {
		if err := inventory.RecordShipment(t, l, o, m.At, by); err != nil {
			return err
		}
	}
	if next == "paid" || (next == "delivered" && o.PaymentMethod == "cod") {
		t.Emit("order.paid", o)
		t.Notify(kernel.Notice{Kind: "payment_received", Order: o})
	}
	if next == "shipped" {
		t.Emit("order.shipped", o)
		t.Notify(kernel.Notice{Kind: "order_shipped", Order: o})
	}
	return t.Put("orders", o.ID, o)
}

// awaitingPayment turns the order the client built into one waiting for an online payment: the
// provider, not the browser, says when it is paid.
func awaitingPayment(o domain.Order) domain.Order {
	o.Status, o.PaymentStatus = "confirmed", "pending"
	events := make([]domain.OrderEvent, 0, len(o.Events))
	for _, e := range o.Events {
		if e.Status == nil || *e.Status != "paid" {
			events = append(events, e)
		}
	}
	o.Events = events
	return o
}

// ConfirmPayment marks an order paid when its provider confirms the money arrived. It follows the
// same path as advancing to paid. An order already paid, or closed, is left alone, so a repeated
// confirmation changes nothing.
func (s *Orders) ConfirmPayment(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if !rules.AwaitsPayment(o) {
			return nil
		}
		return advance(t, m, o, "paid", nil)
	})
}

// FailPayment cancels an order whose provider says the payment will not arrive, as the timer
// does when the payment window closes. An order no longer waiting for payment is left alone.
func (s *Orders) FailPayment(ctx context.Context, m kernel.Meta, id, reason, note string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if !rules.AwaitsPayment(o) {
			return nil
		}
		return Expire(t, o, reason, note, m.At, m.By())
	})
}

// Expire cancels an unpaid order: its reservations go back and its payment is marked failed.
func Expire(t *kernel.Tx, o domain.Order, reason, note, at, by string) error {
	l, err := inventory.Lookup(t, o)
	if err != nil {
		return err
	}
	if err := inventory.Reserve(t, l, o, -1, false); err != nil {
		return err
	}
	o.Status, o.PaymentStatus = "cancelled", "failed"
	o.CancelReason = kernel.Ptr(reason)
	o.Events = append([]domain.OrderEvent{kernel.OrderEvent(at, by, kernel.Ptr("cancelled"), note)}, o.Events...)
	t.Notify(kernel.Notice{Kind: "order_cancelled", Order: o})
	return t.Put("orders", o.ID, o)
}

// CancelInput is orders/cancel. Reference and RefundedOn record a bank transfer that already
// returned a paid order's money. Gateway is the outcome of the gateway refund the facade ran first;
// the HTTP body cannot set it.
type CancelInput struct {
	Reason     string               `json:"reason"`
	Note       string               `json:"note"`
	Reference  string               `json:"refundReference,omitempty"`
	RefundedOn string               `json:"refundedOn,omitempty"`
	Gateway    *domain.CancelRefund `json:"-"`
}

// CancelOrder is orders/cancel: reservations go back. A paid order owes its money back: it closes as
// refunded once the gateway refunded or staff recorded the transfer (PP 80/2019 Pasal 71), and
// stays cancelled with the refund owed until then.
func (s *Orders) CancelOrder(ctx context.Context, m kernel.Meta, id string, in CancelInput) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.OrderCancelBlocker(o); why != "" {
			return kernel.Refuse(why)
		}
		var refund *domain.CancelRefund
		if o.PaymentStatus == "paid" {
			refund, err = cancelRefund(o, in, m.At)
			if err != nil {
				return err
			}
		}
		l, err := inventory.Lookup(t, o)
		if err != nil {
			return err
		}
		if err := inventory.Reserve(t, l, o, -1, false); err != nil {
			return err
		}
		switch {
		case refund == nil:
			o.Status, o.PaymentStatus, o.RefundedAmount = "cancelled", "failed", 0
		case refund.Status == "succeeded":
			o.Status, o.PaymentStatus, o.RefundedAmount = "refunded", "refunded", o.RefundedAmount+refund.Amount
		default:
			o.Status = "cancelled"
		}
		o.CancelRefund = refund
		o.CancelReason = kernel.Ptr(in.Reason)
		note := in.Note
		if note == "" {
			note = "Cancelled"
		}
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), kernel.Ptr("cancelled"), note)}, o.Events...)
		amount := 0
		if refund != nil {
			amount = refund.Amount
		}
		t.Notify(kernel.Notice{Kind: "order_cancelled", Order: o, Amount: amount})
		return t.Put("orders", o.ID, o)
	})
}

// cancelRefund is what a cancelled paid order owes and how far it got: the gateway's outcome, a
// recorded transfer, or owed.
func cancelRefund(o domain.Order, in CancelInput, at string) (*domain.CancelRefund, error) {
	refund := &domain.CancelRefund{Amount: o.Total - o.RefundedAmount, Status: "owed"}
	switch {
	case in.Gateway != nil:
		refund.Status, refund.Method, refund.Reference, refund.Error = in.Gateway.Status, "midtrans", in.Gateway.Reference, in.Gateway.Error
		if refund.Status == "succeeded" {
			refund.RefundedOn = at
		}
	case strings.TrimSpace(in.Reference) != "":
		if why := rules.ReturnRefundProofBlocker("manual", in.Reference, in.RefundedOn); why != "" {
			return nil, kernel.Invalid{Reason: why}
		}
		refund.Status, refund.Method = "succeeded", "manual"
		refund.Reference, refund.RefundedOn = strings.TrimSpace(in.Reference), strings.TrimSpace(in.RefundedOn)
	}
	return refund, nil
}

// RefundOrder is orders/refund.
func (s *Orders) RefundOrder(ctx context.Context, m kernel.Meta, id string, amount int, note string) (*kernel.Delta, error) {
	if amount <= 0 {
		return nil, kernel.Invalid{Reason: "Enter an amount to refund."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.OrderRefundBlocker(o); why != "" {
			return kernel.Refuse(why)
		}
		amount = min(amount, o.Total-o.RefundedAmount)
		o = refunded(o, amount, note, m, false)
		t.Notify(kernel.Notice{Kind: "order_refunded", Order: o, Amount: amount})
		return t.Put("orders", o.ID, o)
	})
}

// refunded is the order after a refund of amount. A refund of everything closes it as refunded;
// returned closes it as returned instead, when the refund settles the last of its units.
func refunded(o domain.Order, amount int, note string, m kernel.Meta, returned bool) domain.Order {
	full := o.RefundedAmount+amount >= o.Total
	o.RefundedAmount += amount
	var status *string
	switch {
	case returned:
		status = kernel.Ptr("returned")
	case full:
		status = kernel.Ptr("refunded")
	}
	if status != nil {
		o.Status = *status
	}
	if full {
		o.PaymentStatus = "refunded"
	}
	text := fmt.Sprintf("Refunded %d", amount)
	if note != "" {
		text += " · " + note
	}
	o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), status, text)}, o.Events...)
	return o
}

// NoteOrder is orders/note.
func (s *Orders) NoteOrder(ctx context.Context, m kernel.Meta, id, note string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), nil, note)}, o.Events...)
		return t.Put("orders", o.ID, o)
	})
}
