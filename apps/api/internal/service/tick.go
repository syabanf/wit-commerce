package service

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/storefront"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// PaymentWindowHours is how long a customer has to pay before an unpaid order is cancelled.
const PaymentWindowHours = 24

// Tick is system/tick, the jobs a backend runs on a timer: expire unpaid orders, start and end
// promotions, campaigns and scheduled pages. It runs across every tenant. It lives in the facade
// because its jobs cross modules: orders, inventory, marketing and storefront.
func (s *Service) Tick(ctx context.Context, at string) (*Delta, error) {
	now := clock.Ms(at)
	return s.Run(ctx, func(t *tx) error {
		open, err := store.List[domain.Order](t.Ctx, t.Tx, "orders",
			"status in ('new', 'confirmed') and data->>'paymentStatus' = 'pending' and data->>'paymentMethod' <> 'cod' for update")
		if err != nil {
			return err
		}
		var due []domain.Order
		for _, o := range open {
			if now-clock.Ms(o.CreatedAt) >= PaymentWindowHours*clock.Hour {
				due = append(due, o)
			}
		}
		if err := lockStockFor(t, due); err != nil {
			return err
		}
		for _, o := range due {
			if err := orders.Expire(t, o, "payment_expired", fmt.Sprintf("No payment within %d hours", PaymentWindowHours), at, "system"); err != nil {
				return err
			}
		}
		promotions, err := store.List[domain.Promotion](t.Ctx, t.Tx, "promotions",
			"status in ('scheduled', 'active', 'paused') for update")
		if err != nil {
			return err
		}
		for _, p := range promotions {
			switch {
			case p.Status == "scheduled" && clock.Ms(p.StartAt) <= now:
				p.Status = "active"
			case (p.Status == "active" || p.Status == "paused") && clock.Ms(p.EndAt) < now:
				p.Status = "expired"
			default:
				continue
			}
			if err := t.Put("promotions", p.ID, p); err != nil {
				return err
			}
		}
		if err := storefront.PublishDue(t, at); err != nil {
			return err
		}
		campaigns, err := store.List[domain.Campaign](t.Ctx, t.Tx, "campaigns",
			"status in ('scheduled', 'running') for update")
		if err != nil {
			return err
		}
		for _, c := range campaigns {
			switch {
			case c.Status == "scheduled" && clock.Ms(c.StartAt) <= now:
				c.Status = "running"
			case c.Status == "running" && clock.Ms(c.EndAt) < now:
				c.Status = "completed"
			default:
				continue
			}
			if err := t.Put("campaigns", c.ID, c); err != nil {
				return err
			}
		}
		return nil
	})
}

// rollUpBatch is how many tenant months one roll-up transaction takes, so a backlog after a long
// pause commits in pieces instead of holding one long transaction.
const rollUpBatch = 50

// RollUpSales is the daily job that keeps the sales facts bounded: days before the console's window
// roll up into months (readmodel.RollUpSales). It runs once per WIB day, in batches; a run cut off
// halfway resumes on the next tick, and running it again changes nothing.
func (s *Service) RollUpSales(ctx context.Context, now time.Time) error {
	today := clock.Iso(now)[:10]
	var done string
	err := s.DB.Pool.QueryRow(ctx, `select done_day from sales_rollup`).Scan(&done)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if done == today {
		return nil
	}
	cutoff := readmodel.SalesCutoff(now)
	for {
		var n int
		if err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
			n, err = readmodel.RollUpSales(ctx, tx, cutoff, rollUpBatch)
			return err
		}); err != nil {
			return err
		}
		if n < rollUpBatch {
			break
		}
	}
	_, err = s.DB.Pool.Exec(ctx, `insert into sales_rollup (id, done_day) values (1, $1)
		on conflict (id) do update set done_day = excluded.done_day`, today)
	return err
}

// lockStockFor locks, before any expiry runs, every stock level the expiring orders release, one
// warehouse at a time in id order. A checkout locks its own levels in the same order, so the two
// queue instead of deadlocking when the tick expires several orders that share levels.
func lockStockFor(t *tx, due []domain.Order) error {
	type place struct{ tenant, warehouse string }
	variants, options := map[place][]string{}, map[place][]string{}
	var places []place
	for _, o := range due {
		at := place{o.TenantID, o.WarehouseID}
		if _, seen := variants[at]; !seen {
			places = append(places, at)
		}
		variants[at] = append(variants[at], rules.VariantDemand(o).Keys...)
		options[at] = append(options[at], rules.ModifierDemand(o).Keys...)
	}
	slices.SortFunc(places, func(a, b place) int {
		return cmp.Or(strings.Compare(a.tenant, b.tenant), strings.Compare(a.warehouse, b.warehouse))
	})
	for _, at := range places {
		if _, _, err := inventory.StockAt(t, at.tenant, at.warehouse, sortedUnique(variants[at]), sortedUnique(options[at])); err != nil {
			return err
		}
	}
	return nil
}

func sortedUnique(ids []string) []string {
	slices.Sort(ids)
	return slices.Compact(ids)
}
