package service

import (
	"context"
	"errors"
	"slices"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/integrations"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// A return's refund crosses modules: the payment record and the gateway are integrations', the
// return and the order are the orders module's. PP 80/2019 Pasal 71 asks for a mechanism that
// returns the shopper's money; the return turns refunded only after the money moved.

// RefundFailed is a gateway refund that did not go through. Delta carries the failure recorded on
// the return, so the console shows it; Reason is what staff read.
type RefundFailed struct {
	Reason string
	Delta  *Delta
}

func (e RefundFailed) Error() string { return e.Reason }

// midtransPaid lists the payment statuses of a Midtrans transaction that holds money to refund.
var midtransPaid = []string{"settlement", "capture", "capture/accept", "partial_refund"}

// RefundReturn is returns/refund. When Midtrans took the order's payment it refunds through the
// Midtrans API first and records the gateway's reference; a refusal keeps the return received and
// records why. After a refusal, or for an order paid any other way, staff record the bank transfer
// reference and date instead.
func (s *Service) RefundReturn(ctx context.Context, m Meta, id string, in ReturnRefund) (*Delta, error) {
	r, err := store.Get[domain.OrderReturn](ctx, s.DB.Pool, "returns", id)
	if errors.Is(err, store.ErrNotFound) {
		return nil, NotFound{What: "return"}
	}
	if err != nil {
		return nil, err
	}
	if err := kernel.Access(m, r.TenantID); err != nil {
		return nil, err
	}
	p, err := s.PaymentFor(ctx, r.OrderID)
	if err != nil {
		return nil, err
	}
	in.Method = "manual"
	if p == nil || p.Provider != "midtrans" || !slices.Contains(midtransPaid, p.Status) || r.GatewayStatus == "failed" && in.Reference != "" {
		return s.Orders.RefundReturn(ctx, m, id, in)
	}
	o, err := store.Get[domain.Order](ctx, s.DB.Pool, "orders", r.OrderID)
	if err != nil {
		return nil, err
	}
	if why := rules.ReturnRefundBlocker(r, o); why != "" {
		return nil, Refusal{Reason: why}
	}
	items, shipping := rules.ReturnRefundSplit(o, r, in.Amount, in.ShippingCost)
	if items <= 0 {
		return nil, Invalid{Reason: "Enter an amount to refund."}
	}
	key, err := s.MidtransServerKey(ctx, r.TenantID)
	if err != nil {
		return nil, err
	}
	refund := integrations.Refund{Status: "failed", Error: "Midtrans is switched off for this store."}
	if key != "" {
		refund, err = s.RefundMidtrans(ctx, key, integrations.RefundRequest{
			TenantID: r.TenantID, OrderID: o.ID, ReturnID: r.ID, Amount: items + shipping, Reason: "Return " + r.Code, At: m.At,
		})
		if err != nil {
			return nil, err
		}
	}
	if refund.Status != "succeeded" {
		d, err := s.Orders.RecordRefundFailure(ctx, m, id, refund.Status, refund.Error)
		if err != nil {
			return nil, err
		}
		reason := refund.Error
		if refund.Status == "failed" {
			reason = "Midtrans did not refund: " + reason
		}
		return nil, RefundFailed{Reason: reason, Delta: d}
	}
	// A refund found from an earlier try is recorded at the amount Midtrans refunded then.
	if refund.Amount != items+shipping {
		items = min(refund.Amount, rules.ReturnRefundCap(o, r))
		shipping = refund.Amount - items
	}
	in.Amount, in.ShippingCost, in.Method, in.Reference = items, shipping, "midtrans", refund.Reference
	return s.Orders.RefundReturn(ctx, m, id, in)
}
