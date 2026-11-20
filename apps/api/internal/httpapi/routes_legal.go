package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// complaintsPerHour is how many complaints one client may send to any store in an hour.
const complaintsPerHour = 5

type (
	courierEtaInput struct {
		CourierEtaDays map[string]domain.EtaDays `json:"courierEtaDays"`
	}
	// shopComplaintInput is what the storefront's complaint form sends. The server picks the id and
	// knows the shopper from the token.
	shopComplaintInput struct {
		OrderID *string              `json:"orderId"`
		Subject string               `json:"subject"`
		Message string               `json:"message"`
		Contact domain.TicketContact `json:"contact"`
	}
)

// legalRoutes registers the seller's legal details, delivery estimates and complaints (PP 80/2019).
func (s *Server) legalRoutes(rt *router) {
	rt.add("PUT", "/tenants/{id}/legal", "tenants/setLegal", "brand.manage", "Set the seller's identity, complaint service and terms choices", func(w http.ResponseWriter, r *http.Request) {
		var in domain.SellerLegal
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SetLegal(r.Context(), m, r.PathValue("id"), in)
		})
	})
	rt.add("PUT", "/tenants/{id}/courier-eta", "tenants/setCourierEta", "brand.manage", "Set delivery days per courier; an empty map brings back the platform's estimates", func(w http.ResponseWriter, r *http.Request) {
		var in courierEtaInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SetCourierEta(r.Context(), m, r.PathValue("id"), in.CourierEtaDays)
		})
	})
	rt.add("PUT", "/tenants/{id}/tax", "tenants/setTax", "brand.manage", "Set whether the brand charges PPN, how its prices hold it, and product or category overrides; PKP needs an NPWP", func(w http.ResponseWriter, r *http.Request) {
		var in domain.TaxSettings
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SetTax(r.Context(), m, r.PathValue("id"), in)
		})
	})
	rt.add("POST", "/tickets", "tickets/open", "ticket.manage", "Log a shopper's complaint, due in the store's complaint days", body(s, s.svc.OpenTicket))
	rt.add("POST", "/shop/{store}/complaints", "tickets/open", "", "Send the store a complaint; it opens a ticket due in the store's complaint days", s.shopComplaint)
}

// shopComplaint opens a complaint ticket from the storefront. Guests may send one too, so the route
// counts per client; a signed-in shopper's ticket carries their customer record.
func (s *Server) shopComplaint(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in shopComplaintInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.complaintClients.allow(s.clientIP(r), w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many complaints from here. Try again in an hour, or contact the store directly.")
		return
	}
	if why := rules.ComplaintBlocker(in.Subject, in.Message, in.Contact); why != "" {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", why)
		return
	}
	p := s.shopPrincipal(r, tenant.ID)
	c := service.Complaint{ID: ids.New("tic"), TenantID: tenant.ID, OrderID: in.OrderID, Subject: in.Subject, Message: in.Message, Contact: in.Contact}
	if p.ID != "guest" {
		c.CustomerID = &p.ID
	}
	d, err := s.svc.OpenTicket(r.Context(), service.Meta{P: p, At: s.Clock.NowIso()}, c)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.publish(d))
}

// termsProblem is why a storefront order cannot be placed under the store's terms, or "" when the
// shopper agreed to the version the store shows now (PP 80/2019 Pasal 46).
func termsProblem(tenant domain.Tenant, o domain.Order) string {
	switch o.TermsVersion {
	case "":
		return "Agree to the store's Terms and Privacy Policy to place the order."
	case rules.TermsVersion(tenant):
		return ""
	}
	return "The store's terms changed. Reload the checkout, read them, and agree again."
}
