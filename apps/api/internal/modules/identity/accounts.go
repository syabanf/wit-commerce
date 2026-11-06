package identity

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// RegisterCustomer creates a shopper with a password. An email with a password already belongs to
// someone. A guest order under the same email stays a separate record: nothing here proves the
// person registering owns that inbox, so its orders must not come with the account.
func (s *Identity) RegisterCustomer(ctx context.Context, m kernel.Meta, tenant domain.Tenant, name, email, phone, passwordHash string) (*kernel.Delta, domain.Customer, error) {
	var c domain.Customer
	if err := kernel.Access(m, tenant.ID); err != nil {
		return nil, c, err
	}
	d, err := s.Run(ctx, func(t *kernel.Tx) error {
		// One registration at a time per store, so two cannot claim one email or one code.
		if _, err := t.Exec(t.Ctx, `select pg_advisory_xact_lock(hashtext($1))`, "register:"+tenant.ID); err != nil {
			return err
		}
		same, err := crm.CustomerIDsWithEmail(t, tenant.ID, email)
		if err != nil {
			return err
		}
		var taken bool
		if err := t.QueryRow(t.Ctx, `select exists (select 1 from customer_credentials where customer_id = any($1))`, same).Scan(&taken); err != nil {
			return err
		}
		if taken {
			return kernel.Refuse("An account with this email already exists. Sign in instead.")
		}
		c, err = crm.CreateRegisteredCustomer(t, tenant, name, email, phone, m.At)
		if err != nil {
			return err
		}
		_, err = t.Exec(t.Ctx, `insert into customer_credentials (customer_id, password_hash) values ($1, $2)`, c.ID, passwordHash)
		return err
	})
	return d, c, err
}
