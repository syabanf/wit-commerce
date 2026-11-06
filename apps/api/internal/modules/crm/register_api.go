package crm

import (
	"hash/fnv"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

var avatarPalette = []string{"#4c5a78", "#6a5a8c", "#3f7a7b", "#7a5f4a", "#557a5c", "#8a5a6e", "#4f6f94", "#7a6b3f", "#5c5c7a", "#6b6f73"}

// CustomerIDsWithEmail returns the ids of the store's customers that carry this email.
func CustomerIDsWithEmail(t *kernel.Tx, tenantID, email string) ([]string, error) {
	rows, err := t.Query(t.Ctx, `select id from customers where tenant_id = $1 and email = $2`, tenantID, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CreateRegisteredCustomer writes the customer record for a shopper who signs up on the
// storefront, with the store's next customer code and an avatar color picked from the email.
// The caller holds the store's registration lock.
func CreateRegisteredCustomer(t *kernel.Tx, tenant domain.Tenant, name, email, phone, at string) (domain.Customer, error) {
	rows, err := t.Query(t.Ctx, `select code from customers where tenant_id = $1`, tenant.ID)
	if err != nil {
		return domain.Customer{}, err
	}
	var codes []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			rows.Close()
			return domain.Customer{}, err
		}
		codes = append(codes, code)
	}
	rows.Close()
	pick := fnv.New32a()
	_, _ = pick.Write([]byte(email))
	c := domain.Customer{
		ID: ids.New("cus"), TenantID: tenant.ID, Code: ids.NextCode(codes, tenant.Code+"-C", 5),
		Name: name, Email: email, Phone: phone, Source: "web", Stage: "registered", Tier: "member",
		Tags: []string{}, Interests: []string{}, CreatedAt: domain.IsoDate(at),
		Color: avatarPalette[int(pick.Sum32())%len(avatarPalette)],
	}
	if err := t.Put("customers", c.ID, c); err != nil {
		return c, err
	}
	t.Created[c.ID] = true
	t.Emit("customer.created", c)
	return c, nil
}
