package crm

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// MergeGuest folds a guest customer into an account: its history, leads and tickets move to c, its
// points add to c's, and the guest row goes. The caller saves c once every guest is merged.
func MergeGuest(ctx context.Context, tx pgx.Tx, c *domain.Customer, guest string) error {
	g, err := store.Get[domain.Customer](ctx, tx, "customers", guest)
	if err != nil {
		return err
	}
	c.Points += g.Points
	for _, table := range []string{"customer_events", "leads", "tickets"} {
		if _, err := tx.Exec(ctx, `update `+table+` set data = jsonb_set(data, '{customerId}', to_jsonb($1::text)) where data->>'customerId' = $2`, c.ID, guest); err != nil {
			return err
		}
	}
	return store.Delete(ctx, tx, "customers", guest)
}

// SaveMerged writes the account after its guests are merged.
func SaveMerged(ctx context.Context, tx pgx.Tx, c domain.Customer) error {
	return store.Put(ctx, tx, "customers", c.ID, c)
}
