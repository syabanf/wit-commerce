package catalog

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// What the product CSV import and export in the service need, inside the caller's action.

// TenantProducts lists a tenant's products, in id order.
func TenantProducts(t *kernel.Tx, tenantID string) ([]domain.Product, error) {
	return kernel.TenantRows[domain.Product](t, "products", tenantID)
}

// TenantCategories lists a tenant's categories, in id order.
func TenantCategories(t *kernel.Tx, tenantID string) ([]domain.Category, error) {
	return kernel.TenantRows[domain.Category](t, "categories", tenantID)
}

// LockProduct reads a product for update.
func LockProduct(t *kernel.Tx, id string) (domain.Product, error) {
	return kernel.Lock[domain.Product](t, "products", id, "product")
}

// PutProduct is products/save inside the caller's action.
func PutProduct(t *kernel.Tx, m kernel.Meta, p domain.Product) error {
	if err := kernel.Access(m, p.TenantID); err != nil {
		return err
	}
	return t.Put("products", p.ID, p)
}
