// Package service holds the business rules: every reducer action of packages/fixtures as one
// transactional method that reads what it needs, applies the same checks, writes the rows it changed
// and reports them as a Delta.
package service

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/catalog"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/integrations"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/marketing"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/storefront"
)

// Service runs every module's actions. It embeds the modules, so the HTTP layer calls an action
// by its name without knowing which module owns it.
type Service struct {
	*kernel.Runtime
	*identity.Identity
	*catalog.Catalog
	*inventory.Inventory
	*crm.CRM
	*marketing.Marketing
	*storefront.Storefront
	*integrations.Integrations
	*orders.Orders
}

// New builds the service and its modules on one runtime.
func New(rt kernel.Runtime) *Service {
	r := &rt
	inv := &inventory.Inventory{Runtime: r}
	mkt := &marketing.Marketing{Runtime: r}
	return &Service{
		Runtime:      r,
		Identity:     &identity.Identity{Runtime: r},
		Catalog:      &catalog.Catalog{Runtime: r, ModifierStock: inv},
		Inventory:    inv,
		CRM:          &crm.CRM{Runtime: r, SegmentUsers: mkt},
		Marketing:    mkt,
		Storefront:   &storefront.Storefront{Runtime: r},
		Integrations: &integrations.Integrations{Runtime: r},
		Orders:       &orders.Orders{Runtime: r},
	}
}

// The kernel's types under the names the HTTP layer and the tests use.
type (
	Meta      = kernel.Meta
	Delta     = kernel.Delta
	Refusal   = kernel.Refusal
	NotFound  = kernel.NotFound
	Invalid   = kernel.Invalid
	Forbidden = kernel.Forbidden
	tx        = kernel.Tx
)
