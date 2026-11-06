package identity

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// Tenant reads a brand inside the caller's action, for modules that need its code or settings.
func Tenant(t *kernel.Tx, id string) (domain.Tenant, error) {
	return kernel.Get[domain.Tenant](t, "tenants", id, "tenant")
}
