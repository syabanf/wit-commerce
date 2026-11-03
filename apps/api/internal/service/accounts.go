package service

import (
	"context"
	"hash/fnv"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
)

var avatarPalette = []string{"#4c5a78", "#6a5a8c", "#3f7a7b", "#7a5f4a", "#557a5c", "#8a5a6e", "#4f6f94", "#7a6b3f", "#5c5c7a", "#6b6f73"}

// RegisterCustomer creates a shopper with a password. An email with a password already belongs to
// someone. A guest order under the same email stays a separate record: nothing here proves the
// person registering owns that inbox, so its orders must not come with the account.
func (s *Service) RegisterCustomer(ctx context.Context, m Meta, tenant domain.Tenant, name, email, phone, passwordHash string) (*Delta, domain.Customer, error) {
	var c domain.Customer
	if err := access(m, tenant.ID); err != nil {
		return nil, c, err
	}
	d, err := s.run(ctx, func(t *tx) error {
		// One registration at a time per store, so two cannot claim one email or one code.
		if _, err := t.Exec(t.ctx, `select pg_advisory_xact_lock(hashtext($1))`, "register:"+tenant.ID); err != nil {
			return err
		}
		var taken bool
		if err := t.QueryRow(t.ctx, `select exists (select 1 from customers c join customer_credentials cc on cc.customer_id = c.id
			where c.tenant_id = $1 and c.email = $2)`, tenant.ID, email).Scan(&taken); err != nil {
			return err
		}
		if taken {
			return refuse("An account with this email already exists. Sign in instead.")
		}
		rows, err := t.Query(t.ctx, `select code from customers where tenant_id = $1`, tenant.ID)
		if err != nil {
			return err
		}
		var codes []string
		for rows.Next() {
			var code string
			if err := rows.Scan(&code); err != nil {
				rows.Close()
				return err
			}
			codes = append(codes, code)
		}
		rows.Close()
		pick := fnv.New32a()
		_, _ = pick.Write([]byte(email))
		c = domain.Customer{
			ID: ids.New("cus"), TenantID: tenant.ID, Code: ids.NextCode(codes, tenant.Code+"-C", 5),
			Name: name, Email: email, Phone: phone, Source: "web", Stage: "registered", Tier: "member",
			Tags: []string{}, Interests: []string{}, CreatedAt: domain.IsoDate(m.At),
			Color: avatarPalette[int(pick.Sum32())%len(avatarPalette)],
		}
		if err := t.put("customers", c.ID, c); err != nil {
			return err
		}
		t.created[c.ID] = true
		t.emit("customer.created", c)
		_, err = t.Exec(t.ctx, `insert into customer_credentials (customer_id, password_hash) values ($1, $2)`, c.ID, passwordHash)
		return err
	})
	return d, c, err
}
