package identity

import (
	"cmp"
	"context"
	"strconv"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// CreateTenant is tenants/create.
func (s *Identity) CreateTenant(ctx context.Context, m kernel.Meta, tenant domain.Tenant) (*kernel.Delta, error) {
	if tenant.ID == "" || tenant.Subdomain == "" {
		return nil, kernel.Invalid{Reason: "A tenant needs an id and a subdomain."}
	}
	if err := ValidSubdomain(tenant.Subdomain); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return AddTenant(t, tenant) })
}

// AddTenant writes a new tenant. A save would replace a row with the same id, since tenants carry no
// tenantId for the store to guard, so an existing id or subdomain is refused here.
func AddTenant(t *kernel.Tx, tenant domain.Tenant) error {
	exists, err := TenantExists(t, tenant.ID)
	if err != nil {
		return err
	}
	if exists {
		return ErrTenantExists
	}
	taken, err := SubdomainTaken(t, tenant.Subdomain)
	if err != nil {
		return err
	}
	if taken {
		return ErrSubdomainTaken
	}
	return t.Put("tenants", tenant.ID, tenant)
}

// FreeTenantCode is an uppercase code from the name that no tenant uses yet: KOPISENJA, then KOPISENJA2.
func FreeTenantCode(t *kernel.Tx, name string) (string, error) {
	base := strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, strings.ToUpper(name))
	base = cmp.Or(base[:min(len(base), 10)], "TENANT")
	rows, err := t.Query(t.Ctx, `select data->>'code' from tenants where data->>'code' like $1`, base+"%")
	if err != nil {
		return "", err
	}
	defer rows.Close()
	taken := map[string]bool{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return "", err
		}
		taken[code] = true
	}
	code := base
	for n := 2; taken[code]; n++ {
		code = base + strconv.Itoa(n)
	}
	return code, rows.Err()
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
