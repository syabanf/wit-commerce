package readmodel

import (
	"context"
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
	out := BuyerFigures{FirstDays: map[string]int{}, LastDays: map[string]int{}, Cohorts: map[string]Cohort{}}
	if err := q.QueryRow(ctx, `select count(*), count(*) filter (where m.orders > 1), coalesce(sum(m.spend), 0)
		from customer_metrics m where `+where, args...).Scan(&out.Buyers, &out.RepeatBuyers, &out.Spend); err != nil {
		return out, err
	}
	cutoff := SalesCutoff(now)
	window := append(append([]any{}, args...), cutoff)
	n := len(window)
	const day, month = `'YYYY-MM-DD'`, `'YYYY-MM'`
	wib := func(column, format string) string {
		return "to_char(" + column + " at time zone 'Asia/Jakarta', " + format + ")"
	}
	counts := func(sql string, into map[string]int) error {
		rows, err := q.Query(ctx, sql, window...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var key string
			var count int
			if err := rows.Scan(&key, &count); err != nil {
				return err
			}
			into[key] = count
		}
		return rows.Err()
	}
	for _, c := range []struct {
		column string
		into   map[string]int
	}{{"m.first_at", out.FirstDays}, {"m.last_at", out.LastDays}} {
		key := wib(c.column, day)
		if err := counts(fmt.Sprintf(`select %s, count(*) from customer_metrics m where %s and %s >= $%d group by 1`,
			key, where, key, n), c.into); err != nil {
			return out, err
		}
	}
	first := wib("m.first_at", month)
	sizes := map[string]int{}
	if err := counts(fmt.Sprintf(`select %s, count(*) from customer_metrics m where %s and %s >= left($%d, 7) group by 1`,
		first, where, first, n), sizes); err != nil {
		return out, err
	}
	for key, size := range sizes {
		out.Cohorts[key] = Cohort{Size: size, Bought: map[string]int{}}
	}
	rows, err := q.Query(ctx, fmt.Sprintf(`select %s, bought, count(*) from customer_metrics m, unnest(m.buy_months) bought
		where %s and %s >= left($%d, 7) group by 1, 2`, first, where, first, n), window...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, bought string
		var count int
		if err := rows.Scan(&key, &bought, &count); err != nil {
			return out, err
		}
		if c, ok := out.Cohorts[key]; ok {
			c.Bought[bought] = count
		}
	}
	return out, rows.Err()
}
