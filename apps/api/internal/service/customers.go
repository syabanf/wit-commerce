package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// SaveCustomer is customers/save.
func (s *Service) SaveCustomer(ctx context.Context, m Meta, c domain.Customer) (*Delta, error) {
	if err := access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error {
		if _, err := store.Get[domain.Customer](t.ctx, t.Tx, "customers", c.ID); errors.Is(err, store.ErrNotFound) {
			t.created[c.ID] = true
			t.emit("customer.created", c)
		}
		return t.put("customers", c.ID, c)
	})
}

func noteEvent(c domain.Customer, kind, label, at, by string) domain.CustomerEvent {
	return domain.CustomerEvent{
		ID: ids.New("ev"), TenantID: c.TenantID, CustomerID: c.ID, Kind: kind, At: at, Label: label,
		ProductID: nil, OrderID: nil, CampaignID: nil, By: &by,
	}
}

// NoteCustomer is customers/note.
func (s *Service) NoteCustomer(ctx context.Context, m Meta, id, note string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		c, err := get[domain.Customer](t, "customers", id, "customer")
		if err != nil {
			return err
		}
		if err := access(m, c.TenantID); err != nil {
			return err
		}
		e := noteEvent(c, "note", note, m.At, m.by())
		return t.put("customerEvents", e.ID, e)
	})
}

// AddPoints is customers/addPoints; the balance never goes below zero.
func (s *Service) AddPoints(ctx context.Context, m Meta, id string, points int, reason string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		c, err := lock[domain.Customer](t, "customers", id, "customer")
		if err != nil {
			return err
		}
		if err := access(m, c.TenantID); err != nil {
			return err
		}
		if c.Points+points < 0 {
			return refuse(fmt.Sprintf("%s has only %d points.", c.Name, c.Points))
		}
		sign := ""
		if points > 0 {
			sign = "+"
		}
		e := noteEvent(c, "points_earned", fmt.Sprintf("%s%d points · %s", sign, points, reason), m.At, m.by())
		c.Points += points
		if err := t.put("customers", c.ID, c); err != nil {
			return err
		}
		return t.put("customerEvents", e.ID, e)
	})
}

// SaveSegment is segments/save.
func (s *Service) SaveSegment(ctx context.Context, m Meta, seg domain.Segment) (*Delta, error) {
	if err := access(m, seg.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("segments", seg.ID, seg) })
}

// RemoveSegment is segments/remove.
func (s *Service) RemoveSegment(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		seg, err := get[domain.Segment](t, "segments", id, "segment")
		if err != nil {
			return err
		}
		if err := access(m, seg.TenantID); err != nil {
			return err
		}
		campaigns, err := tenantRows[domain.Campaign](t, "campaigns", seg.TenantID)
		if err != nil {
			return err
		}
		if why := rules.SegmentRemoveBlocker(seg, campaigns); why != "" {
			return refuse(why)
		}
		return t.del("segments", seg.ID)
	})
}

// SaveLead is leads/save; the server stamps updatedAt.
func (s *Service) SaveLead(ctx context.Context, m Meta, l domain.Lead) (*Delta, error) {
	if err := access(m, l.TenantID); err != nil {
		return nil, err
	}
	l.UpdatedAt = m.At
	return s.run(ctx, func(t *tx) error { return t.put("leads", l.ID, l) })
}

// MoveLead is leads/move.
func (s *Service) MoveLead(ctx context.Context, m Meta, id, stage string, lostReason *string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		l, err := lock[domain.Lead](t, "leads", id, "lead")
		if err != nil {
			return err
		}
		if err := access(m, l.TenantID); err != nil {
			return err
		}
		if why := rules.LeadMoveBlocker(l, stage); why != "" {
			return refuse(why)
		}
		l.Stage = stage
		l.UpdatedAt = m.At
		l.LostReason = nil
		if stage == "lost" {
			l.LostReason = lostReason
		}
		return t.put("leads", l.ID, l)
	})
}

// AssignTicket is tickets/assign.
func (s *Service) AssignTicket(ctx context.Context, m Meta, id string, assigneeID *string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		tk, err := lock[domain.Ticket](t, "tickets", id, "ticket")
		if err != nil {
			return err
		}
		if err := access(m, tk.TenantID); err != nil {
			return err
		}
		tk.AssigneeID = assigneeID
		return t.put("tickets", tk.ID, tk)
	})
}

// ResolveTicket is tickets/resolve.
func (s *Service) ResolveTicket(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		tk, err := lock[domain.Ticket](t, "tickets", id, "ticket")
		if err != nil {
			return err
		}
		if err := access(m, tk.TenantID); err != nil {
			return err
		}
		tk.Status = "resolved"
		tk.ResolvedAt = ptr(m.At)
		return t.put("tickets", tk.ID, tk)
	})
}
