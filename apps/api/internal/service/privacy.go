package service

import (
	"context"
	"errors"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/marketing"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Personal data crosses modules: the customer, history, leads and tickets are crm's, orders and
// returns are the orders module's, the shopper's password is identity's and their email links are
// notifications'. The facade erases them in one transaction, so an erasure is all or nothing.

// EraseCustomer is customers/erase: it replaces the customer's personal data with placeholders
// everywhere and keeps amounts, items, dates and payments for the retention duty of PP 80/2019
// Pasal 25.
func (s *Service) EraseCustomer(ctx context.Context, m Meta, id, note string) (*Delta, error) {
	return s.Run(ctx, func(t *tx) error {
		c, err := crm.LockCustomer(t, m, id)
		if err != nil {
			return err
		}
		return erase(t, m, c, note)
	})
}

func erase(t *tx, m Meta, c domain.Customer, note string) error {
	placed, returns, err := orders.CustomerOrders(t.Ctx, t.Tx, c.ID, true)
	if err != nil {
		return err
	}
	if why := rules.CustomerEraseBlocker(c, placed, returns); why != "" {
		return kernel.Refuse(why)
	}
	if _, err := crm.EraseCustomer(t, m, c); err != nil {
		return err
	}
	if err := orders.EraseCustomer(t, placed, returns); err != nil {
		return err
	}
	if err := identity.RevokeCustomer(t, c.ID); err != nil {
		return err
	}
	if err := notifications.ForgetCustomer(t.Ctx, t.Tx, c.ID, c.Email); err != nil {
		return err
	}
	if err := t.ScrubDeliveries(c.TenantID, rules.ErasedText, c.Email, c.Phone, c.Name); err != nil {
		return err
	}
	// Live changes too large for a NOTIFY wait here for ten minutes; drop the ones that name the
	// customer.
	if c.Email != "" {
		if _, err := t.Exec(t.Ctx, `delete from event_log where strpos(change::text, $1) > 0`, c.Email); err != nil {
			return err
		}
	}
	return crm.CompletePrivacyRequests(t, m, c, "erasure", note)
}

// RequestPrivacy logs a shopper's request about their data, from the shopper or from staff who took
// it by phone or email.
func (s *Service) RequestPrivacy(ctx context.Context, m Meta, customerID, kind, note string) (domain.PrivacyRequest, error) {
	var r domain.PrivacyRequest
	_, err := s.Run(ctx, func(t *tx) error {
		c, err := crm.LockCustomer(t, m, customerID)
		if err != nil {
			return err
		}
		r, err = crm.OpenPrivacyRequest(t, m, c, kind, note)
		return err
	})
	return r, err
}

// CompletePrivacyRequest answers a request: an erasure erases, a consent withdrawal withdraws, and
// access and correction close once staff have sent the export or fixed the record.
func (s *Service) CompletePrivacyRequest(ctx context.Context, m Meta, id, note string) (*Delta, error) {
	return s.Run(ctx, func(t *tx) error {
		r, err := crm.LockPrivacyRequest(t, m, id)
		if err != nil {
			return err
		}
		if r.Status != "open" {
			return kernel.Refuse("This request is already completed.")
		}
		c, err := crm.LockCustomer(t, m, r.CustomerID)
		if err != nil {
			return err
		}
		switch {
		case r.Kind == "erasure" && c.ErasedAt == "":
			return erase(t, m, c, note)
		case r.Kind == "withdraw_consent" && rules.MarketingAllowed(c):
			if err := crm.ChangeConsent(t, m, c, false, "request", ""); err != nil {
				return err
			}
		}
		return crm.CompletePrivacyRequests(t, m, c, r.Kind, note)
	})
}

// Unsubscribe withdraws marketing consent from the link in a marketing email. A second click
// changes nothing and still succeeds.
func (s *Service) Unsubscribe(ctx context.Context, at, customerID string) error {
	m := Meta{P: auth.System, At: at}
	_, err := s.Run(ctx, func(t *tx) error {
		c, err := crm.LockCustomer(t, m, customerID)
		if err != nil || !rules.MarketingAllowed(c) {
			return err
		}
		return crm.ChangeConsent(t, m, c, false, "unsubscribe", "")
	})
	return err
}

// CampaignAudience is the marketing module's count of who a campaign reaches.
type CampaignAudience = marketing.CampaignAudience

// CustomerExport is everything the store holds about one customer, for an access request.
type CustomerExport struct {
	ExportedAt string `json:"exportedAt"`
	crm.CustomerRecords
	Orders  []domain.Order       `json:"orders"`
	Returns []domain.OrderReturn `json:"returns"`
}

// ExportCustomer reads everything the store holds about one customer.
func (s *Service) ExportCustomer(ctx context.Context, m Meta, customerID string) (CustomerExport, error) {
	out := CustomerExport{ExportedAt: m.At}
	c, err := store.Get[domain.Customer](ctx, s.DB.Pool, "customers", customerID)
	if errors.Is(err, store.ErrNotFound) {
		return out, kernel.NotFound{What: "customer"}
	}
	if err != nil {
		return out, err
	}
	if err := kernel.Access(m, c.TenantID); err != nil {
		return out, err
	}
	if out.CustomerRecords, err = crm.Records(ctx, s.DB.Pool, c); err != nil {
		return out, err
	}
	out.Orders, out.Returns, err = orders.CustomerOrders(ctx, s.DB.Pool, c.ID, false)
	return out, err
}
