package orders

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// ReassignCustomer moves every order of one customer to another, when a shopper's account takes
// over the orders they placed as a guest. The caller refreshes the read models.
func ReassignCustomer(ctx context.Context, tx pgx.Tx, from, to string) error {
	_, err := tx.Exec(ctx, `update orders set data = jsonb_set(data, '{customerId}', to_jsonb($1::text)) where data->>'customerId' = $2`, to, from)
	return err
}
