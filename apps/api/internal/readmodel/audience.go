package readmodel

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// CustomerMetric is one customer_metrics row with the fields segment rules read.
type CustomerMetric struct {
	CustomerID          string
	Orders              int
	Spend               int64
	FirstAt             *time.Time
	LastAt              *time.Time
	LastAbandonedAt     *time.Time
	LastPurchaseEventAt *time.Time
}

// TenantCustomerMetrics reads a tenant's metrics rows, by customer id.
func TenantCustomerMetrics(ctx context.Context, q Querier, tenantID string) ([]CustomerMetric, error) {
	rows, err := q.Query(ctx, `select customer_id, orders, spend, first_at, last_at, last_abandoned_at, last_purchase_event_at
		from customer_metrics where tenant_id = $1 order by customer_id`, tenantID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (CustomerMetric, error) {
		var m CustomerMetric
		err := r.Scan(&m.CustomerID, &m.Orders, &m.Spend, &m.FirstAt, &m.LastAt, &m.LastAbandonedAt, &m.LastPurchaseEventAt)
		return m, err
	})
}
