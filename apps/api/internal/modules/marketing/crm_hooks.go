package marketing

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// SegmentCampaigns returns every campaign of the store, in store order. Crm checks them before it
// removes a segment.
func (s *Marketing) SegmentCampaigns(t *kernel.Tx, tenantID string) ([]domain.Campaign, error) {
	return kernel.TenantRows[domain.Campaign](t, "campaigns", tenantID)
}
