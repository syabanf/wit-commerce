// Package orders owns orders: placing, advancing, cancelling, refunding and noting them.
package orders

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// Orders runs the order actions.
type Orders struct {
	*kernel.Runtime
	// Payments says whether a provider collects an order's payment online. Nil means none does.
	Payments OnlinePayments
}

// OnlinePayments is the question placing an order asks: does a provider collect this order's money
// online? The facade answers it from the catalog's payment types and the tenant's integrations,
// which this module may not import.
type OnlinePayments interface {
	CollectsOnline(ctx context.Context, tenantID, paymentTypeID string, total int) (bool, error)
}
