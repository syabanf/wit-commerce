package service

import (
	"context"
	"errors"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Complaint is a shopper's complaint from the storefront form.
type Complaint = crm.Complaint

// OpenTicket is tickets/open. The facade reads the tenant, whose code and complaint days shape the
// ticket, and checks that a named order is the shopper's own: tickets belong to crm, orders and
// tenants to other modules. It shadows crm's OpenTicket, so every caller passes these checks.
func (s *Service) OpenTicket(ctx context.Context, m Meta, c Complaint) (*Delta, error) {
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", c.TenantID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, NotFound{What: "store"}
	}
	if err != nil {
		return nil, err
	}
	if c.OrderID != nil {
		o, err := store.Get[domain.Order](ctx, s.DB.Pool, "orders", *c.OrderID)
		if err != nil && !errors.Is(err, store.ErrNotFound) {
			return nil, err
		}
		if err != nil || o.TenantID != tenant.ID || c.CustomerID == nil || o.CustomerID != *c.CustomerID {
			return nil, Invalid{Reason: "Pick one of your own orders, or leave the order out."}
		}
	}
	return s.CRM.OpenTicket(ctx, m, c, tenant.Code, rules.ComplaintDays(tenant))
}
