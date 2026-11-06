// Package readmodel keeps the read side of CQRS: tables shaped for one screen each, derived from the
// documents the write side owns. Every function takes the caller's transaction, so a projection
// commits or rolls back with the change that caused it.
package readmodel

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Querier is what a projection needs: a pool or a transaction.
type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// refreshOrders rebuilds the order rows that match where from the orders and customers documents.
const refreshOrders = `insert into order_rows (id, tenant_id, code, customer_id, customer_name, customer_code, status,
	payment_status, channel, seller_id, created_at, total, item_count, agent, refunded_amount, search,
	payment_method, payment_type_id, subtotal, shipped_at, agent_info, campaign_id)
select o.id, o.data->>'tenantId', o.data->>'code', o.data->>'customerId', coalesce(c.data->>'name', ''),
	coalesce(c.data->>'code', ''), o.data->>'status', o.data->>'paymentStatus', o.data->>'channel', o.data->>'sellerId',
	(o.data->>'createdAt')::timestamptz, (o.data->>'total')::bigint,
	coalesce((select sum((l->>'qty')::int) from jsonb_array_elements(o.data->'lines') l), 0),
	coalesce(jsonb_typeof(o.data->'agent') = 'object', false), coalesce((o.data->>'refundedAmount')::bigint, 0),
	lower(concat_ws(' ', o.data->>'code', c.data->>'name', c.data->>'code', o.data->>'trackingNo', o.data->>'voucherCode', o.data->>'city')),
	coalesce(o.data->>'paymentMethod', ''), o.data->>'paymentTypeId', coalesce((o.data->>'subtotal')::bigint, 0),
	(select max((e->>'at')::timestamptz) from jsonb_array_elements(o.data->'events') e where e->>'status' = 'shipped'),
	case when jsonb_typeof(o.data->'agent') = 'object' then o.data->'agent' end, o.data->>'campaignId'
from orders o left join customers c on c.id = o.data->>'customerId'
where %s
on conflict (id) do update set tenant_id = excluded.tenant_id, code = excluded.code, customer_id = excluded.customer_id,
	customer_name = excluded.customer_name, customer_code = excluded.customer_code, status = excluded.status,
	payment_status = excluded.payment_status, channel = excluded.channel, seller_id = excluded.seller_id,
	created_at = excluded.created_at, total = excluded.total, item_count = excluded.item_count, agent = excluded.agent,
	refunded_amount = excluded.refunded_amount, search = excluded.search, payment_method = excluded.payment_method,
	payment_type_id = excluded.payment_type_id, subtotal = excluded.subtotal, shipped_at = excluded.shipped_at,
	agent_info = excluded.agent_info, campaign_id = excluded.campaign_id`

// RefreshOrders projects the given orders.
func RefreshOrders(ctx context.Context, q Querier, orderIDs []string) error {
	if len(orderIDs) == 0 {
		return nil
	}
	_, err := q.Exec(ctx, fmt.Sprintf(refreshOrders, "o.id = any($1)"), orderIDs)
	return err
}

// RefreshCustomers projects every order of the given customers, after a rename or a merge.
func RefreshCustomers(ctx context.Context, q Querier, customerIDs []string) error {
	if len(customerIDs) == 0 {
		return nil
	}
	_, err := q.Exec(ctx, fmt.Sprintf(refreshOrders, "o.customer_id = any($1)"), customerIDs)
	return err
}

// RemoveOrders drops the rows of deleted orders.
func RemoveOrders(ctx context.Context, q Querier, orderIDs []string) error {
	if len(orderIDs) == 0 {
		return nil
	}
	_, err := q.Exec(ctx, `delete from order_rows where id = any($1)`, orderIDs)
	return err
}

// Rebuild derives every row again. It is safe at any time, since the documents are the truth.
func Rebuild(ctx context.Context, q Querier) error {
	if _, err := q.Exec(ctx, `delete from order_rows`); err != nil {
		return err
	}
	if _, err := q.Exec(ctx, fmt.Sprintf(refreshOrders, "true")); err != nil {
		return err
	}
	if err := rebuildCustomerMetrics(ctx, q); err != nil {
		return err
	}
	return rebuildSales(ctx, q)
}

