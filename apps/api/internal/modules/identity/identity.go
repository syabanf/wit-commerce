// Package identity owns tenants, users and API credentials. Other modules read them through this package's exported functions, and
// only this package writes them.
package identity

import "github.com/syabanf/wit-commerce/apps/api/internal/kernel"

// Identity runs the identity actions.
type Identity struct {
	*kernel.Runtime
}
