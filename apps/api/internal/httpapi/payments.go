package httpapi

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// paymentLink is what the storefront needs to send a shopper to the provider's payment page.
type paymentLink struct {
	Provider    string `json:"provider"`
	Status      string `json:"status"`
	SnapToken   string `json:"snapToken"`
	RedirectURL string `json:"redirectUrl"`
}

type (
	// shopOrderResponse is the place-order answer: the delta, the new guest's token and, when a
	// provider collects the payment online, the page to pay on.
	shopOrderResponse struct {
		DeltaResponse
		Token        string       `json:"token,omitempty"`
		Payment      *paymentLink `json:"payment,omitempty"`
		PaymentError string       `json:"paymentError,omitempty"`
	}
	orderPaymentResponse struct {
		Payment *service.Payment `json:"payment"`
	}
	midtransNotificationInput struct {
		OrderID           string `json:"order_id"`
		StatusCode        string `json:"status_code"`
		GrossAmount       string `json:"gross_amount"`
		SignatureKey      string `json:"signature_key"`
		TransactionStatus string `json:"transaction_status"`
	}
)

func linkOf(p *service.Payment) *paymentLink {
	if p == nil || p.RedirectURL == nil {
		return nil
	}
	link := &paymentLink{Provider: p.Provider, Status: p.Status, RedirectURL: *p.RedirectURL}
	if p.SnapToken != nil {
		link.SnapToken = *p.SnapToken
	}
	return link
}

// paymentRoutes registers the provider callbacks and the console's view of a payment.
func (s *Server) paymentRoutes(rt *router) {
	rt.add("POST", "/payments/midtrans/notification", "", "", "Midtrans payment notification; the signature and a status check decide", s.midtransNotification)
	rt.table = append(rt.table, Route{Method: "GET", Path: prefix + "/orders/{id}/payment", Scope: "orders:read", Summary: "The online payment record of an order, if it has one"})
	rt.mux.HandleFunc("GET "+prefix+"/orders/{id}/payment", s.reader("orders:read", s.orderPayment))
	rt.add("POST", "/orders/{id}/payment/confirm", "orders/confirmPayment", "order.refund", "Confirm a shopper's manual payment after checking the money arrived; the order turns paid", idOnly(s, s.svc.ConfirmTransfer))
	rt.add("POST", "/orders/{id}/payment/reject", "orders/rejectPayment", "order.refund", "Reject a shopper's manual payment confirmation with a reason the shopper reads", func(w http.ResponseWriter, r *http.Request) {
		var in rejectInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.RejectPayment(r.Context(), m, r.PathValue("id"), in.Reason)
		})
	})
	rt.add("POST", "/orders/{id}/cancel-refund", "orders/refundCancelled", "order.refund", "Settle a cancelled order's refund: through Midtrans again when it took the payment, else record the bank transfer", func(w http.ResponseWriter, r *http.Request) {
		var in service.CancelRefundInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			d, err := s.svc.RefundCancelled(r.Context(), m, r.PathValue("id"), in)
			// A gateway refusal is recorded on the order; publish that before answering with the reason.
			var failed service.RefundFailed
			if errors.As(err, &failed) {
				s.publish(failed.Delta)
				return nil, service.Refusal{Reason: failed.Reason}
			}
			return d, err
		})
	})
	rt.add("POST", "/shop/{store}/orders/{id}/payment-confirmation", "orders/submitPayment", "", "Tell the store you paid a manual transfer or static QRIS order; staff check it before the order turns paid", s.shopPaymentConfirmation)
	rt.add("POST", "/shop/{store}/payment-proof", "", "", "Upload a PNG, JPEG or WebP image of a payment, at most 5 MB, for a payment confirmation", s.shopPaymentProof)
}

