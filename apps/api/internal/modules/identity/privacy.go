package identity

import "github.com/syabanf/wit-commerce/apps/api/internal/kernel"

// RevokeCustomer ends a shopper's account after an erasure: the password stops matching, the email
// counts as unconfirmed, and every token issued up to the next second stops working. A guest gets a
// row too, since a guest token without one would still pass.
func RevokeCustomer(t *kernel.Tx, customerID string) error {
	_, err := t.Exec(t.Ctx, `insert into customer_credentials (customer_id, password_hash, tokens_valid_from)
		values ($1, '', date_trunc('second', now()) + interval '1 second')
		on conflict (customer_id) do update set password_hash = '', email_verified_at = null,
		tokens_valid_from = excluded.tokens_valid_from, updated_at = now()`, customerID)
	return err
}
