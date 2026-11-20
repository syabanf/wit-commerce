package service

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/integrations"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Manual payment checks and cancellation refunds cross modules: the payment type and the gateway are
// the catalog's and integrations', the order the orders module's, the proof image media's.

type (
	CancelInput              = orders.CancelInput
	CancelRefundInput        = orders.CancelRefundInput
	PaymentConfirmationInput = rules.PaymentConfirmationInput
)

func (s *Service) accessibleOrder(ctx context.Context, m Meta, id string) (domain.Order, error) {
	o, err := store.Get[domain.Order](ctx, s.DB.Pool, "orders", id)
	if errors.Is(err, store.ErrNotFound) {
		return o, NotFound{What: "order"}
	}
	if err != nil {
		return o, err
	}
	return o, kernel.Access(m, o.TenantID)
}

// SubmitPaymentConfirmation is orders/submitPayment. An order a gateway collects is paid on the
// gateway's page, so the shopper's word does not count for it; a proof image must be one uploaded to
// this store.
func (s *Service) SubmitPaymentConfirmation(ctx context.Context, m Meta, id string, in PaymentConfirmationInput) (*Delta, error) {
	o, err := s.accessibleOrder(ctx, m, id)
	if err != nil {
		return nil, err
	}
	if o.PaymentTypeID != nil {
		online, err := s.Orders.Payments.CollectsOnline(ctx, o.TenantID, *o.PaymentTypeID, o.Total)
		if err != nil {
			return nil, err
		}
		if online {
			return nil, Refusal{Reason: "This order is paid on the payment page. Press Pay now on the order page."}
		}
	}
	if in.ProofURL != "" {
		var stored bool
		if err := s.DB.Pool.QueryRow(ctx, `select exists (select 1 from media where tenant_id = $1 and $2 like '%/' || path)`,
			o.TenantID, in.ProofURL).Scan(&stored); err != nil {
			return nil, err
		}
		if !stored {
			return nil, Invalid{Reason: "Upload the proof image here."}
		}
	}
	return s.Orders.SubmitPaymentConfirmation(ctx, m, id, in)
}

// midtransHolds says whether Midtrans took the order's payment and still holds money to refund.
func (s *Service) midtransHolds(ctx context.Context, orderID string) (bool, error) {
	p, err := s.PaymentFor(ctx, orderID)
	if err != nil {
		return false, err
	}
	return p != nil && p.Provider == "midtrans" && slices.Contains(midtransPaid, p.Status), nil
}

// refundThroughMidtrans asks Midtrans to refund what the order has left. A store whose Midtrans is
// off now gets a failed refund, which lets staff record a bank transfer instead.
func (s *Service) refundThroughMidtrans(ctx context.Context, o domain.Order, at string) (integrations.Refund, error) {
	key, err := s.MidtransServerKey(ctx, o.TenantID)
	if err != nil || key == "" {
		return integrations.Refund{Status: "failed", Error: "Midtrans is switched off for this store."}, err
	}
	return s.RefundMidtrans(ctx, key, integrations.RefundRequest{
		TenantID: o.TenantID, OrderID: o.ID, ReturnID: integrations.CancelSubject(o.ID), Kind: "cancellation",
		Amount: o.Total - o.RefundedAmount, Reason: "Cancelled order " + o.Code, At: at,
	})
}

// CancelOrder is orders/cancel. When Midtrans took a paid order's payment it refunds through Midtrans
// first; a refusal or no answer still cancels the order, with the refund owed and the reason on it,
// so staff retry or record a bank transfer (RefundCancelled). Any other paid order owes its refund
// until staff record the transfer, here or later.
func (s *Service) CancelOrder(ctx context.Context, m Meta, id string, in CancelInput) (*Delta, error) {
	in.Gateway = nil
	o, err := s.accessibleOrder(ctx, m, id)
	if err != nil {
		return nil, err
	}
	if o.PaymentStatus != "paid" {
		return s.Orders.CancelOrder(ctx, m, id, in)
	}
	held, err := s.midtransHolds(ctx, id)
	if err != nil {
		return nil, err
	}
	if !held {
		return s.Orders.CancelOrder(ctx, m, id, in)
	}
	if why := rules.OrderCancelBlocker(o); why != "" {
		return nil, Refusal{Reason: why}
	}
	refund, err := s.refundThroughMidtrans(ctx, o, m.At)
	if err != nil {
		return nil, err
	}
	if refund.Status == "failed" {
		refund.Error = "Midtrans did not refund: " + refund.Error
	}
	in.Reference, in.RefundedOn = "", ""
	in.Gateway = &domain.CancelRefund{Status: refund.Status, Reference: refund.Reference, Error: refund.Error}
	return s.Orders.CancelOrder(ctx, m, id, in)
}

// RefundCancelled is orders/refundCancelled: it settles what a cancellation owes. A Midtrans payment
// is refunded through Midtrans again, under the same key while the last try had no answer, so money
// moves once. After Midtrans said no, or for any other payment, staff record the bank transfer
// reference and date.
func (s *Service) RefundCancelled(ctx context.Context, m Meta, id string, in CancelRefundInput) (*Delta, error) {
	o, err := s.accessibleOrder(ctx, m, id)
	if err != nil {
		return nil, err
	}
	if why := rules.CancelRefundBlocker(o); why != "" {
		return nil, Refusal{Reason: why}
	}
	in.Method = "manual"
	held, err := s.midtransHolds(ctx, id)
	if err != nil {
		return nil, err
	}
	gateway := held || o.CancelRefund.Method == "midtrans"
	if !gateway || o.CancelRefund.Status == "failed" && strings.TrimSpace(in.Reference) != "" {
		return s.Orders.RecordCancelRefund(ctx, m, id, in)
	}
	refund, err := s.refundThroughMidtrans(ctx, o, m.At)
	if err != nil {
		return nil, err
	}
	if refund.Status != "succeeded" {
		reason := refund.Error
		if refund.Status == "failed" {
			reason = "Midtrans did not refund: " + reason
		}
		d, err := s.Orders.RecordCancelRefundFailure(ctx, m, id, refund.Status, reason)
		if err != nil {
			return nil, err
		}
		return nil, RefundFailed{Reason: reason, Delta: d}
	}
	in.Method, in.Reference = "midtrans", refund.Reference
	return s.Orders.RecordCancelRefund(ctx, m, id, in)
}
