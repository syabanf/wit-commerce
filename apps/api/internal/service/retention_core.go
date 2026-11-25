package service

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
)

// Core retention, PP 80/2019 Pasal 25 (docs/compliance.md, Performance and retention):
//
//   - Transaction data, Retention.Transactions (10 years): an order goes, with its payment, refund
//     attempts, returns, invoice number and order_rows row, once its last activity (placed, any status
//     step, any step of its returns) is older than the period. Deleted, not anonymised: past the period
//     nothing obliges keeping it, and sales_months and product_months keep the totals without any
//     person. The customer's metrics are derived again without it. A platform invoice to a brand goes
//     once it was issued that long ago, unless it is still due.
//   - Other PMSE data, Retention.Customers (5 years): a customer whose last activity (account, consent,
//     timeline, orders, returns, tickets, leads) is older than the period is anonymised through the
//     same erasure path a shopper's request takes. The pseudonymous row stays while any of their
//     orders is inside its 10 years; once none is left it is deleted with its timeline, tickets, leads
//     and metrics. A ticket or lead with no customer goes once its own last activity is that old; an
//     open ticket stays.
//   - Privacy requests, Retention.PrivacyRequests (5 years): a completed request is the proof it was
//     answered and goes that long after completion. An open one stays.
//
// Every step runs in bounded batches inside the hourly retention job and compares document times
// with the app clock, so no row inside its period is touched.

const (
	// coreBatch is how many orders or customers one delete transaction takes.
	coreBatch = 500
	// erasuresPerRun caps the erasures one run makes; each is its own transaction.
	erasuresPerRun = 200
	// RetentionErasureNote is the note on the privacy request a retention erasure records.
	RetentionErasureNote = "Retention: no activity for the PP 80/2019 period"
)

// activity is the latest of a document's createdAt and the at of each of its events, as ISO text.
func activity(alias string) string {
	return strings.ReplaceAll(`greatest($.data->>'createdAt', coalesce((select max(e->>'at') from jsonb_array_elements(coalesce($.data->'events', '[]'::jsonb)) e), ''))`, "$", alias)
}

// customerActivity is the customer's last activity as ISO text. The erasure's own timeline line and
// erasedAt do not count, so an erasure never restarts the period.
var customerActivity = `greatest(c.data->>'createdAt', coalesce(c.data#>>'{marketingConsent,at}', ''),
	coalesce((select max(ce.at) from customer_events ce where ce.customer_id = c.id
		and not (ce.data->>'kind' = 'privacy' and ce.data->>'label' = '` + crm.ErasedEventLabel + `')), ''),
	coalesce((select max(` + activity("o") + `) from orders o where o.customer_id = c.id), ''),
	coalesce((select max(` + activity("r") + `) from returns r where r.customer_id = c.id), ''),
	coalesce((select max(greatest(t.data->>'createdAt', coalesce(t.data->>'resolvedAt', ''))) from tickets t where t.customer_id = c.id), ''),
	coalesce((select max(greatest(l.data->>'createdAt', coalesce(l.data->>'updatedAt', ''))) from leads l where l.customer_id = c.id), ''))`

// pruneCore applies the core rules above and adds what it removed to deleted.
func (s *Service) pruneCore(ctx context.Context, appNow time.Time, r Retention, deleted map[string]int64) error {
	if r.Transactions > 0 {
		cutoff := appNow.Add(-r.Transactions)
		if err := s.pruneOrders(ctx, clock.Iso(cutoff), deleted); err != nil {
			return fmt.Errorf("prune orders: %w", err)
		}
		if err := s.deleteBatches(ctx, deleted, "invoices", `delete from invoices where id in (
			select id from invoices where issued_at < $1 and status <> 'due' limit 5000)`, cutoff); err != nil {
			return err
		}
	}
	if r.Customers > 0 {
		cutoff := clock.Iso(appNow.Add(-r.Customers))
		if err := s.anonymiseCustomers(ctx, appNow, cutoff, deleted); err != nil {
			return fmt.Errorf("anonymise customers: %w", err)
		}
		if err := s.pruneCustomers(ctx, cutoff, deleted); err != nil {
			return fmt.Errorf("prune customers: %w", err)
		}
		if err := s.deleteBatches(ctx, deleted, "tickets", `delete from tickets where id in (select id from tickets
			where coalesce(customer_id, '') = '' and status = 'resolved'
			and greatest(data->>'createdAt', coalesce(data->>'resolvedAt', '')) < $1 limit 5000)`, cutoff); err != nil {
			return err
		}
		if err := s.deleteBatches(ctx, deleted, "leads", `delete from leads where id in (select id from leads
			where coalesce(customer_id, '') = ''
			and greatest(data->>'createdAt', coalesce(data->>'updatedAt', '')) < $1 limit 5000)`, cutoff); err != nil {
			return err
		}
	}
	if r.PrivacyRequests > 0 {
		if err := s.deleteBatches(ctx, deleted, "privacy_requests", `delete from privacy_requests where id in (
			select id from privacy_requests where status = 'completed' and completed_at < $1 limit 5000)`, appNow.Add(-r.PrivacyRequests)); err != nil {
			return err
		}
	}
	return nil
}

