package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// marketingRoutes registers campaigns, automations and promotions.
func (s *Server) marketingRoutes(rt *router) {
	rt.add("PUT", "/campaigns/{id}", "campaigns/save", "campaign.manage", "Create or replace a campaign", upsert(s, func(m service.Meta, r *http.Request, c domain.Campaign) (*service.Delta, error) {
		return s.svc.SaveCampaign(r.Context(), m, c)
	}))
	rt.add("POST", "/campaigns/{id}/launch", "campaigns/launch", "campaign.manage", "Launch a campaign", idOnly(s, s.svc.LaunchCampaign))
	rt.add("POST", "/campaigns/{id}/pause", "campaigns/pause", "campaign.manage", "Pause a running campaign", idOnly(s, s.svc.PauseCampaign))
	rt.add("PUT", "/automations/{id}", "automations/save", "automation.manage", "Create or replace an automation", upsert(s, func(m service.Meta, r *http.Request, a domain.Automation) (*service.Delta, error) {
		return s.svc.SaveAutomation(r.Context(), m, a)
	}))
	rt.add("POST", "/automations/{id}/status", "automations/setStatus", "automation.manage", "Draft, activate or pause an automation", status(s, s.svc.SetAutomationStatus))
	rt.add("PUT", "/promotions/{id}", "promotions/save", "promotion.manage", "Create or replace a promotion", upsert(s, func(m service.Meta, r *http.Request, p domain.Promotion) (*service.Delta, error) {
		return s.svc.SavePromotion(r.Context(), m, p)
	}))
	rt.add("POST", "/promotions/{id}/status", "promotions/setStatus", "promotion.manage", "Change a promotion's status", status(s, s.svc.SetPromotionStatus))
}
