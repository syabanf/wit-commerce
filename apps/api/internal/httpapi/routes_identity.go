package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// staffRoutes registers staff management.
func (s *Server) staffRoutes(rt *router) {
	rt.add("GET", "/users/events", "", "user.manage", "Who changed which staff account in a brand, newest first", s.staffEvents)
	rt.add("POST", "/users", "", "user.manage", "Add a staff member and email them an invitation", s.createStaff)
	rt.add("PUT", "/users/{id}", "", "user.manage", "Change a staff member's name, title, role or brands", s.updateStaff)
	rt.add("POST", "/users/{id}/status", "", "user.manage", "Disable or enable a staff member", s.setStaffStatus)
	rt.add("POST", "/users/{id}/reset-password", "", "user.manage", "End the person's password and sessions, and email a link to choose a new one", s.resetStaffPassword)
	rt.add("POST", "/users/{id}/invite", "", "user.manage", "Send a pending invitation again", s.inviteStaff)
}

// tenantRoutes registers tenants, the brand guideline and the buying-agent policy.
func (s *Server) tenantRoutes(rt *router) {
	rt.add("POST", "/tenants", "tenants/create", "tenant.manage", "Create a tenant", body(s, s.svc.CreateTenant))
	rt.add("POST", "/tenants/{id}/onboarding/{step}", "tenants/completeStep", "brand.manage", "Mark an onboarding step done", func(w http.ResponseWriter, r *http.Request) {
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.CompleteOnboardingStep(r.Context(), m, r.PathValue("id"), r.PathValue("step"))
		})
	})
	rt.add("PUT", "/tenants/{id}/brand", "brand/update", "brand.manage", "Replace the brand guideline", func(w http.ResponseWriter, r *http.Request) {
		var brand domain.BrandConfig
		if err := decode(r, &brand); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.UpdateBrand(r.Context(), m, r.PathValue("id"), brand)
		})
	})
	rt.add("POST", "/tenants/{id}/brand/locks/{key}/toggle", "brand/toggleLock", "brand.manage", "Lock or unlock a brand setting", func(w http.ResponseWriter, r *http.Request) {
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.ToggleBrandLock(r.Context(), m, r.PathValue("id"), r.PathValue("key"))
		})
	})
	rt.add("PUT", "/tenants/{id}/agent-policy", "agentPolicy/save", "store.manage", "Replace the buying-agent policy", func(w http.ResponseWriter, r *http.Request) {
		var p domain.AgentPolicy
		if err := decode(r, &p); err != nil {
			s.writeError(w, r, err)
			return
		}
		p.TenantID = r.PathValue("id")
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return s.svc.SaveAgentPolicy(r.Context(), m, p) })
	})
}
