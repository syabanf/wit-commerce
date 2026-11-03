package service

import (
	"context"
	"fmt"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// PaymentWindowHours is how long a customer has to pay before an unpaid order is cancelled.
const PaymentWindowHours = 24

// ToggleIntegration is integrations/toggle.
func (s *Service) ToggleIntegration(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		i, err := lock[domain.Integration](t, "integrations", id, "integration")
		if err != nil {
			return err
		}
		if err := access(m, i.TenantID); err != nil {
			return err
		}
		if i.Enabled {
			i.Health = "off"
		} else {
			i.Health = "connected"
		}
		i.Enabled = !i.Enabled
		return t.put("integrations", i.ID, i)
	})
}

// SyncIntegration is integrations/sync.
func (s *Service) SyncIntegration(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		i, err := lock[domain.Integration](t, "integrations", id, "integration")
		if err != nil {
			return err
		}
		if err := access(m, i.TenantID); err != nil {
			return err
		}
		if !i.Enabled {
			return nil
		}
		i.LastSyncAt = ptr(m.At)
		if i.Health == "failing" {
			i.Health = "degraded"
		}
		return t.put("integrations", i.ID, i)
	})
}

// Tick is system/tick, the jobs a backend runs on a timer: expire unpaid orders, start and end
// promotions, campaigns and scheduled pages. It runs across every tenant.
func (s *Service) Tick(ctx context.Context, at string) (*Delta, error) {
	now := clock.Ms(at)
	return s.run(ctx, func(t *tx) error {
		open, err := store.List[domain.Order](t.ctx, t.Tx, "orders",
			"status in ('new', 'confirmed') and data->>'paymentStatus' = 'pending' and data->>'paymentMethod' <> 'cod' for update")
		if err != nil {
			return err
		}
		for _, o := range open {
			if now-clock.Ms(o.CreatedAt) < PaymentWindowHours*clock.Hour {
				continue
			}
			l, err := lookup(t, o)
			if err != nil {
				return err
			}
			if err := t.moveStock(l, o, -1, false); err != nil {
				return err
			}
			o.Status, o.PaymentStatus = "cancelled", "failed"
			o.CancelReason = ptr("payment_expired")
			o.Events = append([]domain.OrderEvent{orderEvent(at, "system", ptr("cancelled"),
				fmt.Sprintf("No payment within %d hours", PaymentWindowHours))}, o.Events...)
			if err := t.put("orders", o.ID, o); err != nil {
				return err
			}
		}
		promotions, err := store.List[domain.Promotion](t.ctx, t.Tx, "promotions",
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
			if err := t.put("promotions", p.ID, p); err != nil {
				return err
			}
		}
		pages, err := store.List[domain.Page](t.ctx, t.Tx, "pages", "status = 'scheduled' for update")
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
			if err := t.put("pages", p.ID, p); err != nil {
				return err
			}
		}
		campaigns, err := store.List[domain.Campaign](t.ctx, t.Tx, "campaigns",
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
			if err := t.put("campaigns", c.ID, c); err != nil {
				return err
			}
		}
		return nil
	})
}
