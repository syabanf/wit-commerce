// Package inventory owns warehouses, stock levels and stock moves. Other modules read them through this package's exported functions, and
// only this package writes them.
package inventory

import "github.com/syabanf/wit-commerce/apps/api/internal/kernel"

// Inventory runs the inventory actions.
type Inventory struct {
	*kernel.Runtime
}
