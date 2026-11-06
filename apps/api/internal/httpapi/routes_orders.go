package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// orderRoutes registers the staff order actions.
func (s *Server) orderRoutes(rt *router) {
	rt.add("POST", "/orders", "orders/place", "order.fulfil", "Place an order on a customer's behalf", s.placeOrder)
	rt.add("POST", "/orders/{id}/advance", "orders/advance", "order.fulfil", "Move an order to its next step", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			TrackingNo *string `json:"trackingNo"`
		}
		if r.ContentLength != 0 {
			if err := decode(r, &in); err != nil {
				s.writeError(w, r, err)
				return
			}
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.AdvanceOrder(r.Context(), m, r.PathValue("id"), in.TrackingNo)
		})
	})
	rt.add("POST", "/orders/{id}/cancel", "orders/cancel", "order.fulfil", "Cancel an order; paid ones are refunded", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Reason string `json:"reason"`
			Note   string `json:"note"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.CancelOrder(r.Context(), m, r.PathValue("id"), in.Reason, in.Note)
		})
	})
	rt.add("POST", "/orders/{id}/refund", "orders/refund", "order.refund", "Refund part or all of a paid order", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Amount int    `json:"amount"`
			Note   string `json:"note"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.RefundOrder(r.Context(), m, r.PathValue("id"), in.Amount, in.Note)
		})
	})
	rt.add("POST", "/orders/{id}/notes", "orders/note", "order.fulfil", "Add a note to an order's timeline", note(s, s.svc.NoteOrder))
}
