package orders

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Invoice is the number an order's invoice carries, issued once (order_invoices).
type Invoice struct {
	Number   string
	IssuedAt time.Time
}

// InvoiceFor issues the order's invoice number the first time and answers the same one after. A
// cancelled order without a number gets none. The sequence runs per brand: an advisory lock on the
// brand serialises two first issues, and the unique indexes catch anything that slips past it.
func (s *Orders) InvoiceFor(ctx context.Context, m kernel.Meta, orderID string) (Invoice, domain.Order, error) {
	var inv Invoice
	var o domain.Order
	_, err := s.Run(ctx, func(t *kernel.Tx) error {
		var err error
		o, err = store.Get[domain.Order](t.Ctx, t.Tx, "orders", orderID)
		if err != nil {
			return err
		}
		if err := kernel.Access(m, o.TenantID); err != nil {
			return err
		}
		found, err := readInvoice(t, orderID, &inv)
		if err != nil || found {
			return err
		}
		if o.Status == "cancelled" {
			return kernel.Refuse("A cancelled order gets no invoice.")
		}
		tenant, err := identity.Tenant(t, o.TenantID)
		if err != nil {
			return err
		}
		if _, err := t.Exec(t.Ctx, `select pg_advisory_xact_lock(hashtext('order_invoices:' || $1))`, o.TenantID); err != nil {
			return err
		}
		// The lock may have waited on another issue for this very order.
		if found, err := readInvoice(t, orderID, &inv); err != nil || found {
			return err
		}
		var seq int
		if err := t.QueryRow(t.Ctx, `select coalesce(max(seq), 0) + 1 from order_invoices where tenant_id = $1`, o.TenantID).Scan(&seq); err != nil {
			return err
		}
		at, err := clock.Parse(m.At)
		if err != nil {
			return err
		}
		inv = Invoice{Number: InvoiceNumber(tenant.Code, at, seq), IssuedAt: at}
		_, err = t.Exec(t.Ctx, `insert into order_invoices (order_id, tenant_id, seq, number, issued_at) values ($1, $2, $3, $4, $5)`,
			orderID, o.TenantID, seq, inv.Number, at)
		return err
	})
	return inv, o, err
}

func readInvoice(t *kernel.Tx, orderID string, inv *Invoice) (bool, error) {
	err := t.QueryRow(t.Ctx, `select number, issued_at from order_invoices where order_id = $1`, orderID).Scan(&inv.Number, &inv.IssuedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// InvoiceNumber is INV/{brand code}/{YYYY}/{MM}/{seq}, the month in WIB and seq at least 4 digits.
func InvoiceNumber(tenantCode string, at time.Time, seq int) string {
	at = at.In(clock.WIB)
	return fmt.Sprintf("INV/%s/%04d/%02d/%04d", tenantCode, at.Year(), int(at.Month()), seq)
}
