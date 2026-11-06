// Package orders owns orders: placing, advancing, cancelling, refunding and noting them.
package orders

import (
	"context"
	"fmt"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

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
func (s *Orders) PlaceOrder(ctx context.Context, m kernel.Meta, o domain.Order, customer *domain.Customer) (*kernel.Delta, error) {
	if err := kernel.Access(m, o.TenantID); err != nil {
		return nil, err
	}
	if o.ID == "" || o.CustomerID == "" {
		return nil, kernel.Invalid{Reason: "An order needs an id and a customer."}
	}
	if customer != nil && customer.ID != o.CustomerID {
		return nil, kernel.Invalid{Reason: "The new customer must be the order's customer."}
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
		// Two checkouts can pick the same next code; the second one takes the one after.
		var taken bool
		if err := t.QueryRow(t.Ctx, `select exists (select 1 from orders where tenant_id = $1 and code = $2)`,
			o.TenantID, o.Code).Scan(&taken); err != nil {
			return err
		}
		if taken {
			tenant, err := identity.Tenant(t, o.TenantID)
			if err != nil {
				return err
			}
			rows, err := t.Query(t.Ctx, `select code from orders where tenant_id = $1`, o.TenantID)
			if err != nil {
				return err
			}
			var codes []string
			for rows.Next() {
				var code string
				if err := rows.Scan(&code); err != nil {
					rows.Close()
					return err
				}
				codes = append(codes, code)
			}
			rows.Close()
			o.Code = ids.NextCode(codes, tenant.Code+"-", 5)
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
		// Placing reserves the units until the parcel ships or the order is cancelled.
		if err := inventory.Reserve(t, l, o, +1, false); err != nil {
			return err
		}
		// Every promotion the order earned counts one use.
		return marketing.RedeemPromotions(t, o)
	})
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
		l, err := inventory.Lookup(t, o)
		if err != nil {
			return err
		}
		if why := rules.OrderAdvanceBlocker(o, l); why != "" {
			return kernel.Refuse(why)
		}
		next, _ := rules.NextOrderStatus(o.Status, o.PaymentMethod)
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
		}
		if next == "shipped" {
			t.Emit("order.shipped", o)
		}
		return t.Put("orders", o.ID, o)
	})
}

// CancelOrder is orders/cancel: reservations go back; a paid order is refunded in full.
func (s *Orders) CancelOrder(ctx context.Context, m kernel.Meta, id, reason, note string) (*kernel.Delta, error) {
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
		l, err := inventory.Lookup(t, o)
		if err != nil {
			return err
		}
		if err := inventory.Reserve(t, l, o, -1, false); err != nil {
			return err
		}
		refund := o.PaymentStatus == "paid"
		if refund {
			o.Status, o.PaymentStatus, o.RefundedAmount = "refunded", "refunded", o.Total
		} else {
			o.Status, o.PaymentStatus, o.RefundedAmount = "cancelled", "failed", 0
		}
		o.CancelReason = kernel.Ptr(reason)
		if note == "" {
			note = "Cancelled"
		}
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), kernel.Ptr("cancelled"), note)}, o.Events...)
		return t.Put("orders", o.ID, o)
	})
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
		full := o.RefundedAmount+amount >= o.Total
		o.RefundedAmount += amount
		var status *string
		if full {
			o.Status, o.PaymentStatus = "refunded", "refunded"
			status = kernel.Ptr("refunded")
		}
		text := fmt.Sprintf("Refunded %d", amount)
		if note != "" {
			text += " · " + note
		}
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), status, text)}, o.Events...)
		return t.Put("orders", o.ID, o)
	})
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