// EnsureBuilt rebuilds when a read model looks unbuilt next to its documents, as after a deploy
// that adds a table to a database that already holds orders.
func EnsureBuilt(ctx context.Context, q Querier) (bool, error) {
	var orders, rows, metrics, sales int
	if err := q.QueryRow(ctx, `select (select count(*) from orders), (select count(*) from order_rows),
		(select count(*) from customer_metrics), (select count(*) from sales_days)`).Scan(&orders, &rows, &metrics, &sales); err != nil {
		return false, err
	}
	var unfilled bool
	if err := q.QueryRow(ctx, `select exists (select 1 from order_rows where payment_method = '')`).Scan(&unfilled); err != nil {
		return false, err
	}
	if orders == rows && !unfilled && (orders == 0 || (metrics > 0 && sales > 0)) {
		return false, nil
	}
	return true, Rebuild(ctx, q)
}

// Apply projects what one write changed: the orders it saved or removed, the orders of the
// customers it saved or removed, whose names the rows carry, and the metrics of every customer whose
// orders or history moved. Metric rows join the delta, so the console receives them like any change.
func Apply(ctx context.Context, q Querier, upserts map[string][]any, removes map[string][]string) error {
	orders, err := fieldOf(upserts["orders"], "id")
	if err != nil {
		return err
	}
	customers, err := fieldOf(upserts["customers"], "id")
	if err != nil {
		return err
	}
	customers = append(customers, removes["customers"]...)
	if err := RefreshOrders(ctx, q, orders); err != nil {
		return err
	}
	if err := RefreshCustomers(ctx, q, customers); err != nil {
		return err
	}
	if err := RemoveOrders(ctx, q, removes["orders"]); err != nil {
		return err
	}
	buyers, err := fieldOf(upserts["orders"], "customerId")
	if err != nil {
		return err
	}
	active, err := fieldOf(upserts["customerEvents"], "customerId")
	if err != nil {
		return err
	}
	touched := unique(append(append(buyers, active...), removes["customers"]...))
	gone, err := RefreshCustomerMetrics(ctx, q, touched)
	if err != nil {
		return err
	}
	rows, err := CustomerMetricsRows(ctx, q, "customer_id = any($1)", touched)
	if err != nil {
		return err
	}
	for _, row := range rows {
		upserts[CustomerMetricsCollection] = append(upserts[CustomerMetricsCollection], row)
	}
	if len(gone) > 0 {
		removes[CustomerMetricsCollection] = append(removes[CustomerMetricsCollection], gone...)
	}
	// Sales facts: the WIB days of the saved orders, derived again.
	if len(orders) == 0 {
		return nil
	}
	tenants, days, err := SalesDaysOf(ctx, q, "o.id = any($1)", orders)
	if err != nil {
		return err
	}
	facts, factsGone, err := RefreshSalesDays(ctx, q, tenants, days)
	if err != nil {
		return err
	}
	for collection, rows := range facts {
		for _, row := range rows {
			upserts[collection] = append(upserts[collection], row)
		}
	}
	for collection, ids := range factsGone {
		removes[collection] = append(removes[collection], ids...)
	}
	return nil
}

func unique(ids []string) []string {
	seen := map[string]bool{}
	out := ids[:0:0]
	for _, id := range ids {
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// fieldOf reads one string field from each row, whatever type the row is.
func fieldOf(rows []any, field string) ([]string, error) {
	values := make([]string, 0, len(rows))
	for _, row := range rows {
		raw, err := json.Marshal(row)
		if err != nil {
			return nil, err
		}
		var keys map[string]json.RawMessage
		if err := json.Unmarshal(raw, &keys); err != nil {
			return nil, err
		}
		var value string
		if err := json.Unmarshal(keys[field], &value); err == nil {
			values = append(values, value)
		}
	}
	return values, nil
}
