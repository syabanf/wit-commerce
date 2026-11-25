package readmodel

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// BuyerFigures sums a brand's customer metrics into what the analytics read: how many bought, how
// many bought again, what they spent, and when buyers first and last bought, by WIB day and as
// monthly cohorts. buyerFigures in packages/fixtures makes the same figures from the rows, for the
// demo; the console no longer loads every metrics row to sum them itself.
type BuyerFigures struct {
	// Buyers have one sold order or more; RepeatBuyers two or more. Spend is their net spend.
	Buyers       int   `json:"buyers"`
	RepeatBuyers int   `json:"repeatBuyers"`
	Spend        int64 `json:"spend"`
	// FirstDays and LastDays count buyers by the WIB day of their first and last sold order, from the
	// first day of the daily window on.
	FirstDays map[string]int `json:"firstDays"`
	LastDays  map[string]int `json:"lastDays"`
	// Cohorts group buyers by the WIB month of their first order, for the months of the daily
	// window: the cohort's size, and how many of it bought in each month.
	Cohorts map[string]Cohort `json:"cohorts"`
}

// Cohort is one month of first buyers.
type Cohort struct {
	Size   int            `json:"size"`
	Bought map[string]int `json:"bought"`
}

// Buyers reads the figures of one brand. sellers, when not nil, keeps a sales user's assigned
// customers only, as their metrics rows are.
func Buyers(ctx context.Context, q Querier, tenantID string, sellers []string, now time.Time) (BuyerFigures, error) {
	where, args := "m.tenant_id = $1 and m.orders > 0", []any{tenantID}
	if sellers != nil {
		args = append(args, sellers)
		where += fmt.Sprintf(" and m.customer_id in (select id from customers where seller_id = any($%d))", len(args))
	}
	args = append(args, SalesCutoff(now))
	cutoff := fmt.Sprintf("$%d", len(args))
	// One scan: the WIB days are worked out once per row, and each figure groups the scanned rows.
	// A cohort month is the first day's first seven characters.
	out := BuyerFigures{Cohorts: map[string]Cohort{}}
	var firstDays, lastDays, sizes, bought []byte
	err := q.QueryRow(ctx, `with m as materialized (
			select m.orders, m.spend, m.buy_months,
				to_char(m.first_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') first_day,
				to_char(m.last_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') last_day
			from customer_metrics m where `+where+`)
		select (select count(*) from m), (select count(*) from m where orders > 1), (select coalesce(sum(spend), 0) from m),
			(select coalesce(json_object_agg(k, n), '{}') from (select first_day k, count(*) n from m where first_day >= `+cutoff+` group by 1) x),
			(select coalesce(json_object_agg(k, n), '{}') from (select last_day k, count(*) n from m where last_day >= `+cutoff+` group by 1) x),
			(select coalesce(json_object_agg(k, n), '{}') from (select left(first_day, 7) k, count(*) n from m
				where left(first_day, 7) >= left(`+cutoff+`, 7) group by 1) x),
			(select coalesce(json_agg(json_build_array(k, b, n)), '[]') from (select left(first_day, 7) k, b, count(*) n
				from m, unnest(m.buy_months) b where left(first_day, 7) >= left(`+cutoff+`, 7) group by 1, 2) x)`, args...).
		Scan(&out.Buyers, &out.RepeatBuyers, &out.Spend, &firstDays, &lastDays, &sizes, &bought)
	if err != nil {
		return out, err
	}
	var cohortSizes map[string]int
	var cohortBought [][3]any
	for _, f := range []struct {
		raw  []byte
		into any
	}{{firstDays, &out.FirstDays}, {lastDays, &out.LastDays}, {sizes, &cohortSizes}, {bought, &cohortBought}} {
		if err := json.Unmarshal(f.raw, f.into); err != nil {
			return out, err
		}
	}
	for key, size := range cohortSizes {
		out.Cohorts[key] = Cohort{Size: size, Bought: map[string]int{}}
	}
	for _, row := range cohortBought {
		key, _ := row[0].(string)
		month, _ := row[1].(string)
		count, _ := row[2].(float64)
		if c, ok := out.Cohorts[key]; ok {
			c.Bought[month] = int(count)
		}
	}
	return out, nil
}
