package readmodel

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// The daily facts keep the window the console reads; older days roll up into months.
//
// The longest window in packages/fixtures/src/analytics.ts is monthlyRevenue over 12 months, the
// current one included. Cohorts read customer metrics, not daily facts, and every other screen reads
// 90 days or less. So the daily window holds the current month and the 13 whole months before it: 12
// for the chart and one spare, between 396 and 425 days.
const DailyWindowMonths = 13

// SalesCutoff is the first WIB day the daily facts keep, as a day key.
func SalesCutoff(now time.Time) string {
	wib := now.In(time.FixedZone("WIB", 7*3600))
	return time.Date(wib.Year(), wib.Month()-DailyWindowMonths, 1, 0, 0, 0, 0, wib.Location()).Format("2006-01-02")
}

// wibMonth is an order's WIB calendar month.
const wibMonth = `to_char((o.data->>'createdAt')::timestamptz at time zone 'Asia/Jakarta', 'YYYY-MM')`

// soldInMonths selects the sold orders of the given tenant months. Like soldIn, the index range
// reaches a day past each end of the month for the offsets createdAt may carry.
const soldInMonths = `with keys as (select * from unnest($1::text[], $2::text[]) k(tenant_id, month)),
sold as (
	select o.id, o.tenant_id, k.month, o.data->>'channel' channel, o.data->>'sellerId' seller_id,
		o.data->>'campaignId' campaign_id, o.data->'lines' lines,
		(o.data->>'total')::bigint - coalesce((o.data->>'refundedAmount')::bigint, 0) net
	from keys k join orders o on o.tenant_id = k.tenant_id
		and o.created_at >= to_char((k.month || '-01')::date - 1, 'YYYY-MM-DD')
		and o.created_at < to_char(((k.month || '-01')::date + interval '1 month')::date + 1, 'YYYY-MM-DD')
		and k.month = ` + wibMonth + `
	where o.status in ` + soldStatuses + `
) `

// monthTables derive each monthly table from the sold orders in `sold`, as the daily ones do.
var monthTables = []struct{ table, insert string }{
	{"sales_months", `insert into sales_months (id, tenant_id, month, channel, seller_id, campaign_id, orders, revenue)
		select concat_ws(':', tenant_id, month, channel, coalesce(seller_id, ''), coalesce(campaign_id, '')), tenant_id, month,
			channel, seller_id, campaign_id, count(*), sum(net)
		from sold group by tenant_id, month, channel, seller_id, campaign_id`},
	{"product_months", `insert into product_months (id, tenant_id, month, product_id, units, revenue, orders)
		select concat_ws(':', tenant_id, month, l->>'productId'), tenant_id, month, l->>'productId', sum((l->>'qty')::int),
			sum((l->>'qty')::bigint * (l->>'price')::bigint), count(distinct id)
		from sold, jsonb_array_elements(lines) l group by tenant_id, month, l->>'productId'`},
}

// dailyTables are the facts the roll-up empties for a month it has rolled up.
var dailyTables = []string{"sales_days", "product_days", "seller_buyers"}

