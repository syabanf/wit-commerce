package crm

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

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
		// Consent and erasure change only through their own actions, so an edit cannot forge them.
		prev, err := store.Get[domain.Customer](t.Ctx, t.Tx, "customers", c.ID)
		c.MarketingConsent, c.ErasedAt = prev.MarketingConsent, prev.ErasedAt
		if errors.Is(err, store.ErrNotFound) {
			t.Created[c.ID] = true
			t.Emit("customer.created", c)
		} else if err != nil {
			return err
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

// Complaint is what a shopper sends with the storefront's complaint form. CustomerID is empty for a
// guest; OrderID, when set, is one of that shopper's own orders, which the caller checked.
type Complaint struct {
	ID         string               `json:"id"`
	TenantID   string               `json:"tenantId"`
	CustomerID *string              `json:"customerId"`
	OrderID    *string              `json:"orderId"`
	Subject    string               `json:"subject"`
	Message    string               `json:"message"`
	Contact    domain.TicketContact `json:"contact"`
}

// OpenTicket is tickets/open: a complaint ticket due complaintDays working days from now, skipping
// the closed days. tenantCode prefixes the ticket's code.
func (s *CRM) OpenTicket(ctx context.Context, m kernel.Meta, c Complaint, tenantCode string, complaintDays int, closed rules.ClosedDays) (*kernel.Delta, error) {
	if err := kernel.Access(m, c.TenantID); err != nil {
		return nil, err
	}
	if c.ID == "" {
		return nil, kernel.Invalid{Reason: "A complaint needs an id."}
	}
	if why := rules.ComplaintBlocker(c.Subject, c.Message, c.Contact); why != "" {
		return nil, kernel.Invalid{Reason: why}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		if _, err := store.Get[domain.Ticket](t.Ctx, t.Tx, "tickets", c.ID); err == nil {
			return kernel.Refuse("This complaint was already sent.")
		} else if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		rows, err := t.Query(t.Ctx, `select data->>'code' from tickets where tenant_id = $1`, c.TenantID)
		if err != nil {
			return err
		}
		codes, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		customerID := ""
		if c.CustomerID != nil {
			customerID = *c.CustomerID
		}
		contact := rules.TrimContact(c.Contact)
		tk := domain.Ticket{
			ID: c.ID, TenantID: c.TenantID, Code: ids.NextCode(codes, tenantCode+"-T", 4), CustomerID: customerID,
			OrderID: c.OrderID, Kind: "complaint", Status: "open", Subject: strings.TrimSpace(c.Subject), Channel: "web",
			CreatedAt: m.At, SlaDueAt: rules.AddWorkingDays(m.At, complaintDays, closed),
			Message: strings.TrimSpace(c.Message), Contact: &contact,
		}
		t.Created[tk.ID] = true
		return t.Put("tickets", tk.ID, tk)
	})
}
