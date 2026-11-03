package service

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SaveCampaign is campaigns/save.
func (s *Service) SaveCampaign(ctx context.Context, m Meta, c domain.Campaign) (*Delta, error) {
	if err := access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("campaigns", c.ID, c) })
}

// audience counts the tenant's customers in a segment at the given time.
func audience(t *tx, tenantID string, segmentID *string, now int64) (int, error) {
	if segmentID == nil {
		return 0, nil
	}
	segment, err := get[domain.Segment](t, "segments", *segmentID, "segment")
	if err != nil {
		if _, missing := err.(NotFound); missing {
			return 0, nil
		}
		return 0, err
	}
	orders, err := tenantRows[domain.Order](t, "orders", tenantID)
	if err != nil {
		return 0, err
	}
	events, err := tenantRows[domain.CustomerEvent](t, "customerEvents", tenantID)
	if err != nil {
		return 0, err
	}
	customers, err := tenantRows[domain.Customer](t, "customers", tenantID)
	if err != nil {
		return 0, err
	}
	return rules.AudienceSize(segment, customers, rules.NewSegmentContext(orders, events, now)), nil
}

// LaunchCampaign is campaigns/launch: it runs now, or waits for its start.
func (s *Service) LaunchCampaign(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		c, err := lock[domain.Campaign](t, "campaigns", id, "campaign")
		if err != nil {
			return err
		}
		if err := access(m, c.TenantID); err != nil {
			return err
		}
		now := clock.Ms(m.At)
		size, err := audience(t, c.TenantID, c.SegmentID, now)
		if err != nil {
			return err
		}
		if why := rules.CampaignLaunchBlocker(c, size); why != "" {
			return refuse(why)
		}
		if clock.Ms(c.StartAt) > now {
			c.Status = "scheduled"
		} else {
			c.Status = "running"
		}
		if clock.Ms(c.EndAt) < now {
			c.EndAt = clock.Iso(clock.FromMs(now + 14*clock.Day))
		}
		return t.put("campaigns", c.ID, c)
	})
}

// PauseCampaign is campaigns/pause.
func (s *Service) PauseCampaign(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		c, err := lock[domain.Campaign](t, "campaigns", id, "campaign")
		if err != nil {
			return err
		}
		if err := access(m, c.TenantID); err != nil {
			return err
		}
		if c.Status != "running" {
			return nil
		}
		c.Status = "paused"
		return t.put("campaigns", c.ID, c)
	})
}

// SaveAutomation is automations/save; the server stamps updatedAt.
func (s *Service) SaveAutomation(ctx context.Context, m Meta, a domain.Automation) (*Delta, error) {
	if err := access(m, a.TenantID); err != nil {
		return nil, err
	}
	a.UpdatedAt = m.At
	return s.run(ctx, func(t *tx) error { return t.put("automations", a.ID, a) })
}

// SetAutomationStatus is automations/setStatus.
func (s *Service) SetAutomationStatus(ctx context.Context, m Meta, id, status string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		a, err := lock[domain.Automation](t, "automations", id, "automation")
		if err != nil {
			return err
		}
		if err := access(m, a.TenantID); err != nil {
			return err
		}
		a.Status = status
		a.UpdatedAt = m.At
		return t.put("automations", a.ID, a)
	})
}

// SavePromotion is promotions/save.
func (s *Service) SavePromotion(ctx context.Context, m Meta, p domain.Promotion) (*Delta, error) {
	if err := access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("promotions", p.ID, p) })
}

// SetPromotionStatus is promotions/setStatus.
func (s *Service) SetPromotionStatus(ctx context.Context, m Meta, id, status string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		p, err := lock[domain.Promotion](t, "promotions", id, "promotion")
		if err != nil {
			return err
		}
		if err := access(m, p.TenantID); err != nil {
			return err
		}
		p.Status = status
		return t.put("promotions", p.ID, p)
	})
}
