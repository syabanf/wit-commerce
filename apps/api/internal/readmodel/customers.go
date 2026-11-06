package readmodel

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// CustomerMetricsCollection is the name the rows travel under in deltas and the console's state.
// It is a read model, so the reducer parity test leaves it out.
const CustomerMetricsCollection = "customerMetrics"

// soldStatuses mirrors SOLD_ORDER_STATUSES in packages/types.
const soldStatuses = `('paid', 'processing', 'packed', 'shipped', 'delivered', 'completed')`

var refreshMetrics = `insert into customer_metrics (customer_id, tenant_id, orders, spend, first_at, last_at, product_counts,
	last_abandoned_at, last_purchase_event_at, buy_months)
select c.id, c.tenant_id, coalesce(o.n, 0), coalesce(o.spend, 0), o.first_at, o.last_at, coalesce(p.counts, '{}'), e.abandoned, e.purchased,
	coalesce(o.months, '{}')
from customers c
left join lateral (
	select count(*) n, sum((data->>'total')::bigint - coalesce((data->>'refundedAmount')::bigint, 0)) spend,
		min((data->>'createdAt')::timestamptz) first_at, max((data->>'createdAt')::timestamptz) last_at,
		array_agg(distinct to_char((data->>'createdAt')::timestamptz at time zone 'Asia/Jakarta', 'YYYY-MM')) months
	from orders where customer_id = c.id and status in ` + soldStatuses + `
) o on true
left join lateral (
	select jsonb_object_agg(product_id, qty) counts from (
		select l->>'productId' product_id, sum((l->>'qty')::int) qty
		from orders, jsonb_array_elements(data->'lines') l
		where customer_id = c.id and status in ` + soldStatuses + `
		group by 1
	) bought
) p on true
left join lateral (
	select max(at::timestamptz) filter (where data->>'kind' = 'checkout_abandoned') abandoned,
		max(at::timestamptz) filter (where data->>'kind' = 'purchase') purchased
	from customer_events where customer_id = c.id
) e on true
where %s and (coalesce(o.n, 0) > 0 or e.abandoned is not null)
on conflict (customer_id) do update set tenant_id = excluded.tenant_id, orders = excluded.orders, spend = excluded.spend,
	first_at = excluded.first_at, last_at = excluded.last_at, product_counts = excluded.product_counts,
	last_abandoned_at = excluded.last_abandoned_at, last_purchase_event_at = excluded.last_purchase_event_at,
	buy_months = excluded.buy_months`

// metricsRow is how a row reads in the console: id is the customer's, so deltas replace it in place.
const metricsRow = `jsonb_build_object('id', customer_id, 'tenantId', tenant_id, 'customerId', customer_id, 'orders', orders,
	'spend', spend, 'firstAt', first_at, 'lastAt', last_at, 'productCounts', product_counts,
	'lastAbandonedAt', last_abandoned_at, 'lastPurchaseEventAt', last_purchase_event_at, 'buyMonths', buy_months)`

// RefreshCustomerMetrics derives the rows of the given customers again. A customer who no longer
// qualifies, or no longer exists, loses their row; the returned ids say which.
func RefreshCustomerMetrics(ctx context.Context, q Querier, customerIDs []string) (removed []string, err error) {
	if len(customerIDs) == 0 {
		return nil, nil
	}
	if _, err := q.Exec(ctx, fmt.Sprintf(refreshMetrics, "c.id = any($1)"), customerIDs); err != nil {
		return nil, err
	}
	rows, err := q.Query(ctx, `delete from customer_metrics m where m.customer_id = any($1) and not exists (
		select 1 from orders where customer_id = m.customer_id and status in `+soldStatuses+`
	) and not exists (
		select 1 from customer_events where customer_id = m.customer_id and data->>'kind' = 'checkout_abandoned'
	) or (m.customer_id = any($1) and not exists (select 1 from customers where id = m.customer_id)) returning customer_id`, customerIDs)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// CustomerMetricsRows reads rows as the console shows them, for some customers or a set of tenants.
func CustomerMetricsRows(ctx context.Context, q Querier, where string, args ...any) ([]json.RawMessage, error) {
	rows, err := q.Query(ctx, `select `+metricsRow+` from customer_metrics where `+where+` order by customer_id`, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[json.RawMessage])
}

func rebuildCustomerMetrics(ctx context.Context, q Querier) error {
	if _, err := q.Exec(ctx, `delete from customer_metrics`); err != nil {
		return err
	}
	_, err := q.Exec(ctx, fmt.Sprintf(refreshMetrics, "true"))
	return err
}
