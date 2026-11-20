package httpapi

import (
	"net/http"
	"strconv"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// invoiceRoutes registers the order invoice PDF for staff and for the shopper who placed the order.
// The first download issues the invoice number; later ones show the same number.
func (s *Server) invoiceRoutes(rt *router) {
	rt.table = append(rt.table, Route{Method: "GET", Path: prefix + "/orders/{id}/invoice.pdf", Scope: "orders:read",
		Summary: "The order's invoice as a PDF; the first download issues its number"})
	rt.mux.HandleFunc("GET "+prefix+"/orders/{id}/invoice.pdf", s.reader("orders:read", s.staffInvoice))
	rt.add("GET", "/shop/{store}/orders/{id}/invoice.pdf", "", "", "The signed-in shopper's invoice for one of their own orders, as a PDF", s.shopInvoice)
}

func (s *Server) staffInvoice(w http.ResponseWriter, r *http.Request) {
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
	s.writeInvoice(w, r, s.meta(r))
}

func (s *Server) shopInvoice(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in to see your invoice.")
		return
	}
	// Another shopper's order answers as if it did not exist.
	o, err := store.Get[domain.Order](r.Context(), s.DB.Pool, "orders", r.PathValue("id"))
	if err != nil || o.TenantID != tenant.ID || o.CustomerID != p.ID {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "not found")
		return
	}
	s.writeInvoice(w, r, service.Meta{P: p, At: s.Clock.NowIso()})
}

func (s *Server) writeInvoice(w http.ResponseWriter, r *http.Request, m service.Meta) {
	body, name, err := s.svc.InvoicePDF(r.Context(), m, r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+name+`"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(body)
}
