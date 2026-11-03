package service

import (
	"context"
	"fmt"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// lookup loads everything the order blockers read for one warehouse, locking the stock rows.
func lookup(t *tx, o domain.Order) (rules.StockLookup, error) {
	stock, modifierStock, err := stockAt(t, o.TenantID, o.WarehouseID)
	if err != nil {
		return rules.StockLookup{}, err
	}
	modifiers, err := tenantRows[domain.ModifierGroup](t, "modifiers", o.TenantID)
	if err != nil {
		return rules.StockLookup{}, err
	}
	products, err := tenantRows[domain.Product](t, "products", o.TenantID)
	if err != nil {
		return rules.StockLookup{}, err
	}
	return rules.StockLookup{Stock: stock, ModifierStock: modifierStock, Modifiers: modifiers, Products: products}, nil
}

// reserve changes the reservation of every level the order needs at its warehouse: +1 on place,
// -1 on cancel or expiry. ship also takes the units off the shelf.
func (t *tx) moveStock(l rules.StockLookup, o domain.Order, sign int, ship bool) error {
	demand := rules.VariantDemand(o)
	for _, s := range l.Stock {
		qty := demand.Qty[s.VariantID]
		if qty == 0 {
			continue
		}
		if ship {
			s.OnHand = max(0, s.OnHand-qty)
			s.Reserved = max(0, s.Reserved-qty)
		} else if sign > 0 {
			s.Reserved += qty
		} else {
			s.Reserved = max(0, s.Reserved-qty)
		}
		if err := t.put("stock", s.ID, s); err != nil {
			return err
		}
	}
	modifiers := rules.ModifierDemand(o)
	for _, s := range l.ModifierStock {
		qty := modifiers.Qty[s.OptionID]
		if qty == 0 {
			continue
		}
		if ship {
			s.OnHand = max(0, s.OnHand-qty)
			s.Reserved = max(0, s.Reserved-qty)
		} else if sign > 0 {
			s.Reserved += qty
		} else {
			s.Reserved = max(0, s.Reserved-qty)
		}
		if err := t.put("modifierStock", s.ID, s); err != nil {
			return err
		}
	}
	return nil
}

// PlaceOrder is orders/place: the storefront's order, with the new customer it created, if any.
func (s *Service) PlaceOrder(ctx context.Context, m Meta, o domain.Order, customer *domain.Customer) (*Delta, error) {
	if err := access(m, o.TenantID); err != nil {
		return nil, err
	}
	if o.ID == "" || o.CustomerID == "" {
		return nil, Invalid{Reason: "An order needs an id and a customer."}
	}
	if customer != nil && customer.ID != o.CustomerID {
		return nil, Invalid{Reason: "The new customer must be the order's customer."}
	}
	return s.run(ctx, func(t *tx) error {
		if _, err := store.Get[domain.Order](t.ctx, t.Tx, "orders", o.ID); err == nil {
			return refuse("This order was already placed.")
		}
		l, err := lookup(t, o)
		if err != nil {
			return err
		}
		if why := rules.OrderPlaceBlocker(o, l); why != "" {
			return refuse(why)
		}
		// Two checkouts can pick the same next code; the second one takes the one after.
		var taken bool
		if err := t.QueryRow(t.ctx, `select exists (select 1 from orders where tenant_id = $1 and code = $2)`,
			o.TenantID, o.Code).Scan(&taken); err != nil {
			return err
		}
		if taken {
			tenant, err := get[domain.Tenant](t, "tenants", o.TenantID, "tenant")
			if err != nil {
				return err
			}
			rows, err := t.Query(t.ctx, `select code from orders where tenant_id = $1`, o.TenantID)
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
		isNew := false
		if customer != nil {
			if _, err := store.Get[domain.Customer](t.ctx, t.Tx, "customers", customer.ID); err != nil {
				isNew = true
			}
		}
		by := m.by()
		var events []domain.CustomerEvent
		if paid {
			events = append(events, customerEvent(o, "purchase", "Order "+o.Code, m.At, by))
		}
		events = append(events, customerEvent(o, "checkout_started", "Checked out on the storefront", m.At, by))
		if isNew {
			events = append(events, customerEvent(o, "registered", "Created an account at checkout", m.At, by))
		}
		if isNew {
			c := *customer
			if paid {
				c.Points += o.PointsEarned
			}
			if err := t.put("customers", c.ID, c); err != nil {
				return err
			}
			t.created[c.ID] = true
			t.emit("customer.created", c)
		} else if paid {
			c, err := store.Lock[domain.Customer](t.ctx, t.Tx, "customers", o.CustomerID)
			if err == nil {
				c.Points += o.PointsEarned
				if err := t.put("customers", c.ID, c); err != nil {
					return err
				}
			}
		}
		if err := t.put("orders", o.ID, o); err != nil {
			return err
		}
		t.emit("order.created", o)
		if paid {
			t.emit("order.paid", o)
		}
		// Placing reserves the units until the parcel ships or the order is cancelled.
		if err := t.moveStock(l, o, +1, false); err != nil {
			return err
		}
		// Every promotion the order earned counts one use.
		promotions, err := store.List[domain.Promotion](t.ctx, t.Tx, "promotions", "tenant_id = $1 for update", o.TenantID)
		if err != nil {
			return err
		}
		for _, p := range promotions {
			earned := false
			for _, d := range o.DiscountLines {
				earned = earned || d.PromotionID == p.ID
			}
			if o.DiscountLines == nil && o.VoucherCode != nil && p.Code == *o.VoucherCode {
				earned = true
			}
			if !earned {
				continue
			}
			p.Used++
			p.Revenue += o.Total
			if err := t.put("promotions", p.ID, p); err != nil {
				return err
			}
		}
		for _, e := range events {
			if err := t.put("customerEvents", e.ID, e); err != nil {
				return err
			}
		}
		return nil
	})
}

// AdvanceOrder is orders/advance: the next lifecycle step, with payment, points and stock effects.
func (s *Service) AdvanceOrder(ctx context.Context, m Meta, id string, trackingNo *string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		o, err := lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := access(m, o.TenantID); err != nil {
			return err
		}
		l, err := lookup(t, o)
		if err != nil {
			return err
		}
		if why := rules.OrderAdvanceBlocker(o, l); why != "" {
			return refuse(why)
		}
		next, _ := rules.NextOrderStatus(o.Status, o.PaymentMethod)
		by := m.by()
		note := rules.OrderStatusLabel[next]
		if next == "shipped" && trackingNo != nil && *trackingNo != "" {
			o.TrackingNo = trackingNo
			note = "Tracking " + *trackingNo
		}
		o.Status = next
		if next == "paid" || (next == "delivered" && o.PaymentMethod == "cod") {
			o.PaymentStatus = "paid"
		}
		o.Events = append([]domain.OrderEvent{orderEvent(m.At, by, ptr(next), note)}, o.Events...)
		if next == "paid" || (next == "processing" && o.PaymentMethod == "cod") {
			e := customerEvent(o, "purchase", "Order "+o.Code, m.At, by)
			if err := t.put("customerEvents", e.ID, e); err != nil {
				return err
			}
			if o.PointsEarned > 0 {
				c, err := store.Lock[domain.Customer](t.ctx, t.Tx, "customers", o.CustomerID)
				if err == nil {
					c.Points += o.PointsEarned
					if err := t.put("customers", c.ID, c); err != nil {
						return err
					}
				}
			}
		}
		if next == "shipped" {
			if err := t.moveStock(l, o, -1, true); err != nil {
				return err
			}
			modifiers := rules.ModifierDemand(o)
			for _, optionID := range modifiers.Keys {
				var level *domain.ModifierStockLevel
				for i := range l.ModifierStock {
					if l.ModifierStock[i].OptionID == optionID {
						level = &l.ModifierStock[i]
					}
				}
				if level == nil {
					continue
				}
				move := domain.ModifierStockMove{
					ID: ids.New("mmv"), TenantID: o.TenantID, GroupID: level.GroupID, OptionID: optionID,
					WarehouseID: o.WarehouseID, Kind: "sale", Qty: -modifiers.Qty[optionID], At: m.At, By: by, Note: o.Code,
				}
				if err := t.put("modifierStockMoves", move.ID, move); err != nil {
					return err
				}
			}
			demand := rules.VariantDemand(o)
			for _, variantID := range demand.Keys {
				move := domain.StockMove{
					ID: ids.New("mv"), TenantID: o.TenantID, VariantID: variantID, WarehouseID: o.WarehouseID,
					Kind: "sale", Qty: -demand.Qty[variantID], At: m.At, By: by, Note: o.Code,
				}
				if err := t.put("stockMoves", move.ID, move); err != nil {
					return err
				}
			}
		}
		if next == "paid" || (next == "delivered" && o.PaymentMethod == "cod") {
			t.emit("order.paid", o)
		}
		if next == "shipped" {
			t.emit("order.shipped", o)
		}
		return t.put("orders", o.ID, o)
	})
}

