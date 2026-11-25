package crm

import (
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// RecordOrderPlaced files a storefront order with its customer. A customer created at checkout
// is saved; a paid order credits its points and logs the purchase. The timeline also gets the
// checkout and, for a new customer, the registration.
func RecordOrderPlaced(t *kernel.Tx, o domain.Order, customer *domain.Customer, at, by string) error {
	paid := o.PaymentStatus == "paid"
	isNew := false
	if customer != nil {
		if _, err := store.Get[domain.Customer](t.Ctx, t.Tx, "customers", customer.ID); err != nil {
			isNew = true
		}
	}
	var events []domain.CustomerEvent
	if paid {
		events = append(events, kernel.CustomerEvent(o, "purchase", "Order "+o.Code, at, by))
	}
	events = append(events, kernel.CustomerEvent(o, "checkout_started", "Checked out on the storefront", at, by))
	if isNew {
		events = append(events, kernel.CustomerEvent(o, "registered", "Created an account at checkout", at, by))
		c := *customer
		if err := freeCustomerCode(t, &c); err != nil {
			return err
		}
		if paid {
			c.Points += o.PointsEarned
		}
		if err := t.Put("customers", c.ID, c); err != nil {
			return err
		}
		t.Created[c.ID] = true
		t.Emit("customer.created", c)
	} else if paid {
		if err := creditOrderPoints(t, o); err != nil {
			return err
		}
	}
	for _, e := range events {
		if err := t.Put("customerEvents", e.ID, e); err != nil {
			return err
		}
	}
	return nil
}

// RecordOrderPaid logs the purchase on the customer's timeline and credits the points it earned.
func RecordOrderPaid(t *kernel.Tx, o domain.Order, at, by string) error {
	e := kernel.CustomerEvent(o, "purchase", "Order "+o.Code, at, by)
	if err := t.Put("customerEvents", e.ID, e); err != nil {
		return err
	}
	if o.PointsEarned > 0 {
		return creditOrderPoints(t, o)
	}
	return nil
}

// creditOrderPoints adds the order's points to its customer, if the customer still exists.
func creditOrderPoints(t *kernel.Tx, o domain.Order) error {
	c, err := store.Lock[domain.Customer](t.Ctx, t.Tx, "customers", o.CustomerID)
	if err != nil {
		return nil
	}
	c.Points += o.PointsEarned
	return t.Put("customers", c.ID, c)
}

// freeCustomerCode gives a new customer the next free code when the one the browser picked is taken.
// The storefront never holds the brand's customer list, so a guest checkout always proposes the first
// code; a code taken by another checkout is handled the same way.
func freeCustomerCode(t *kernel.Tx, c *domain.Customer) error {
	var taken bool
	if err := t.QueryRow(t.Ctx, `select exists (select 1 from customers where tenant_id = $1 and code = $2)`,
		c.TenantID, c.Code).Scan(&taken); err != nil || !taken {
		return err
	}
	prefix := strings.TrimRight(c.Code, "0123456789")
	highest, err := store.HighestCode(t.Ctx, t.Tx, "customers", c.TenantID, prefix)
	c.Code = ids.NextCode([]string{highest}, prefix, len(c.Code)-len(prefix))
	return err
}
