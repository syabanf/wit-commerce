package httpapi

import (
	"fmt"
	"html"
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// unsubscribePurpose keys the signed token in a marketing email's unsubscribe link.
const unsubscribePurpose = "unsubscribe"

type consentInput struct {
	Granted bool `json:"granted"`
	// Source is checkout or account from the storefront; staff changes are always staff.
	Source      string `json:"source"`
	TextVersion string `json:"textVersion"`
}

type privacyRequestInput struct {
	// CustomerID is for staff logging a request they took by phone or email.
	CustomerID string `json:"customerId,omitempty"`
	Kind       string `json:"kind"`
	Note       string `json:"note"`
}

type privacyRequestsResponse struct {
	Requests []domain.PrivacyRequest `json:"requests"`
}

// privacyRoutes registers erasure, consent, privacy requests and the unsubscribe link.
func (s *Server) privacyRoutes(rt *router) {
	rt.add("POST", "/customers/{id}/erase", "customers/erase", "privacy.manage", "Replace a customer's personal data with placeholders, keep their orders' amounts, and end their account", note(s, s.svc.EraseCustomer))
	rt.add("POST", "/customers/{id}/consent", "customers/setConsent", "customer.manage", "Record a customer's answer about marketing messages, as told to staff", func(w http.ResponseWriter, r *http.Request) {
		var in consentInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SetConsent(r.Context(), m, r.PathValue("id"), in.Granted, "staff", in.TextVersion)
		})
	})
	rt.add("GET", "/customers/{id}/export", "", "privacy.manage", "Everything the store holds about a customer, as JSON", func(w http.ResponseWriter, r *http.Request) {
		s.writeExport(w, r, s.meta(r), r.PathValue("id"))
	})
	rt.add("GET", "/customers/privacy-requests", "", "privacy.manage", "A brand's privacy requests, open ones by deadline; ?status=open|completed", func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := readTenant(r)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		list, err := crm.PrivacyRequests(r.Context(), s.DB.Pool, crm.PrivacyRequestFilter{TenantID: tenantID, Status: r.URL.Query().Get("status")})
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, privacyRequestsResponse{Requests: list})
	})
	rt.add("POST", "/customers/privacy-requests", "", "privacy.manage", "Log a privacy request a customer made by phone or email", func(w http.ResponseWriter, r *http.Request) {
		var in privacyRequestInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		req, err := s.svc.RequestPrivacy(r.Context(), s.meta(r), in.CustomerID, in.Kind, in.Note)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, req)
	})
	rt.add("POST", "/customers/privacy-requests/{id}/complete", "", "privacy.manage", "Answer a privacy request: an erasure erases, a consent withdrawal withdraws", note(s, s.svc.CompletePrivacyRequest))
	rt.add("GET", "/campaigns/{id}/audience", "", "campaign.manage", "Who a campaign reaches now, and how many it skips without marketing consent", func(w http.ResponseWriter, r *http.Request) {
		out, err := s.svc.Audience(r.Context(), s.meta(r), r.PathValue("id"))
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, out)
	})

	rt.add("POST", "/shop/{store}/consent", "customers/setConsent", "", "Give or withdraw the signed-in shopper's marketing consent", s.shopConsent)
	rt.add("GET", "/shop/{store}/privacy-requests", "", "", "The signed-in shopper's privacy requests", s.shopPrivacyRequests)
	rt.add("POST", "/shop/{store}/privacy-requests", "", "", "Ask the store for a copy, a correction or the erasure of your data, or to stop marketing", s.shopPrivacyRequests)
	rt.add("GET", "/shop/{store}/export", "", "", "The signed-in shopper's data as JSON, once the store completed their access request", s.shopExport)
	rt.add("GET", "/unsubscribe", "", "", "The page a marketing email's unsubscribe link opens", s.unsubscribe)
	rt.add("POST", "/unsubscribe", "", "", "Withdraw marketing consent with the token from a marketing email, at once", s.unsubscribe)
}

