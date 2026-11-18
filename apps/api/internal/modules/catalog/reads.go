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

// ProductsWithVariants lists the tenant's products that own any of the variants, in id order.
func ProductsWithVariants(t *kernel.Tx, tenantID string, variantIDs []string) ([]domain.Product, error) {
	if len(variantIDs) == 0 {
		return nil, nil
	}
	return store.List[domain.Product](t.Ctx, t.Tx, "products", `tenant_id = $1 and exists (
		select 1 from jsonb_array_elements(data->'variants') v where v->>'id' = any($2))`, tenantID, variantIDs)
}

// ModifierGroupsWithOptions lists the tenant's modifier groups that hold any of the options, in id
// order.
func ModifierGroupsWithOptions(t *kernel.Tx, tenantID string, optionIDs []string) ([]domain.ModifierGroup, error) {
	if len(optionIDs) == 0 {
		return nil, nil
	}
	return store.List[domain.ModifierGroup](t.Ctx, t.Tx, "modifiers", `tenant_id = $1 and exists (
		select 1 from jsonb_array_elements(data->'options') x where x->>'id' = any($2))`, tenantID, optionIDs)
}

// Products lists a tenant's products.
func (s *Catalog) Products(ctx context.Context, tenantID string) ([]domain.Product, error) {
	return store.ListTenant[domain.Product](ctx, s.DB.Pool, "products", tenantID)
}

// Categories lists a tenant's categories.
func (s *Catalog) Categories(ctx context.Context, tenantID string) ([]domain.Category, error) {
	return store.ListTenant[domain.Category](ctx, s.DB.Pool, "categories", tenantID)
}