// RollUpSales rolls up to limit tenant months that still have daily rows before cutoff, and reports
// how many it did. Each month derives again from the orders, which are the truth, so running it twice
// or after a late refund to an old order gives the same rows. Seller buyers have no monthly form:
// only the seller screens read them, over 90 days at most. limit 0 means no limit.
func RollUpSales(ctx context.Context, q Querier, cutoff string, limit int) (int, error) {
	pick := `select tenant_id, left(day, 7) from (
		select tenant_id, day from sales_days where day < $1 union
		select tenant_id, day from product_days where day < $1 union
		select tenant_id, day from seller_buyers where day < $1) d group by 1, 2 order by 1, 2`
	args := []any{cutoff}
	if limit > 0 {
		pick += " limit $2"
		args = append(args, limit)
	}
	rows, err := q.Query(ctx, pick, args...)
	if err != nil {
		return 0, err
	}
	var tenants, months []string
	for rows.Next() {
		var tenant, month string
		if err := rows.Scan(&tenant, &month); err != nil {
			rows.Close()
			return 0, err
		}
		tenants, months = append(tenants, tenant), append(months, month)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(tenants) == 0 {
		return 0, err
	}
	return len(tenants), rollUpMonths(ctx, q, tenants, months)
}

// rollUpMonths derives the given tenant months again from the orders and drops their daily rows.
func rollUpMonths(ctx context.Context, q Querier, tenants, months []string) error {
	if err := lockKeys(ctx, q, pairKeys("salesMonth", tenants, months)); err != nil {
		return err
	}
	keys := `(tenant_id, month) in (select * from unnest($1::text[], $2::text[]))`
	for _, m := range monthTables {
		if _, err := q.Exec(ctx, `delete from `+m.table+` where `+keys, tenants, months); err != nil {
			return err
		}
		if _, err := q.Exec(ctx, soldInMonths+m.insert, tenants, months); err != nil {
			return fmt.Errorf("%s: %w", m.table, err)
		}
	}
	for _, table := range dailyTables {
		if _, err := q.Exec(ctx, `delete from `+table+` where (tenant_id, left(day, 7)) in (select * from unnest($1::text[], $2::text[]))`,
			tenants, months); err != nil {
			return err
		}
	}
	return nil
}

// rolledUp keeps the tenant days whose month already rolled up, as months.
func rolledUp(ctx context.Context, q Querier, tenants, days []string) (rolledTenants, rolledMonths []string, err error) {
	rows, err := q.Query(ctx, `select distinct k.tenant_id, left(k.day, 7) from unnest($1::text[], $2::text[]) k(tenant_id, day)
		where exists (select 1 from sales_months m where m.tenant_id = k.tenant_id and m.month = left(k.day, 7))
			or exists (select 1 from product_months m where m.tenant_id = k.tenant_id and m.month = left(k.day, 7))`, tenants, days)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var tenant, month string
		if err := rows.Scan(&tenant, &month); err != nil {
			return nil, nil, err
		}
		rolledTenants, rolledMonths = append(rolledTenants, tenant), append(rolledMonths, month)
	}
	return rolledTenants, rolledMonths, rows.Err()
}

// SalesMonth is one row of sales_months as the console reads it.
type SalesMonth struct {
	Month      string  `json:"month"`
	Channel    string  `json:"channel"`
	SellerID   *string `json:"sellerId"`
	CampaignID *string `json:"campaignId"`
	Orders     int     `json:"orders"`
	Revenue    int64   `json:"revenue"`
}

// ProductMonth is one row of product_months as the console reads it.
type ProductMonth struct {
	Month     string `json:"month"`
	ProductID string `json:"productId"`
	Units     int    `json:"units"`
	Revenue   int64  `json:"revenue"`
	Orders    int    `json:"orders"`
}

// MonthRows reads a tenant's monthly facts between two months, oldest first, for GET
// /views/sales-months. With sellers set, only their sales months and no product months.
func MonthRows(ctx context.Context, q Querier, tenantID, from, to string, sellers []string) ([]SalesMonth, []ProductMonth, error) {
	rows, err := q.Query(ctx, `select month, channel, seller_id, campaign_id, orders, revenue from sales_months
		where tenant_id = $1 and month >= $2 and month <= $3 and ($4::text[] is null or seller_id = any($4)) order by month, id`,
		tenantID, from, to, sellers)
	if err != nil {
		return nil, nil, err
	}
	sales, err := pgx.CollectRows(rows, pgx.RowToStructByPos[SalesMonth])
	if err != nil {
		return nil, nil, err
	}
	products := []ProductMonth{}
	if sellers == nil {
		rows, err = q.Query(ctx, `select month, product_id, units, revenue, orders from product_months
			where tenant_id = $1 and month >= $2 and month <= $3 order by month, id`, tenantID, from, to)
		if err != nil {
			return nil, nil, err
		}
		if products, err = pgx.CollectRows(rows, pgx.RowToStructByPos[ProductMonth]); err != nil {
			return nil, nil, err
		}
	}
	if sales == nil {
		sales = []SalesMonth{}
	}
	return sales, products, nil
}
