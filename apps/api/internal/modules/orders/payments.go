package orders

import (
	"context"
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// Manual payments and cancellation refunds. A shopper who paid by bank transfer or static QRIS
// reports it; staff check the money arrived and confirm, which turns the order paid, or reject it
// with a reason the shopper reads. Only staff and verified gateway statuses mark an order paid.

// SubmitPaymentConfirmation is orders/submitPayment: the shopper reports a manual payment. The order
// stays waiting for payment, and the timer leaves it alone while staff check.
func (s *Orders) SubmitPaymentConfirmation(ctx context.Context, m kernel.Meta, id string, in rules.PaymentConfirmationInput) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if m.P.Kind == "customer" && o.CustomerID != m.P.ID {
			return kernel.NotFound{What: "order"}
		}
		if why := rules.PaymentConfirmationBlocker(o, in); why != "" {
			return kernel.Refuse(why)
		}
		pc := domain.PaymentConfirmation{
			Amount: in.Amount, Channel: strings.TrimSpace(in.Channel), SenderName: strings.TrimSpace(in.SenderName),
			TransferredAt: strings.TrimSpace(in.TransferredAt), ProofURL: in.ProofURL, SubmittedAt: m.At, Status: "submitted",
		}
		o.PaymentConfirmation = &pc
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), nil, fmt.Sprintf("Payment confirmation sent: %d from %s", pc.Amount, pc.Channel))}, o.Events...)
		t.Notify(kernel.Notice{Kind: "payment_confirmation_received", Order: o, Amount: pc.Amount})
		return t.Put("orders", o.ID, o)
	})
}

// ConfirmTransfer is orders/confirmPayment: staff saw the money arrive. The order turns paid on the
// same path as any other payment.
func (s *Orders) ConfirmTransfer(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.PaymentReviewBlocker(o); why != "" {
			return kernel.Refuse(why)
		}
		pc := *o.PaymentConfirmation
		pc.Status, pc.ReviewedAt, pc.ReviewedBy = "confirmed", m.At, m.By()
		o.PaymentConfirmation = &pc
		return advance(t, m, o, "paid", nil)
	})
}

// RejectPayment is orders/rejectPayment: the money did not arrive as reported. The order waits for
// payment again, and the shopper may send a new confirmation.
func (s *Orders) RejectPayment(ctx context.Context, m kernel.Meta, id, reason string) (*kernel.Delta, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, kernel.Invalid{Reason: "Tell the shopper why the payment was not accepted."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.PaymentReviewBlocker(o); why != "" {
			return kernel.Refuse(why)
		}
		pc := *o.PaymentConfirmation
		pc.Status, pc.ReviewedAt, pc.ReviewedBy, pc.RejectReason = "rejected", m.At, m.By(), reason
		o.PaymentConfirmation = &pc
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), nil, "Payment confirmation rejected: "+reason)}, o.Events...)
		t.Notify(kernel.Notice{Kind: "payment_rejected", Order: o})
		return t.Put("orders", o.ID, o)
	})
}

// CancelRefundInput is orders/refundCancelled. Method is midtrans once the gateway refunded, with
// its reference; otherwise staff record the bank transfer reference and date.
type CancelRefundInput struct {
	Method     string `json:"method,omitempty"`
	Reference  string `json:"reference"`
	RefundedOn string `json:"refundedOn"`
}

// RecordCancelRefund is orders/refundCancelled: the money a cancellation owed went back. The order
// closes as refunded only with that proof (PP 80/2019 Pasal 71).
func (s *Orders) RecordCancelRefund(ctx context.Context, m kernel.Meta, id string, in CancelRefundInput) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.CancelRefundBlocker(o); why != "" {
			return kernel.Refuse(why)
		}
		method := in.Method
		if method == "" {
			method = "manual"
		}
		if why := rules.ReturnRefundProofBlocker(method, in.Reference, in.RefundedOn); why != "" {
			return kernel.Invalid{Reason: why}
		}
		refund := *o.CancelRefund
		refund.Status, refund.Method, refund.Reference, refund.Error = "succeeded", method, strings.TrimSpace(in.Reference), ""
		refund.RefundedOn = strings.TrimSpace(in.RefundedOn)
		if method == "midtrans" {
			refund.RefundedOn = m.At
		}
		o.CancelRefund = &refund
		o.Status, o.PaymentStatus, o.RefundedAmount = "refunded", "refunded", o.RefundedAmount+refund.Amount
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), kernel.Ptr("refunded"), fmt.Sprintf("Refunded %d · %s", refund.Amount, refund.Reference))}, o.Events...)
		t.Notify(kernel.Notice{Kind: "order_refunded", Order: o, Amount: refund.Amount})
		return t.Put("orders", o.ID, o)
	})
}

// RecordCancelRefundFailure keeps a gateway refund that did not go through on the order, which stays
// cancelled with the refund owed. status is failed when the gateway said no, or pending when it did
// not answer; only a failed one lets staff record a bank transfer instead.
func (s *Orders) RecordCancelRefundFailure(ctx context.Context, m kernel.Meta, id, status, reason string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		o, err := kernel.Lock[domain.Order](t, "orders", id, "order")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		if why := rules.CancelRefundBlocker(o); why != "" {
			return kernel.Refuse(why)
		}
		refund := *o.CancelRefund
		refund.Status, refund.Method, refund.Error = status, "midtrans", reason
		o.CancelRefund = &refund
		o.Events = append([]domain.OrderEvent{kernel.OrderEvent(m.At, m.By(), nil, "Gateway refund failed: "+reason)}, o.Events...)
		return t.Put("orders", o.ID, o)
	})
}
