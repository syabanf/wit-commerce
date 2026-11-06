// Package catalog owns products, categories, attributes, modifiers, collections, payment types and agent policies. Other modules read them through this package's exported functions, and
// only this package writes them.
package catalog

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// Catalog runs the catalog actions.
type Catalog struct {
	*kernel.Runtime
	// ModifierStock clears the stock levels of modifier options that a save or a removal drops.
	ModifierStock ModifierStock
}

// ModifierStock is the part of inventory that catalog calls. Inventory sits above catalog, so
// catalog declares the calls it needs and service.New supplies the implementation.
type ModifierStock interface {
	// GroupModifierStock returns the stock levels of one modifier group, in store order.
	GroupModifierStock(t *kernel.Tx, tenantID, groupID string) ([]domain.ModifierStockLevel, error)
	// DropModifierStock deletes these stock levels, in this order.
	DropModifierStock(t *kernel.Tx, levelIDs []string) error
}
