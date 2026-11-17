package httpapi

import (
	"errors"
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/antispam"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/billing"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

type (
	// publicConfig is what the sign-up pages need before anyone signs in.
	publicConfig struct {
		// TurnstileSiteKey is empty while the CAPTCHA is off.
		TurnstileSiteKey string `json:"turnstileSiteKey"`
	}
	planRequestInput struct {
		Plan string `json:"plan"`
		Note string `json:"note"`
	}
	planDecisionInput struct {
		Approve bool   `json:"approve"`
		Note    string `json:"note"`
	}
	tenantPlanInput struct {
		Plan string `json:"plan"`
	}
	// tenantPlanRow is one brand on the platform's Plans page.
	tenantPlanRow struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Plan string `json:"plan"`
	}
	// platformPlans is what the platform's Plans page shows.
	platformPlans struct {
		Plans    []billing.Plan        `json:"plans"`
		Defaults []billing.Plan        `json:"defaults"`
		Tenants  []tenantPlanRow       `json:"tenants"`
		Requests []billing.PlanRequest `json:"requests"`
		Invoices []billing.Invoice     `json:"invoices"`
	}
)

// planRoutes registers the plan catalog, plan requests, invoices, the Turnstile keys, the public
// config and warehouse creation.
func (s *Server) planRoutes(rt *router) {
	rt.add("GET", "/config", "", "", "What the sign-up pages need before sign-in: the Turnstile site key, empty while it is off", s.publicConfig)
	rt.add("GET", "/settings/captcha", "", "", "The Turnstile keys for sign-up and shopper registration (platform admin); never the secret", s.platformAdmin(s.getCaptcha))
	rt.add("PUT", "/settings/captcha", "", "", "Save the Turnstile keys (platform admin); an empty secret keeps the saved one, both empty turns the check off", s.platformAdmin(s.saveCaptcha))
	rt.add("GET", "/settings/plans", "", "", "The plan catalog, every brand's plan, plan requests and invoices (platform admin)", s.platformAdmin(s.getPlans))
	rt.add("PUT", "/settings/plans/{plan}", "", "", "Set a plan's monthly price and limits (platform admin)", s.platformAdmin(s.savePlan))
	rt.add("POST", "/plan-requests/{id}/decide", "", "", "Approve or decline a plan request (platform admin); approval changes the tenant's plan", s.platformAdmin(s.decidePlanRequest))
	rt.add("POST", "/invoices/{id}/status", "", "", "Mark an invoice due, paid or void (platform admin)", s.platformAdmin(s.setInvoiceStatus))
	rt.add("PUT", "/tenants/{id}/plan", "", "", "Move a tenant to a plan without a request (platform admin)", s.platformAdmin(s.setTenantPlan))
	rt.add("GET", "/tenants/{id}/plan", "", "", "A brand's plan, usage against each limit, plan requests and invoices (brand admin)", s.brandAdmin(s.getTenantPlan))
	rt.add("POST", "/tenants/{id}/plan-requests", "", "", "Ask the platform for another plan (brand admin); a newer request replaces the waiting one", s.brandAdmin(s.requestPlan))
	rt.add("POST", "/warehouses", "", "inventory.manage", "Add a warehouse to a brand", body(s, s.svc.CreateWarehouse))
}

// brandAdmin wraps a handler for the people who run a brand: its tenant admins and platform admins.
// The handler still checks that the brand is one of theirs. API keys never reach it.
func (s *Server) brandAdmin(h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		return p.Kind == auth.KindUser && (p.Role == "tenant_admin" || p.Role == "platform_admin"), "Only a brand admin sees the plan and its invoices."
	}, h)
}

func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, publicConfig{TurnstileSiteKey: s.antispam.SiteKey(r.Context())})
}

func (s *Server) getCaptcha(w http.ResponseWriter, r *http.Request) {
	out, err := s.antispam.GetCaptcha(r.Context())
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) saveCaptcha(w http.ResponseWriter, r *http.Request) {
	var in antispam.CaptchaInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	out, err := s.antispam.SaveCaptcha(r.Context(), s.meta(r), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// captchaPassed checks a Turnstile token when keys are saved, and answers the refusal itself. With
// no keys it passes every request, token or not.
func (s *Server) captchaPassed(w http.ResponseWriter, r *http.Request, token string) bool {
	err := s.antispam.Verify(r.Context(), token, s.clientIP(r))
	switch {
	case err == nil:
		return true
	case errors.Is(err, antispam.ErrCaptchaFailed):
		writeProblem(w, http.StatusUnprocessableEntity, "CAPTCHA_FAILED", "Complete the check that shows you are a person, then try again.")
	default:
		s.Log.Warn("turnstile not verified", "err", err, "requestId", requestIDOf(r.Context()))
		writeProblem(w, http.StatusServiceUnavailable, "CAPTCHA_UNAVAILABLE", "We could not run the check that shows you are a person. Try again in a minute.")
	}
	return false
}

func (s *Server) getPlans(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := platformPlans{Tenants: []tenantPlanRow{}}
	for _, id := range billing.IDs {
		out.Defaults = append(out.Defaults, billing.Defaults[id])
	}
	tenants, err := store.List[domain.Tenant](ctx, s.DB.Pool, "tenants", "")
	if err == nil {
		for _, t := range tenants {
			out.Tenants = append(out.Tenants, tenantPlanRow{ID: t.ID, Name: t.Name, Plan: t.Plan})
		}
		out.Plans, err = billing.Catalog(ctx, s.DB.Pool)
	}
	if err == nil {
		out.Requests, err = billing.Requests(ctx, s.DB.Pool, "")
	}
	if err == nil {
		out.Invoices, err = billing.Invoices(ctx, s.DB.Pool, "")
	}
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) savePlan(w http.ResponseWriter, r *http.Request) {
	var in billing.PlanInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if err := s.svc.SavePlan(r.Context(), s.meta(r), r.PathValue("plan"), in); err != nil {
		s.writeError(w, r, err)
		return
	}
	s.getPlans(w, r)
}

// decidePlanRequest answers a request and, on approval, broadcasts the tenant's new plan.
func (s *Server) decidePlanRequest(w http.ResponseWriter, r *http.Request) {
	var in planDecisionInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	d, decided, err := s.svc.DecidePlanRequest(r.Context(), s.meta(r), r.PathValue("id"), in.Approve, in.Note)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	s.publish(d)
	writeJSON(w, http.StatusOK, decided)
}

func (s *Server) setInvoiceStatus(w http.ResponseWriter, r *http.Request) {
	var in statusInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	out, err := s.svc.SetInvoiceStatus(r.Context(), s.meta(r), r.PathValue("id"), in.Status)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) setTenantPlan(w http.ResponseWriter, r *http.Request) {
	var in tenantPlanInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	s.act(w, r, func(service.Meta) (*service.Delta, error) {
		return s.svc.SetTenantPlan(r.Context(), r.PathValue("id"), in.Plan)
	})
}

func (s *Server) getTenantPlan(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("id")
	used, err := s.media.Used(r.Context(), tenantID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out, err := s.svc.Overview(r.Context(), s.meta(r), tenantID, used)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) requestPlan(w http.ResponseWriter, r *http.Request) {
	var in planRequestInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	out, err := s.svc.RequestPlan(r.Context(), s.meta(r), r.PathValue("id"), in.Plan, in.Note)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}
