// Package storefront owns sellers, their pages, page templates, traffic and search terms. Other modules read them through this package's exported functions, and
// only this package writes them.
package storefront

import "github.com/syabanf/wit-commerce/apps/api/internal/kernel"

// Storefront runs the storefront actions.
type Storefront struct {
	*kernel.Runtime
}
