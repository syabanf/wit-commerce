package readmodel

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Collection names the sales facts travel under in deltas and the console's state.
const (
	SalesDaysCollection    = "salesDays"
	ProductDaysCollection  = "productDays"
	SellerBuyersCollection = "sellerBuyers"
)

// Collections lists every read model the console receives, for the reducer parity test to skip.
var Collections = []string{CustomerMetricsCollection, SalesDaysCollection, ProductDaysCollection, SellerBuyersCollection}

// wibDay is an order's WIB calendar day, as dayKey in packages/fixtures/src/dates.ts makes it.
const wibDay = `to_char((o.data->>'createdAt')::timestamptz at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`

// factTables names each sales fact table with its collection, its console row and how one day of
// it derives from the sold orders in `sold`.
var factTables = []struct {
	table, collection, row, insert string
}{
	{
		"sales_days", SalesDaysCollection,
		`jsonb_build_object('id', id, 'tenantId', tenant_id, 'day', day, 'channel', channel, 'sellerId', seller_id,
			'campaignId', campaign_id, 'orders', orders, 'revenue', revenue)`,
		`insert into sales_days (id, tenant_id, day, channel, seller_id, campaign_id, orders, revenue)
		select concat_ws(':', tenant_id, day, channel, coalesce(seller_id, ''), coalesce(campaign_id, '')), tenant_id, day, channel,
			seller_id, campaign_id, count(*), sum(net)
		from sold group by tenant_id, day, channel, seller_id, campaign_id`,
	},
	{
		"product_days", ProductDaysCollection,
		`jsonb_build_object('id', id, 'tenantId', tenant_id, 'day', day, 'productId', product_id, 'units', units,
			'revenue', revenue, 'orders', orders)`,
		`insert into product_days (id, tenant_id, day, product_id, units, revenue, orders)
		select concat_ws(':', tenant_id, day, l->>'productId'), tenant_id, day, l->>'productId', sum((l->>'qty')::int),
			sum((l->>'qty')::bigint * (l->>'price')::bigint), count(distinct id)
		from sold, jsonb_array_elements(lines) l group by tenant_id, day, l->>'productId'`,
	},
	{
		"seller_buyers", SellerBuyersCollection,
		`jsonb_build_object('id', id, 'tenantId', tenant_id, 'sellerId', seller_id, 'customerId', customer_id, 'day', day,
			'orders', orders)`,
		`insert into seller_buyers (id, tenant_id, seller_id, customer_id, day, orders)
		select concat_ws(':', tenant_id, seller_id, customer_id, day), tenant_id, seller_id, customer_id, day, count(*)
		from sold where seller_id is not null group by tenant_id, seller_id, customer_id, day`,
	},
}

// soldIn selects the sold orders of the given tenant days, with what the facts read.
const soldIn = `with keys as (select * from unnest($1::text[], $2::text[]) k(tenant_id, day)),
sold as (
	select o.id, o.tenant_id, ` + wibDay + ` as day, o.data->>'channel' channel, o.data->>'sellerId' seller_id,
		o.data->>'campaignId' campaign_id, o.customer_id, o.data->'lines' lines,
		(o.data->>'total')::bigint - coalesce((o.data->>'refundedAmount')::bigint, 0) net
	from orders o join keys k on k.tenant_id = o.tenant_id and k.day = ` + wibDay + `
	where o.status in ` + soldStatuses + `
) `

// RefreshSalesDays derives the facts of the given tenant days again and reports, per collection,
// the rows that now exist and the ids that went away.
func RefreshSalesDays(ctx context.Context, q Querier, tenants, days []string) (map[string][]json.RawMessage, map[string][]string, error) {
	rows := map[string][]json.RawMessage{}
	gone := map[string][]string{}
	if len(tenants) == 0 {
		return rows, gone, nil
	}
	keys := `(tenant_id, day) in (select * from unnest($1::text[], $2::text[]))`
	for _, f := range factTables {
		removed, err := q.Query(ctx, `delete from `+f.table+` where `+keys+` returning id`, tenants, days)
		if err != nil {
			return nil, nil, err
		}
		before, err := pgx.CollectRows(removed, pgx.RowTo[string])
		if err != nil {
			return nil, nil, err
		}
		if _, err := q.Exec(ctx, soldIn+f.insert, tenants, days); err != nil {
			return nil, nil, fmt.Errorf("%s: %w", f.table, err)
		}
		current, err := q.Query(ctx, `select id, `+f.row+` from `+f.table+` where `+keys+` order by id`, tenants, days)
		if err != nil {
			return nil, nil, err
		}
		kept := map[string]bool{}
		for current.Next() {
			var id string
			var row json.RawMessage
			if err := current.Scan(&id, &row); err != nil {
				current.Close()
				return nil, nil, err
			}
			kept[id] = true
			rows[f.collection] = append(rows[f.collection], row)
		}
		current.Close()
		for _, id := range before {
			if !kept[id] {
				gone[f.collection] = append(gone[f.collection], id)
			}
		}
	}
	return rows, gone, nil
}

// SalesDaysOf lists the tenant days the given orders fall on.
func SalesDaysOf(ctx context.Context, q Querier, where string, args ...any) (tenants, days []string, err error) {
	rows, err := q.Query(ctx, `select distinct o.tenant_id, `+wibDay+` from orders o where `+where, args...)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var tenant, day string
		if err := rows.Scan(&tenant, &day); err != nil {
			rows.Close()
			return nil, nil, err
		}
		tenants, days = append(tenants, tenant), append(days, day)
	}
	rows.Close()
	return tenants, days, rows.Err()
}

// FactRows reads one fact collection as the console shows it, for a set of tenants.
func FactRows(ctx context.Context, q Querier, collection, where string, args ...any) ([]json.RawMessage, error) {
	for _, f := range factTables {
		if f.collection != collection {
			continue
		}
		rows, err := q.Query(ctx, `select `+f.row+` from `+f.table+` where `+where+` order by id`, args...)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowTo[json.RawMessage])
	}
	return nil, fmt.Errorf("no fact collection %s", collection)
}

func rebuildSales(ctx context.Context, q Querier) error {
	for _, f := range factTables {
		if _, err := q.Exec(ctx, `delete from `+f.table); err != nil {
			return err
		}
	}
	tenants, days, err := SalesDaysOf(ctx, q, "true")
	if err != nil {
		return err
	}
	_, _, err = RefreshSalesDays(ctx, q, tenants, days)
	return err
}
