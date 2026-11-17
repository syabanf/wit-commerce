package orders

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// CustomerOrders lists a customer's orders and returns, for an erasure or a data export. An erasure
// locks them, so a concurrent action cannot write back the details it blanks.
func CustomerOrders(ctx context.Context, q store.Querier, customerID string, lock bool) ([]domain.Order, []domain.OrderReturn, error) {
	where := "customer_id = $1"
	if lock {
		where += " for update"
	}
	orders, err := store.List[domain.Order](ctx, q, "orders", where, customerID)
	if err != nil {
		return nil, nil, err
	}
	returns, err := store.List[domain.OrderReturn](ctx, q, "returns", where, customerID)
	return orders, returns, err
}

// EraseCustomer blanks the personal data copied onto a customer's orders and returns: the delivery
// city and the shopper's note. Amounts, items, dates and payment records stay, since PP 80/2019
// Pasal 25 keeps transaction data for 10 years.
func EraseCustomer(t *kernel.Tx, orders []domain.Order, returns []domain.OrderReturn) error {
	for _, o := range orders {
		if o.City != "" {
			o.City = ""
			if err := t.Put("orders", o.ID, o); err != nil {
				return err
			}
		}
	}
	for _, r := range returns {
		if r.Note != "" {
			r.Note = ""
			if err := t.Put("returns", r.ID, r); err != nil {
				return err
			}
		}
	}
	return nil
}
