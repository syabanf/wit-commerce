package service_test

import (
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// shopperTransferOrder places, as the shopper, a copy of a packed Lari order paid by bank transfer,
// built by the browser as already paid.
func shopperTransferOrder(t *testing.T, svc *service.Service, db *store.DB, id string) (domain.Order, service.Meta) {
	t.Helper()
	o := packedOrder(t, db)
	o.ID, o.Code, o.CreatedAt = id, "LARI-9"+id[len(id)-4:], clock.FixtureNow
	o.Status, o.PaymentStatus, o.PaymentMethod, o.PaymentTypeID = "paid", "paid", "ewallet", new("pay-lari-ovo")
	shopper := service.Meta{P: auth.Principal{Kind: auth.KindCustomer, ID: o.CustomerID, TenantID: "ten-lari"}, At: clock.FixtureNow}
	if _, err := svc.PlaceOrder(t.Context(), shopper, o, nil); err != nil {
		t.Fatal(err)
	}
	placed, _ := store.Get[domain.Order](t.Context(), db.Pool, "orders", id)
	if placed.PaymentStatus != "pending" {
		t.Fatalf("placed %s", placed.PaymentStatus)
	}
	return placed, shopper
}

func kinds(emails []queuedEmail) []string {
	out := make([]string, len(emails))
	for i, e := range emails {
		out[i] = e.kind
	}
	return out
}

// TestPaymentCheckEmails: the shopper hears that their confirmation arrived, that staff rejected it
// and why, and that the payment is confirmed, in the store's language.
func TestPaymentCheckEmails(t *testing.T) {
	svc, db, admin := mailService(t, mail.New("http://127.0.0.1:1", "re_test", "Shop <noreply@example.com>"))
	o, shopper := shopperTransferOrder(t, svc, db, "ord-mail-0001")
	in := service.PaymentConfirmationInput{Amount: o.Total, Channel: "BCA", SenderName: "Rina", TransferredAt: "2026-10-05T10:00"}
	steps := []func() error{
		func() error { _, err := svc.SubmitPaymentConfirmation(t.Context(), shopper, o.ID, in); return err },
		func() error {
			_, err := svc.RejectPayment(t.Context(), admin, o.ID, "Belum ada transfer masuk")
			return err
		},
		func() error { _, err := svc.SubmitPaymentConfirmation(t.Context(), shopper, o.ID, in); return err },
		func() error { _, err := svc.ConfirmTransfer(t.Context(), admin, o.ID); return err },
	}
	for i, step := range steps {
		shopper.At = clock.Iso(clock.FromMs(clock.Ms(clock.FixtureNow) + int64(i+1)*clock.Hour))
		admin.At = shopper.At
		if err := step(); err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
	}
	got := outbox(t, db)
	want := "shopper_order_placed shopper_payment_confirmation_received shopper_payment_rejected shopper_payment_confirmation_received shopper_payment_received"
	if strings.Join(kinds(got), " ") != want {
		t.Fatalf("outbox kinds: %v", kinds(got))
	}
	if !strings.Contains(got[1].subject, "Konfirmasi pembayaran") || !strings.Contains(got[2].text, "Belum ada transfer masuk") {
		t.Errorf("Indonesian check emails: %q / %s", got[1].subject, got[2].text)
	}
}

// TestCancellationEmailCarriesTheRefund: a cancelled paid order tells the shopper the money is owed
// by transfer; recording the transfer sends its reference.
func TestCancellationEmailCarriesTheRefund(t *testing.T) {
	svc, db, admin := mailService(t, mail.New("http://127.0.0.1:1", "re_test", "Shop <noreply@example.com>"))
	if _, err := svc.SetShopSettings(t.Context(), admin, "ten-lari", 7, nil, "en"); err != nil {
		t.Fatal(err)
	}
	o, _ := shopperTransferOrder(t, svc, db, "ord-mail-0002")
	if _, err := svc.AdvanceOrder(t.Context(), admin, o.ID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CancelOrder(t.Context(), admin, o.ID, service.CancelInput{Reason: "out_of_stock"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RefundCancelled(t.Context(), admin, o.ID, service.CancelRefundInput{Reference: "BCA-77", RefundedOn: "2026-10-06"}); err != nil {
		t.Fatal(err)
	}
	got := outbox(t, db)
	if n := len(got); n < 2 {
		t.Fatalf("outbox: %v", kinds(got))
	}
	cancelled, refunded := got[len(got)-2], got[len(got)-1]
	if cancelled.kind != "shopper_order_cancelled" || !strings.Contains(cancelled.text, "by bank transfer and email you its reference") {
		t.Errorf("cancellation email: %s\n%s", cancelled.kind, cancelled.text)
	}
	if refunded.kind != "shopper_order_refunded" || !strings.Contains(refunded.text, "BCA-77") || !strings.Contains(refunded.text, "by bank transfer") {
		t.Errorf("refund email: %s\n%s", refunded.kind, refunded.text)
	}
}

// TestTimerWaitsWhileStaffCheckAPayment: an order whose confirmation waits for staff does not expire;
// after a rejection the shopper gets a fresh payment window.
func TestTimerWaitsWhileStaffCheckAPayment(t *testing.T) {
	svc, db, admin := mailService(t, nil)
	o, shopper := shopperTransferOrder(t, svc, db, "ord-tick-0001")
	in := service.PaymentConfirmationInput{Amount: o.Total, Channel: "BCA", SenderName: "Rina", TransferredAt: "2026-10-05T10:00"}
	if _, err := svc.SubmitPaymentConfirmation(t.Context(), shopper, o.ID, in); err != nil {
		t.Fatal(err)
	}
	later := clock.Ms(clock.FixtureNow) + 30*clock.Hour
	if _, err := svc.Tick(t.Context(), clock.Iso(clock.FromMs(later))); err != nil {
		t.Fatal(err)
	}
	if got, _ := store.Get[domain.Order](t.Context(), db.Pool, "orders", o.ID); got.Status == "cancelled" {
		t.Fatal("the timer cancelled an order staff are checking")
	}
	admin.At = clock.Iso(clock.FromMs(later))
	if _, err := svc.RejectPayment(t.Context(), admin, o.ID, "No transfer"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Tick(t.Context(), clock.Iso(clock.FromMs(later+clock.Hour))); err != nil {
		t.Fatal(err)
	}
	if got, _ := store.Get[domain.Order](t.Context(), db.Pool, "orders", o.ID); got.Status == "cancelled" {
		t.Fatal("the timer cancelled an order right after its confirmation was rejected")
	}
	if _, err := svc.Tick(t.Context(), clock.Iso(clock.FromMs(later+25*clock.Hour))); err != nil {
		t.Fatal(err)
	}
	if got, _ := store.Get[domain.Order](t.Context(), db.Pool, "orders", o.ID); got.Status != "cancelled" {
		t.Errorf("a day after the rejection: %s", got.Status)
	}
}
