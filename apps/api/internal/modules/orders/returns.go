package orders

import (
	"cmp"
	"context"
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Returns live with their orders: a return covers some units of one order and ends in a refund of
// that order. An order turns "returned" when refunded returns cover every unit it holds; a partial
// return leaves the order's status alone and shows in its refunded amount.

// ReturnRequest is returns/request. The return's id comes from the caller, as an order's does.
type ReturnRequest struct {
	ID      string              `json:"id"`
	OrderID string              `json:"orderId"`
	Items   []domain.ReturnItem `json:"items"`
	Note    string              `json:"note"`
}

// returnStep moves a return to status and puts the step on its timeline.
func returnStep(r domain.OrderReturn, status, note string, m kernel.Meta) domain.OrderReturn {
	r.Status = status
	r.Events = append([]domain.ReturnEvent{{ID: ids.New("oev"), At: m.At, By: m.By(), Status: &status, Note: note}}, r.Events...)
	return r
}

// lockOrderReturns locks the order and loads the returns of its tenant, so two requests for one
// order cannot both pass the quantity check.
func lockOrderReturns(t *kernel.Tx, orderID string) (domain.Order, []domain.OrderReturn, error) {
	o, err := kernel.Lock[domain.Order](t, "orders", orderID, "order")
	if err != nil {
		return o, nil, err
	}
	returns, err := kernel.TenantRows[domain.OrderReturn](t, "returns", o.TenantID)
	return o, returns, err
}

// RequestReturn is returns/request: staff start a return from the order page, or the shopper asks
// from theirs. A shopper principal is held to the store's return window.
func (s *Orders) RequestReturn(ctx context.Context, m kernel.Meta, in ReturnRequest) (*kernel.Delta, error) {
	if in.ID == "" || in.OrderID == "" {
		return nil, kernel.Invalid{Reason: "A return needs an id and an order."}
	}
	who := "staff"
	if m.P.Kind == "customer" {
		who = "shopper"
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, returns, err := lockOrderReturns(t, in.OrderID)
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if who == "shopper" && o.CustomerID != m.P.ID {
			return kernel.NotFound{What: "order"}
		}
		if _, err := store.Get[domain.OrderReturn](t.Ctx, t.Tx, "returns", in.ID); err == nil {
			return kernel.Refuse("This return was already requested.")
		}
		tenant, err := identity.Tenant(t, o.TenantID)
		if err != nil {
			return err
		}
		if why := rules.ReturnRequestBlocker(o, returns, in.Items, who, clock.Ms(m.At), rules.ReturnWindowDays(tenant)); why != "" {
			return kernel.Refuse(why)
		}
		// One code at a time per brand: requests for different orders would otherwise pick the same one.
		if _, err := t.Exec(t.Ctx, `select pg_advisory_xact_lock(hashtext($1))`, "returns:"+o.TenantID); err != nil {
			return err
		}
		rows, err := t.Query(t.Ctx, `select code from returns where tenant_id = $1`, o.TenantID)
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
		r := domain.OrderReturn{
			ID: in.ID, TenantID: o.TenantID, Code: ids.NextCode(codes, tenant.Code+"-R", 4), OrderID: o.ID,
			CustomerID: o.CustomerID, Reason: in.Items[0].Reason, Note: in.Note, RequestedBy: who,
			Events: []domain.ReturnEvent{}, CreatedAt: m.At,
		}
		for _, item := range in.Items {
			for _, l := range o.Lines {
				if l.VariantID == item.VariantID {
					r.Items = append(r.Items, domain.ReturnItem{ProductID: l.ProductID, VariantID: item.VariantID, Qty: item.Qty, Reason: item.Reason})
					break
				}
			}
		}
		opening := "Return started"
		if who == "shopper" {
			opening = "Requested by the shopper"
		}
		r = returnStep(r, "requested", opening, m)
		if err := t.Put("returns", r.ID, r); err != nil {
			return err
		}
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), nil, "Return "+r.Code+" requested")}, o.Events...)
		return t.Put("orders", o.ID, o)
	})
}

// decide runs one step of a return that touches only the return itself.
func (s *Orders) decide(ctx context.Context, m kernel.Meta, id string, step func(t *kernel.Tx, r domain.OrderReturn) (domain.OrderReturn, error)) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		r, err := kernel.Lock[domain.OrderReturn](t, "returns", id, "return")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, r.TenantID); err != nil {
			return err
		}
		if r, err = step(t, r); err != nil {
			return err
		}
		return t.Put("returns", r.ID, r)
	})
}