// deleteBatches runs a delete that takes at most 5,000 rows until it takes fewer, or pruneBatches times.
func (s *Service) deleteBatches(ctx context.Context, deleted map[string]int64, table, sql string, cutoff any) error {
	for range pruneBatches {
		tag, err := s.DB.Pool.Exec(ctx, sql, cutoff)
		if err != nil {
			return fmt.Errorf("prune %s: %w", table, err)
		}
		if n := tag.RowsAffected(); n > 0 {
			deleted[table] += n
		}
		if tag.RowsAffected() < pruneBatch {
			return nil
		}
	}
	return nil
}

// pruneOrders deletes orders past the transaction period, coreBatch at a time, with everything that
// hangs off them, and derives their customers' metrics again.
func (s *Service) pruneOrders(ctx context.Context, cutoff string, deleted map[string]int64) error {
	for range pruneBatches {
		var n int
		err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
			rows, err := tx.Query(ctx, `select o.id, o.customer_id from orders o
				where o.created_at < $1 and `+activity("o")+` < $1
				and not exists (select 1 from returns r where r.order_id = o.id and `+activity("r")+` >= $1)
				limit $2 for update of o skip locked`, cutoff, coreBatch)
			if err != nil {
				return err
			}
			var orders, customers []string
			for rows.Next() {
				var id string
				var customer *string
				if err := rows.Scan(&id, &customer); err != nil {
					rows.Close()
					return err
				}
				orders = append(orders, id)
				if customer != nil && *customer != "" {
					customers = append(customers, *customer)
				}
			}
			rows.Close()
			if n = len(orders); n == 0 {
				return rows.Err()
			}
			for _, table := range []string{"payment_refunds", "payments", "order_invoices", "returns", "orders"} {
				key := "order_id"
				if table == "orders" {
					key = "id"
				}
				tag, err := tx.Exec(ctx, `delete from `+table+` where `+key+` = any($1)`, orders)
				if err != nil {
					return err
				}
				deleted[table] += tag.RowsAffected()
			}
			if err := readmodel.RemoveOrders(ctx, tx, orders); err != nil {
				return err
			}
			_, err = readmodel.RefreshCustomerMetrics(ctx, tx, slices.Compact(slices.Sorted(slices.Values(customers))))
			return err
		})
		if err != nil || n < coreBatch {
			return err
		}
	}
	return nil
}

// anonymiseCustomers erases customers whose last activity is past the period, through the same path
// a shopper's erasure request takes. A customer the erasure blocker holds (an order before delivery,
// an open return) or who has an open privacy request is left for a later run.
func (s *Service) anonymiseCustomers(ctx context.Context, appNow time.Time, cutoff string, deleted map[string]int64) error {
	rows, err := s.DB.Pool.Query(ctx, `select c.id from customers c
		where coalesce(c.data->>'erasedAt', '') = '' and c.data->>'createdAt' < $1 and `+customerActivity+` < $1
		and not exists (select 1 from privacy_requests p where p.customer_id = c.id and p.status = 'open')
		limit $2`, cutoff, erasuresPerRun)
	if err != nil {
		return err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	m := Meta{P: auth.System, At: clock.Iso(appNow)}
	for _, id := range ids {
		_, err := s.Run(ctx, func(t *tx) error {
			c, err := crm.LockCustomer(t, m, id)
			if err != nil {
				return err
			}
			return erase(t, m, c, RetentionErasureNote)
		})
		var refused kernel.Refusal
		switch {
		case errors.As(err, &refused):
			deleted["customers_held"]++
		case err != nil:
			return err
		default:
			deleted["customers_anonymised"]++
		}
	}
	return nil
}

// pruneCustomers deletes erased customers past the period who have no order or return left, with
// their timeline, tickets, leads, credentials and read model rows.
func (s *Service) pruneCustomers(ctx context.Context, cutoff string, deleted map[string]int64) error {
	for range pruneBatches {
		var n int
		err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
			rows, err := tx.Query(ctx, `select c.id from customers c
				where coalesce(c.data->>'erasedAt', '') <> '' and c.data->>'createdAt' < $1
				and not exists (select 1 from orders o where o.customer_id = c.id)
				and not exists (select 1 from returns r where r.customer_id = c.id)
				and `+customerActivity+` < $1
				limit $2 for update of c skip locked`, cutoff, coreBatch)
			if err != nil {
				return err
			}
			ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
			if n = len(ids); err != nil || n == 0 {
				return err
			}
			for _, table := range []string{"customer_events", "tickets", "leads", "customer_credentials", "seller_buyers", "customers"} {
				key := "customer_id"
				if table == "customers" {
					key = "id"
				}
				tag, err := tx.Exec(ctx, `delete from `+table+` where `+key+` = any($1)`, ids)
				if err != nil {
					return err
				}
				if table != "customer_credentials" && table != "seller_buyers" {
					deleted[table] += tag.RowsAffected()
				}
			}
			_, err = readmodel.RefreshCustomerMetrics(ctx, tx, ids)
			return err
		})
		if err != nil || n < coreBatch {
			return err
		}
	}
	return nil
}
