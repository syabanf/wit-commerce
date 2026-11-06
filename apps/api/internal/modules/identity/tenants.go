package identity

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// CreateTenant is tenants/create.
func (s *Identity) CreateTenant(ctx context.Context, m kernel.Meta, tenant domain.Tenant) (*kernel.Delta, error) {
	if tenant.ID == "" || tenant.Subdomain == "" {
		return nil, kernel.Invalid{Reason: "A tenant needs an id and a subdomain."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("tenants", tenant.ID, tenant) })
}

// CompleteOnboardingStep is tenants/completeStep.
func (s *Identity) CompleteOnboardingStep(ctx context.Context, m kernel.Meta, tenantID, step string) (*kernel.Delta, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		tenant, err := kernel.Lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		for _, done := range tenant.Onboarding {
			if done == step {
				return nil
			}
		}
		tenant.Onboarding = append(tenant.Onboarding, step)
		return t.Put("tenants", tenant.ID, tenant)
	})
}

// UpdateBrand is brand/update.
func (s *Identity) UpdateBrand(ctx context.Context, m kernel.Meta, tenantID string, brand domain.BrandConfig) (*kernel.Delta, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		tenant, err := kernel.Lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		tenant.Brand = brand
		return t.Put("tenants", tenant.ID, tenant)
	})
}

// ToggleBrandLock is brand/toggleLock.
func (s *Identity) ToggleBrandLock(ctx context.Context, m kernel.Meta, tenantID, key string) (*kernel.Delta, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		tenant, err := kernel.Lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		if tenant.Brand.Locks == nil {
			tenant.Brand.Locks = map[string]bool{}
		}
		tenant.Brand.Locks[key] = !tenant.Brand.Locks[key]
		return t.Put("tenants", tenant.ID, tenant)
	})
}
