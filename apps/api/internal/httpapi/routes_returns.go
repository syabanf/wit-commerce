package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

type (
	returnRequestInput struct {
		ID      string                  `json:"id"`
		OrderID string                  `json:"orderId"`
		Items   []returnRequestItemBody `json:"items"`
		Note    string                  `json:"note"`
	}
	returnRequestItemBody struct {
		VariantID string `json:"variantId"`
		Qty       int    `json:"qty"`
		Reason    string `json:"reason"`
	}
	rejectInput struct {
		Reason string `json:"reason"`
	}
	receiveInput struct {
		Restock bool `json:"restock"`
	}
	shopSettingsInput struct {
		ReturnWindowDays int      `json:"returnWindowDays"`
		ShopperEmailsOff []string `json:"shopperEmailsOff"`
	}
)

func (in returnRequestInput) request() service.ReturnRequest {
	out := service.ReturnRequest{ID: in.ID, OrderID: in.OrderID, Note: in.Note}
	for _, item := range in.Items {
		out.Items = append(out.Items, service.ReturnItem{VariantID: item.VariantID, Qty: item.Qty, Reason: item.Reason})
	}
	return out
}

// returnStarters may start or cancel a return for a shopper: whoever fulfils orders or answers
// tickets. An API key needs orders:write.
var returnStarters = []string{"order.fulfil", "ticket.manage"}

// anyOf wraps a handler that a user holding any of the permissions may call. The route table names
// the first one.
func (s *Server) anyOf(permissions []string, h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		if p.Kind == auth.KindAPIKey {
			scope := auth.ScopeFor(permissions[0])
			return p.HasScope(scope), "This API key lacks the scope " + scope + "."
		}
		for _, permission := range permissions {
			if auth.Can(p.Role, permission) {
				return true, ""
			}
		}
		return false, "Your role cannot do this."
	}, h)
}

// addAnyOf registers a route guarded by anyOf.
func (rt *router) addAnyOf(method, path, action string, permissions []string, summary string, h http.HandlerFunc) {
	rt.table = append(rt.table, Route{
		Method: method, Path: prefix + path, Action: action, Permission: permissions[0],
		Scope: auth.ScopeFor(permissions[0]), Summary: summary,
	})
	rt.mux.HandleFunc(method+" "+prefix+path, rt.s.anyOf(permissions, h))
}

// returnRoutes registers the staff return actions and the brand's shop settings.
func (s *Server) returnRoutes(rt *router) {
	rt.addAnyOf("POST", "/returns", "returns/request", returnStarters, "Start a return for a shipped or delivered order (order.fulfil or ticket.manage)", func(w http.ResponseWriter, r *http.Request) {
		var in returnRequestInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return s.svc.RequestReturn(r.Context(), m, in.request()) })
	})
	rt.add("POST", "/returns/{id}/approve", "returns/approve", "order.refund", "Approve a requested return", note(s, s.svc.ApproveReturn))
	rt.add("POST", "/returns/{id}/reject", "returns/reject", "order.refund", "Reject a requested return with a reason the shopper reads", func(w http.ResponseWriter, r *http.Request) {
		var in rejectInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.RejectReturn(r.Context(), m, r.PathValue("id"), in.Reason)
		})
	})
	rt.addAnyOf("POST", "/returns/{id}/cancel", "returns/cancel", returnStarters, "Cancel a return that has not been received (order.fulfil or ticket.manage)", note(s, s.svc.CancelReturn))
	rt.add("POST", "/returns/{id}/receive", "returns/receive", "order.refund", "Mark a return received, optionally putting its units back in stock", func(w http.ResponseWriter, r *http.Request) {
		var in receiveInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.ReceiveReturn(r.Context(), m, r.PathValue("id"), in.Restock)
		})
	})
	rt.add("POST", "/returns/{id}/refund", "returns/refund", "order.refund", "Refund a received return, capped at what its items cost", func(w http.ResponseWriter, r *http.Request) {
		var in refundInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.RefundReturn(r.Context(), m, r.PathValue("id"), in.Amount, in.Note)
		})
	})
	rt.add("PUT", "/tenants/{id}/shop-settings", "tenants/setShopSettings", "brand.manage", "Set the return window and the shopper emails the store sends", func(w http.ResponseWriter, r *http.Request) {
		var in shopSettingsInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SetShopSettings(r.Context(), m, r.PathValue("id"), in.ReturnWindowDays, in.ShopperEmailsOff)
		})
	})
	rt.add("GET", "/views/returns", "", "", "Returns, newest first: filtered by status, order or search, with counts per status", s.reader("orders:read", s.returnRows))
	rt.add("GET", "/views/sales-months", "", "", "Sales and product totals per month for months older than the daily window", s.reader("orders:read", s.salesMonths))
}

// shopReturn is the signed-in shopper's own request, or their cancel of one.
func (s *Server) shopReturn(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in to ask for a return.")
		return
	}
	m := service.Meta{P: p, At: s.Clock.NowIso()}
	var d *service.Delta
	if id := r.PathValue("id"); id != "" {
		var in noteInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		d, err = s.svc.CancelReturn(r.Context(), m, id, in.Note)
	} else {
		var in returnRequestInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		d, err = s.svc.RequestReturn(r.Context(), m, in.request())
	}
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.publish(d))
}