// CancelOrder is orders/cancel: reservations go back; a paid order is refunded in full.
func (s *Service) CancelOrder(ctx context.Context, m Meta, id, reason, note string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		o, err := lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.OrderCancelBlocker(o); why != "" {
			return refuse(why)
		}
		l, err := lookup(t, o)
		if err != nil {
			return err
		}
		if err := t.moveStock(l, o, -1, false); err != nil {
			return err
		}
		refund := o.PaymentStatus == "paid"
		if refund {
			o.Status, o.PaymentStatus, o.RefundedAmount = "refunded", "refunded", o.Total
		} else {
			o.Status, o.PaymentStatus, o.RefundedAmount = "cancelled", "failed", 0
		}
		o.CancelReason = ptr(reason)
		if note == "" {
			note = "Cancelled"
		}
		o.Events = append([]domain.OrderEvent{orderEvent(m.At, m.by(), ptr("cancelled"), note)}, o.Events...)
		return t.put("orders", o.ID, o)
	})
}

// RefundOrder is orders/refund.
func (s *Service) RefundOrder(ctx context.Context, m Meta, id string, amount int, note string) (*Delta, error) {
	if amount <= 0 {
		return nil, Invalid{Reason: "Enter an amount to refund."}
	}
	return s.run(ctx, func(t *tx) error {
		o, err := lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.OrderRefundBlocker(o); why != "" {
			return refuse(why)
		}
		amount = min(amount, o.Total-o.RefundedAmount)
		full := o.RefundedAmount+amount >= o.Total
		o.RefundedAmount += amount
		var status *string
		if full {
			o.Status, o.PaymentStatus = "refunded", "refunded"
			status = ptr("refunded")
		}
		text := fmt.Sprintf("Refunded %d", amount)
		if note != "" {
			text += " · " + note
		}
		o.Events = append([]domain.OrderEvent{orderEvent(m.At, m.by(), status, text)}, o.Events...)
		return t.put("orders", o.ID, o)
	})
}

// NoteOrder is orders/note.
func (s *Service) NoteOrder(ctx context.Context, m Meta, id, note string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		o, err := lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := access(m, o.TenantID); err != nil {
			return err
		}
		o.Events = append([]domain.OrderEvent{orderEvent(m.At, m.by(), nil, note)}, o.Events...)
		return t.put("orders", o.ID, o)
	})
}
