package httpapi

import (
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

func TestStoreLiveRequiresPublishedHomepage(t *testing.T) {
	tenant := domain.Tenant{ID: "tenant-1", DomainVerified: true, Onboarding: []string{"publish"}}
	pages := []domain.Page{{TenantID: tenant.ID, Kind: "home", Status: "draft"}}
	if storeLive(tenant, pages) {
		t.Fatal("a draft homepage exposed the store")
	}
	pages[0].Status = "published"
	if !storeLive(tenant, pages) {
		t.Fatal("a published homepage did not expose the store")
	}
	pages[0].Kind = "campaign"
	if storeLive(tenant, pages) {
		t.Fatal("a campaign page exposed the store")
	}
}
