package service

import (
	"context"
	"fmt"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
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
		for _, o := range open {
			if now-clock.Ms(o.CreatedAt) < PaymentWindowHours*clock.Hour {
				continue
			}
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
		pages, err := store.List[domain.Page](t.Ctx, t.Tx, "pages", "status = 'scheduled' for update")
		if err != nil {
			return err
		}
		for _, p := range pages {
			if p.ScheduledAt == nil || clock.Ms(*p.ScheduledAt) > now {
				continue
			}
			p.Status = "published"
			p.PublishedAt = p.ScheduledAt
			p.ScheduledAt = nil
			if err := t.Put("pages", p.ID, p); err != nil {
				return err
			}
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
