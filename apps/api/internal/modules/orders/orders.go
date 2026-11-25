// Package orders owns orders: placing, advancing, cancelling, refunding and noting them.
package orders

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// Orders runs the order actions.
type Orders struct {
	*kernel.Runtime
	// Payments says whether a provider collects an order's payment online. Nil means none does.
	Payments OnlinePayments
	// Prices loads what pricing a shopper's order reads. Nil refuses every shopper order.
	Prices PriceBooks
}

// PriceBooks loads the store data a shopper's order is priced from that this module may not read:
// promotions, categories and the agent policy. The facade answers it inside the order's transaction.
type PriceBooks interface {
	PriceBook(t *kernel.Tx, tenantID string) (rules.PriceBook, error)
}

// OnlinePayments is the question placing an order asks: does a provider collect this order's money
// online? The facade answers it from the catalog's payment types and the tenant's integrations,
// which this module may not import.
type OnlinePayments interface {
	CollectsOnline(ctx context.Context, tenantID, paymentTypeID string, total int) (bool, error)
}
