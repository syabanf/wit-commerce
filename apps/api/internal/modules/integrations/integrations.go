// Package integrations owns connectors, their logs and webhooks. Other modules read them through this package's exported functions, and
// only this package writes them.
package integrations

import "github.com/syabanf/wit-commerce/apps/api/internal/kernel"

// Integrations runs the integrations actions.
type Integrations struct {
	*kernel.Runtime
}
