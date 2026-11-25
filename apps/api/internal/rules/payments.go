package rules

import (
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Payment rules mirror packages/fixtures/src/payments.ts. The server alone decides that an order is
// paid: a shopper's order arrives waiting for payment, a manual transfer or static QRIS payment is
// the shopper's claim until staff confirm it, and Midtrans says so only through a verified status.

// ShopperPlacement is the order a shopper may place: open and waiting for payment, whatever the
// browser sent, dated by the server. Cash on delivery turns paid on delivery, a gateway from its
// verified status, and a transfer once staff confirm it.
func ShopperPlacement(o domain.Order, at string) domain.Order {
	// The server's clock starts the 24-hour payment window, never the browser's.
	o.CreatedAt = domain.IsoDate(at)
	if o.Status != "new" && o.Status != "confirmed" {
		o.Status = "confirmed"
	}
	o.PaymentStatus = "pending"
	o.RefundedAmount = 0
	o.CancelReason = nil
	o.TrackingNo = nil
	o.PaymentConfirmation = nil
	o.CancelRefund = nil
	events := make([]domain.OrderEvent, 0, len(o.Events))
	for _, e := range o.Events {
		if e.Status == nil || *e.Status == "new" || *e.Status == "confirmed" {
			e.At = domain.IsoDate(at)
			events = append(events, e)
		}
	}
	o.Events = events
	return o
}

// AwaitsPayment is an open order whose payment has not arrived.
func AwaitsPayment(o domain.Order) bool {
	return o.PaymentStatus == "pending" && o.PaymentMethod != "cod" && (o.Status == "new" || o.Status == "confirmed")
}

// PaymentConfirmationInput is what the shopper reports after paying.
type PaymentConfirmationInput struct {
	Amount        int    `json:"amount"`
	Channel       string `json:"channel"`
	SenderName    string `json:"senderName"`
	TransferredAt string `json:"transferredAt"`
	ProofURL      string `json:"proofUrl,omitempty"`
}

// PaymentConfirmationBlocker mirrors paymentConfirmationBlocker.
func PaymentConfirmationBlocker(o domain.Order, in PaymentConfirmationInput) string {
	if o.PaymentMethod == "cod" {
		return "Cash on delivery is paid to the courier."
	}
	if !AwaitsPayment(o) {
		return "This order is not waiting for payment."
	}
	if o.PaymentConfirmation != nil && o.PaymentConfirmation.Status == "submitted" {
		return "The store is already checking your payment."
	}
	if in.Amount <= 0 {
		return "Enter the amount you sent."
	}
	if channel := strings.TrimSpace(in.Channel); channel == "" || len([]rune(channel)) > 60 {
		return "Enter the bank or wallet you paid from."
	}
	if sender := strings.TrimSpace(in.SenderName); sender == "" || len([]rune(sender)) > 120 {
		return "Enter the name on the account you paid from."
	}
	if strings.TrimSpace(in.TransferredAt) == "" {
		return "Enter when you sent the money."
	}
	if in.ProofURL != "" && !strings.Contains(in.ProofURL, "/med-") {
		return "Upload the proof image here."
	}
	return ""
}

// PaymentReviewBlocker mirrors paymentReviewBlocker: staff confirm or reject only a confirmation
// that waits for them, on an order still waiting for payment.
func PaymentReviewBlocker(o domain.Order) string {
	if o.PaymentConfirmation == nil || o.PaymentConfirmation.Status != "submitted" {
		return "No payment confirmation is waiting for a check."
	}
	if !AwaitsPayment(o) {
		return "This order is not waiting for payment."
	}
	return ""
}

// CancelRefundBlocker mirrors cancelRefundBlocker.
func CancelRefundBlocker(o domain.Order) string {
	if o.CancelRefund == nil {
		return "This order owes no refund."
	}
	if o.CancelRefund.Status == "succeeded" {
		return "The refund is already recorded."
	}
	return ""
}

// PaymentWindowOpen mirrors paymentWindowOpen: an unpaid order may still be paid within window
// milliseconds of when it was placed, or of when staff rejected its last payment confirmation. It
// stays open while staff check a confirmation.
func PaymentWindowOpen(o domain.Order, now, window int64) bool {
	since := clock.Ms(o.CreatedAt)
	if pc := o.PaymentConfirmation; pc != nil {
		if pc.Status == "submitted" {
			return true
		}
		if pc.ReviewedAt != "" {
			since = max(since, clock.Ms(pc.ReviewedAt))
		}
	}
	return now-since < window
}