// ApproveReturn is returns/approve.
func (s *Orders) ApproveReturn(ctx context.Context, m kernel.Meta, id, note string) (*kernel.Delta, error) {
	return s.decide(ctx, m, id, func(t *kernel.Tx, r domain.OrderReturn) (domain.OrderReturn, error) {
		if why := rules.ReturnDecideBlocker(r); why != "" {
			return r, kernel.Refuse(why)
		}
		r = returnStep(r, "approved", cmp.Or(strings.TrimSpace(note), "Approved"), m)
		o, err := kernel.Get[domain.Order](t, "orders", r.OrderID, "order")
		if err != nil {
			return r, err
		}
		t.Notify(kernel.Notice{Kind: "return_approved", Order: o, Return: &r})
		return r, nil
	})
}

// RejectReturn is returns/reject. The reason is what the shopper reads.
func (s *Orders) RejectReturn(ctx context.Context, m kernel.Meta, id, reason string) (*kernel.Delta, error) {
	reason = strings.TrimSpace(reason)
	return s.decide(ctx, m, id, func(t *kernel.Tx, r domain.OrderReturn) (domain.OrderReturn, error) {
		if why := rules.ReturnDecideBlocker(r); why != "" {
			return r, kernel.Refuse(why)
		}
		if reason == "" {
			return r, kernel.Invalid{Reason: "Give the shopper a reason for the rejection."}
		}
		r = returnStep(r, "rejected", "Rejected: "+reason, m)
		r.RejectReason = reason
		return r, nil
	})
}

// CancelReturn is returns/cancel: staff, or the shopper who asked, drop a return not yet received.
func (s *Orders) CancelReturn(ctx context.Context, m kernel.Meta, id, note string) (*kernel.Delta, error) {
	return s.decide(ctx, m, id, func(t *kernel.Tx, r domain.OrderReturn) (domain.OrderReturn, error) {
		if m.P.Kind == "customer" && m.P.ID != r.CustomerID {
			return r, kernel.NotFound{What: "return"}
		}
		if why := rules.ReturnCancelBlocker(r); why != "" {
			return r, kernel.Refuse(why)
		}
		return returnStep(r, "cancelled", cmp.Or(strings.TrimSpace(note), "Cancelled"), m), nil
	})
}

// ReceiveReturn is returns/receive: the parcel came back. With restock its units go back on the
// shelf of the warehouse that shipped them, through the inventory module, as return moves.
func (s *Orders) ReceiveReturn(ctx context.Context, m kernel.Meta, id string, restock bool) (*kernel.Delta, error) {
	return s.decide(ctx, m, id, func(t *kernel.Tx, r domain.OrderReturn) (domain.OrderReturn, error) {
		if why := rules.ReturnReceiveBlocker(r); why != "" {
			return r, kernel.Refuse(why)
		}
		note := "Received, not restocked"
		if restock {
			note = "Received and restocked"
			o, err := kernel.Get[domain.Order](t, "orders", r.OrderID, "order")
			if err != nil {
				return r, err
			}
			if err := inventory.Restock(t, r.TenantID, o.WarehouseID, r.Items, r.Code, m.At, m.By()); err != nil {
				return r, err
			}
		}
		r = returnStep(r, "received", note, m)
		r.Restock = restock
		return r, nil
	})
}

// RefundReturn is returns/refund: the order's refund path for the chosen amount, capped at what was
// paid for the returned items and at what the order still holds. It closes the return, and the order
// too when its last units are now refunded returns.
func (s *Orders) RefundReturn(ctx context.Context, m kernel.Meta, id string, amount int, note string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		// The return row tells which order to lock; the order goes first, as every other action locks it.
		found, err := kernel.Get[domain.OrderReturn](t, "returns", id, "return")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, found.TenantID); err != nil {
			return err
		}
		o, returns, err := lockOrderReturns(t, found.OrderID)
		if err != nil {
			return err
		}
		r, err := kernel.Lock[domain.OrderReturn](t, "returns", id, "return")
		if err != nil {
			return err
		}
		if why := rules.ReturnRefundBlocker(r, o); why != "" {
			return kernel.Refuse(why)
		}
		amount = min(amount, rules.ReturnRefundCap(o, r))
		if amount <= 0 {
			return kernel.Invalid{Reason: "Enter an amount to refund."}
		}
		text := fmt.Sprintf("Refunded %d", amount)
		orderNote := "Return " + r.Code
		if note != "" {
			text += " · " + note
			orderNote += " · " + note
		}
		r = returnStep(r, "refunded", text, m)
		r.RefundAmount = amount
		for i := range returns {
			if returns[i].ID == r.ID {
				returns[i] = r
			}
		}
		o = refunded(o, amount, orderNote, m, rules.OrderFullyReturned(o, returns))
		if err := t.Put("returns", r.ID, r); err != nil {
			return err
		}
		t.Notify(kernel.Notice{Kind: "return_refunded", Order: o, Return: &r, Amount: amount})
		return t.Put("orders", o.ID, o)
	})
}
