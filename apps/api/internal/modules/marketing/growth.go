package marketing

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SaveCampaign is campaigns/save.
func (s *Marketing) SaveCampaign(ctx context.Context, m kernel.Meta, c domain.Campaign) (*kernel.Delta, error) {
	if err := kernel.Access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("campaigns", c.ID, c) })
}

// audience counts the tenant's customers in a segment at the given time.
func audience(t *kernel.Tx, tenantID string, segmentID *string, now int64) (int, error) {
	if segmentID == nil {
		return 0, nil
	}
	customers, err := crm.SegmentAudience(t, tenantID, *segmentID, now)
	return len(customers), err
}

// LaunchCampaign is campaigns/launch: it runs now, or waits for its start.
func (s *Marketing) LaunchCampaign(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Lock[domain.Campaign](t, "campaigns", id, "campaign")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		now := clock.Ms(m.At)
		size, err := audience(t, c.TenantID, c.SegmentID, now)
		if err != nil {
			return err
		}
		if why := rules.CampaignLaunchBlocker(c, size); why != "" {
			return kernel.Refuse(why)
		}
		if clock.Ms(c.StartAt) > now {
			c.Status = "scheduled"
		} else {
			c.Status = "running"
		}
		if clock.Ms(c.EndAt) < now {
			c.EndAt = clock.Iso(clock.FromMs(now + 14*clock.Day))
		}
		return t.Put("campaigns", c.ID, c)
	})
}

// PauseCampaign is campaigns/pause.
func (s *Marketing) PauseCampaign(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Lock[domain.Campaign](t, "campaigns", id, "campaign")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		if c.Status != "running" {
			return nil
		}
		c.Status = "paused"
		return t.Put("campaigns", c.ID, c)
	})
}

// SaveAutomation is automations/save; the server stamps updatedAt.
func (s *Marketing) SaveAutomation(ctx context.Context, m kernel.Meta, a domain.Automation) (*kernel.Delta, error) {
	if err := kernel.Access(m, a.TenantID); err != nil {
		return nil, err
	}
	a.UpdatedAt = m.At
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("automations", a.ID, a) })
}

// SetAutomationStatus is automations/setStatus.
func (s *Marketing) SetAutomationStatus(ctx context.Context, m kernel.Meta, id, status string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		a, err := kernel.Lock[domain.Automation](t, "automations", id, "automation")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, a.TenantID); err != nil {
			return err
		}
		a.Status = status
		a.UpdatedAt = m.At
		return t.Put("automations", a.ID, a)
	})
}

// SavePromotion is promotions/save.
func (s *Marketing) SavePromotion(ctx context.Context, m kernel.Meta, p domain.Promotion) (*kernel.Delta, error) {
	if err := kernel.Access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("promotions", p.ID, p) })
}

// SetPromotionStatus is promotions/setStatus.
func (s *Marketing) SetPromotionStatus(ctx context.Context, m kernel.Meta, id, status string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Promotion](t, "promotions", id, "promotion")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		p.Status = status
		return t.Put("promotions", p.ID, p)
	})
}