// shopPaymentConfirmation is the signed-in shopper's report of a manual payment of their own order.
func (s *Server) shopPaymentConfirmation(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in to tell the store you paid.")
		return
	}
	var in service.PaymentConfirmationInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	d, err := s.svc.SubmitPaymentConfirmation(r.Context(), service.Meta{P: p, At: s.Clock.NowIso()}, r.PathValue("id"), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.publish(d))
}

// shopPaymentProof stores a signed-in shopper's image of their payment in the store's media, for the
// proof of a payment confirmation.
func (s *Server) shopPaymentProof(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in to upload a payment proof.")
		return
	}
	s.storeUpload(w, r, tenant.ID, service.Meta{P: p, At: s.Clock.NowIso()}, func() (bool, error) { return true, nil })
}

// orderPageURL is where the provider sends the shopper back: the order page of the storefront, on the
// store's own host when STORE_ROOT_DOMAIN is set. Without it or PUBLIC_URL it trusts only an allowed
// Origin, so the link cannot point anywhere else.
func (s *Server) orderPageURL(r *http.Request, tenant domain.Tenant, orderID string) string {
	path := "/order/" + url.PathEscape(orderID)
	if s.StoreRootDomain != "" || s.PublicURL != "" {
		return domain.StoreLink(tenant, s.StoreRootDomain, s.PublicURL) + path
	}
	origin := strings.TrimRight(r.Header.Get("Origin"), "/")
	if origin != "" && slices.ContainsFunc(s.AllowedOrigins, func(o string) bool { return strings.TrimRight(o, "/") == origin }) {
		return origin + "/" + tenant.Subdomain + path
	}
	return ""
}

// startPayment opens the provider's payment for a placed order and adds it to the answer. A failure
// leaves the order placed and waiting for payment, and says so.
func (s *Server) startPayment(r *http.Request, tenant domain.Tenant, orderID string, out map[string]any) {
	p, err := s.svc.StartPayment(r.Context(), orderID, s.orderPageURL(r, tenant, orderID))
	if err != nil {
		s.Log.Error("payment did not start", "orderId", orderID, "err", err, "requestId", requestIDOf(r.Context()))
		out["paymentError"] = "Your order is in, but the payment page did not open. The store will contact you."
		return
	}
	if link := linkOf(p); link != nil {
		out["payment"] = link
	}
}

// shopPayments lists the open payment pages of a shopper's orders that still wait for payment.
func (s *Server) shopPayments(r *http.Request, orders []domain.Order) (map[string]*paymentLink, error) {
	out := map[string]*paymentLink{}
	for _, o := range orders {
		if o.PaymentStatus != "pending" || o.PaymentMethod == "cod" {
			continue
		}
		p, err := s.svc.PaymentFor(r.Context(), o.ID)
		if err != nil {
			return nil, err
		}
		if link := linkOf(p); link != nil {
			out[o.ID] = link
		}
	}
	return out, nil
}

// midtransNotification takes Midtrans's HTTP notification. A bad signature changes nothing and
// answers 401; any other failure answers 5xx, so Midtrans sends it again.
func (s *Server) midtransNotification(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeProblem(w, http.StatusRequestEntityTooLarge, "TOO_LARGE", "The notification is too large.")
		return
	}
	d, err := s.svc.MidtransNotification(r.Context(), body)
	if errors.Is(err, service.ErrBadSignature) {
		writeProblem(w, http.StatusUnauthorized, "BAD_SIGNATURE", err.Error())
		return
	}
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !d.Empty() {
		s.publish(d)
	}
	writeJSON(w, http.StatusOK, okResponse{Ok: true})
}

// orderPayment answers the payment record of an order the caller may read; null when it has none.
func (s *Server) orderPayment(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	where, args, err := s.visibleRow(r, "orders", tenantID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	rows, err := store.Raw(r.Context(), s.DB.Pool, "orders", where, args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if len(rows) == 0 {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "not found")
		return
	}
	p, err := s.svc.PaymentFor(r.Context(), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, orderPaymentResponse{Payment: p})
}
