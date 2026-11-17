package service

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/storefront"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SellerProfile is the body of sellers/updateProfile.
type SellerProfile = rules.SellerProfile

// UpdateSellerProfile is sellers/updateProfile. It lives in the facade because the brand's locks
// sit on the tenant, which identity owns, and the seller and their page belong to storefront.
func (s *Service) UpdateSellerProfile(ctx context.Context, m Meta, id string, in SellerProfile) (*Delta, error) {
	return s.Run(ctx, func(t *tx) error {
		seller, err := kernel.Lock[domain.Seller](t, "sellers", id, "seller")
		if err != nil {
			return err
		}
		tenant, err := kernel.Get[domain.Tenant](t, "tenants", seller.TenantID, "tenant")
		if err != nil {
			return err
		}
		return storefront.UpdateSellerProfile(t, m, seller, in, tenant.Brand.Locks)
	})
}
