package crm

import (
	"context"
	"errors"
	"fmt"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// SaveCustomer is customers/save.
func (s *CRM) SaveCustomer(ctx context.Context, m kernel.Meta, c domain.Customer) (*kernel.Delta, error) {
	if err := kernel.Access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		if _, err := store.Get[domain.Customer](t.Ctx, t.Tx, "customers", c.ID); errors.Is(err, store.ErrNotFound) {
			t.Created[c.ID] = true
			t.Emit("customer.created", c)
		}
		return t.Put("customers", c.ID, c)
	})
}

func noteEvent(c domain.Customer, kind, label, at, by string) domain.CustomerEvent {
	return domain.CustomerEvent{
		ID: ids.New("ev"), TenantID: c.TenantID, CustomerID: c.ID, Kind: kind, At: at, Label: label,
		ProductID: nil, OrderID: nil, CampaignID: nil, By: &by,
	}
}

// NoteCustomer is customers/note.
func (s *CRM) NoteCustomer(ctx context.Context, m kernel.Meta, id, note string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Get[domain.Customer](t, "customers", id, "customer")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		e := noteEvent(c, "note", note, m.At, m.By())
		return t.Put("customerEvents", e.ID, e)
	})
}

// AddPoints is customers/addPoints; the balance never goes below zero.
func (s *CRM) AddPoints(ctx context.Context, m kernel.Meta, id string, points int, reason string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Lock[domain.Customer](t, "customers", id, "customer")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		if c.Points+points < 0 {
			return kernel.Refuse(fmt.Sprintf("%s has only %d points.", c.Name, c.Points))
		}
		sign := ""
		if points > 0 {
			sign = "+"
		}
		e := noteEvent(c, "points_earned", fmt.Sprintf("%s%d points · %s", sign, points, reason), m.At, m.By())
		c.Points += points
		if err := t.Put("customers", c.ID, c); err != nil {
			return err
		}
		return t.Put("customerEvents", e.ID, e)
	})
}

// SaveSegment is segments/save.
func (s *CRM) SaveSegment(ctx context.Context, m kernel.Meta, seg domain.Segment) (*kernel.Delta, error) {
	if err := kernel.Access(m, seg.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("segments", seg.ID, seg) })
}

// RemoveSegment is segments/remove.
func (s *CRM) RemoveSegment(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		seg, err := kernel.Get[domain.Segment](t, "segments", id, "segment")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, seg.TenantID); err != nil {
			return err
		}
		campaigns, err := s.SegmentUsers.SegmentCampaigns(t, seg.TenantID)
		if err != nil {
			return err
		}
		if why := rules.SegmentRemoveBlocker(seg, campaigns); why != "" {
			return kernel.Refuse(why)
		}
		return t.Del("segments", seg.ID)
	})
}

// SaveLead is leads/save; the server stamps updatedAt.
func (s *CRM) SaveLead(ctx context.Context, m kernel.Meta, l domain.Lead) (*kernel.Delta, error) {
	if err := kernel.Access(m, l.TenantID); err != nil {
		return nil, err
	}
	l.UpdatedAt = m.At
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("leads", l.ID, l) })
}

// MoveLead is leads/move.
func (s *CRM) MoveLead(ctx context.Context, m kernel.Meta, id, stage string, lostReason *string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		l, err := kernel.Lock[domain.Lead](t, "leads", id, "lead")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, l.TenantID); err != nil {
			return err
		}
		if why := rules.LeadMoveBlocker(l, stage); why != "" {
			return kernel.Refuse(why)
		}
		l.Stage = stage
		l.UpdatedAt = m.At
		l.LostReason = nil
		if stage == "lost" {
			l.LostReason = lostReason
		}
		return t.Put("leads", l.ID, l)
	})
}

// AssignTicket is tickets/assign.
func (s *CRM) AssignTicket(ctx context.Context, m kernel.Meta, id string, assigneeID *string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		tk, err := kernel.Lock[domain.Ticket](t, "tickets", id, "ticket")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, tk.TenantID); err != nil {
			return err
		}
		tk.AssigneeID = assigneeID
		return t.Put("tickets", tk.ID, tk)
	})
}

// ResolveTicket is tickets/resolve.
func (s *CRM) ResolveTicket(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		tk, err := kernel.Lock[domain.Ticket](t, "tickets", id, "ticket")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, tk.TenantID); err != nil {
			return err
		}
		tk.Status = "resolved"
		tk.ResolvedAt = kernel.Ptr(m.At)
		return t.Put("tickets", tk.ID, tk)
	})
}
