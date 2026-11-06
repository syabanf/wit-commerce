// Package marketing owns campaigns, automations and promotions. Other modules read them through this package's exported functions, and
// only this package writes them.
package marketing

import "github.com/syabanf/wit-commerce/apps/api/internal/kernel"

// Marketing runs the marketing actions.
type Marketing struct {
	*kernel.Runtime
}
