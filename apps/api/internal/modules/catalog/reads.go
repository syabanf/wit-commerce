package catalog

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// The catalog as other modules read it. Functions that take a *kernel.Tx read inside the
// caller's action; the methods read outside any action.

// Product reads one product, without a lock.
func Product(t *kernel.Tx, id string) (domain.Product, error) {
	return store.Get[domain.Product](t.Ctx, t.Tx, "products", id)
}

// ModifierGroup reads one modifier group, without a lock.
func ModifierGroup(t *kernel.Tx, id string) (domain.ModifierGroup, error) {
	return store.Get[domain.ModifierGroup](t.Ctx, t.Tx, "modifiers", id)
}

// TenantProducts lists a tenant's products.
func TenantProducts(t *kernel.Tx, tenantID string) ([]domain.Product, error) {
	return kernel.TenantRows[domain.Product](t, "products", tenantID)
}

// TenantModifierGroups lists a tenant's modifier groups.
func TenantModifierGroups(t *kernel.Tx, tenantID string) ([]domain.ModifierGroup, error) {
	return kernel.TenantRows[domain.ModifierGroup](t, "modifiers", tenantID)
}

// Products lists a tenant's products.
func (s *Catalog) Products(ctx context.Context, tenantID string) ([]domain.Product, error) {
	return store.ListTenant[domain.Product](ctx, s.DB.Pool, "products", tenantID)
}

// Categories lists a tenant's categories.
func (s *Catalog) Categories(ctx context.Context, tenantID string) ([]domain.Category, error) {
	return store.ListTenant[domain.Category](ctx, s.DB.Pool, "categories", tenantID)
}