func (s *Server) writeExport(w http.ResponseWriter, r *http.Request, m service.Meta, customerID string) {
	out, err := s.svc.ExportCustomer(r.Context(), m, customerID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-data.json"`, out.Customer.Code))
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) shopConsent(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in first.")
		return
	}
	var in consentInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if in.Source != "checkout" && in.Source != "account" {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Send source checkout or account.")
		return
	}
	d, err := s.svc.SetConsent(r.Context(), service.Meta{P: p, At: s.Clock.NowIso()}, p.ID, in.Granted, in.Source, in.TextVersion)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.publish(d))
}

func (s *Server) shopPrivacyRequests(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in first.")
		return
	}
	if r.Method == http.MethodPost {
		var in privacyRequestInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		if _, err := s.svc.RequestPrivacy(r.Context(), service.Meta{P: p, At: s.Clock.NowIso()}, p.ID, in.Kind, in.Note); err != nil {
			s.writeError(w, r, err)
			return
		}
	}
	list, err := crm.PrivacyRequests(r.Context(), s.DB.Pool, crm.PrivacyRequestFilter{TenantID: tenant.ID, CustomerID: p.ID})
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, privacyRequestsResponse{Requests: list})
}

func (s *Server) shopExport(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in first.")
		return
	}
	var ready bool
	if err := s.DB.Pool.QueryRow(r.Context(), `select exists (select 1 from privacy_requests
		where customer_id = $1 and kind = 'access' and status = 'completed')`, p.ID).Scan(&ready); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !ready {
		writeProblem(w, http.StatusConflict, "REFUSED", "Ask for a copy of your data first. The store prepares it within 3x24 hours.")
		return
	}
	s.writeExport(w, r, service.Meta{P: p, At: s.Clock.NowIso()}, p.ID)
}

// unsubscribe shows a page with one button on GET, so a mail scanner that opens links withdraws
// nothing, and withdraws consent on POST. Mail apps that offer one-click unsubscribe POST to the
// same address.
func (s *Server) unsubscribe(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		token = r.PostFormValue("token")
	}
	customerID, ok := s.Signer.Open(unsubscribePurpose, token)
	w.Header().Set("Cache-Control", "no-store")
	// The page speaks the store's language; a link that opens no customer gets Bahasa Indonesia.
	lang := "id"
	if ok {
		if c, err := store.Get[domain.Customer](r.Context(), s.DB.Pool, "customers", customerID); err == nil {
			if t, err := store.Get[domain.Tenant](r.Context(), s.DB.Pool, "tenants", c.TenantID); err == nil {
				lang = rules.StoreLanguage(t)
			}
		}
	}
	if !ok {
		unsubscribePage(w, http.StatusBadRequest, lang, "unsubscribe.bad", "")
		return
	}
	if r.Method == http.MethodGet {
		unsubscribePage(w, http.StatusOK, lang, "unsubscribe.ask", token)
		return
	}
	if err := s.svc.Unsubscribe(r.Context(), s.Clock.NowIso(), customerID); err != nil {
		if _, missing := err.(service.NotFound); !missing {
			s.writeError(w, r, err)
			return
		}
	}
	unsubscribePage(w, http.StatusOK, lang, "unsubscribe.done", "")
}

func unsubscribePage(w http.ResponseWriter, status int, lang, messageKey, token string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	title := html.EscapeString(notifications.Say(lang, "unsubscribe"))
	form := ""
	if token != "" {
		form = `<form method="post"><input type="hidden" name="token" value="` + html.EscapeString(token) + `">` +
			`<button type="submit" style="padding:12px 24px;border:0;border-radius:999px;background:#101112;color:#fff;font:inherit;font-weight:bold;cursor:pointer">` + title + `</button></form>`
	}
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title></head>`+
		`<body style="margin:0;padding:48px 16px;background:#f1f0f1;font-family:Helvetica,Arial,sans-serif;color:#101112">`+
		`<main style="max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px"><h1 style="margin:0 0 12px;font-size:20px">%s</h1>`+
		`<p style="margin:0 0 16px;line-height:22px">%s</p>%s</main></body></html>`, lang, title, title, html.EscapeString(notifications.Say(lang, messageKey)), form)
}
