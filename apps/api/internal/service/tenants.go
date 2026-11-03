package service

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// CreateTenant is tenants/create.
func (s *Service) CreateTenant(ctx context.Context, m Meta, tenant domain.Tenant) (*Delta, error) {
	if tenant.ID == "" || tenant.Subdomain == "" {
		return nil, Invalid{Reason: "A tenant needs an id and a subdomain."}
	}
	return s.run(ctx, func(t *tx) error { return t.put("tenants", tenant.ID, tenant) })
}

// CompleteOnboardingStep is tenants/completeStep.
func (s *Service) CompleteOnboardingStep(ctx context.Context, m Meta, tenantID, step string) (*Delta, error) {
	if err := access(m, tenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error {
		tenant, err := lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		for _, done := range tenant.Onboarding {
			if done == step {
				return nil
			}
		}
		tenant.Onboarding = append(tenant.Onboarding, step)
		return t.put("tenants", tenant.ID, tenant)
	})
}

// UpdateBrand is brand/update.
func (s *Service) UpdateBrand(ctx context.Context, m Meta, tenantID string, brand domain.BrandConfig) (*Delta, error) {
	if err := access(m, tenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error {
		tenant, err := lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		tenant.Brand = brand
		return t.put("tenants", tenant.ID, tenant)
	})
}

// ToggleBrandLock is brand/toggleLock.
func (s *Service) ToggleBrandLock(ctx context.Context, m Meta, tenantID, key string) (*Delta, error) {
	if err := access(m, tenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error {
		tenant, err := lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		if tenant.Brand.Locks == nil {
			tenant.Brand.Locks = map[string]bool{}
		}
		tenant.Brand.Locks[key] = !tenant.Brand.Locks[key]
		return t.put("tenants", tenant.ID, tenant)
	})
}
