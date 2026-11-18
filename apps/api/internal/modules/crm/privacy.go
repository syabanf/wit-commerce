package crm

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// crm also writes the privacy_requests table: what shoppers ask about their personal data.

// requestKinds are what a shopper may ask about their data.
var requestKinds = map[string]bool{"access": true, "correction": true, "erasure": true, "withdraw_consent": true}

// responseTime is how long the brand has to answer a request (UU PDP Pasal 30, 32, 40, 41).
const responseTime = 72 * time.Hour

// LockCustomer loads a customer for update, for an action another module runs on them.
func LockCustomer(t *kernel.Tx, m kernel.Meta, id string) (domain.Customer, error) {
	c, err := kernel.Lock[domain.Customer](t, "customers", id, "customer")
	if err != nil {
		return c, err
	}
	return c, kernel.Access(m, c.TenantID)
}

// EraseCustomer replaces the personal data crm holds about a customer: the record, the free text in
// its history, and its leads and tickets. The timeline keeps one line saying when it happened.
func EraseCustomer(t *kernel.Tx, m kernel.Meta, c domain.Customer) (domain.Customer, error) {
	c = rules.EraseCustomer(c, m.At)
	if err := t.Put("customers", c.ID, c); err != nil {
		return c, err
	}
	events, err := store.List[domain.CustomerEvent](t.Ctx, t.Tx, "customerEvents", "customer_id = $1 for update", c.ID)
	if err != nil {
		return c, err
	}
	for _, e := range events {
		if rules.ErasedEventKinds[e.Kind] && e.Label != rules.ErasedText {
			e.Label = rules.ErasedText
			if err := t.Put("customerEvents", e.ID, e); err != nil {
				return c, err
			}
		}
	}
	leads, err := store.List[domain.Lead](t.Ctx, t.Tx, "leads", "customer_id = $1 for update", c.ID)
	if err != nil {
		return c, err
	}
	for _, l := range leads {
		erased := l
		erased.Name, erased.Company, erased.Phone, erased.Note = rules.ErasedName, "", "", ""
		if erased != l {
			if err := t.Put("leads", l.ID, erased); err != nil {
				return c, err
			}
		}
	}
	tickets, err := store.List[domain.Ticket](t.Ctx, t.Tx, "tickets", "customer_id = $1 for update", c.ID)
	if err != nil {
		return c, err
	}
	for _, tk := range tickets {
		if tk.Subject != rules.ErasedText {
			tk.Subject = rules.ErasedText
			if err := t.Put("tickets", tk.ID, tk); err != nil {
				return c, err
			}
		}
	}
	if _, err := t.Exec(t.Ctx, `update privacy_requests set note = '' where customer_id = $1`, c.ID); err != nil {
		return c, err
	}
	e := noteEvent(c, "privacy", "Personal data erased", m.At, m.By())
	return c, t.Put("customerEvents", e.ID, e)
}

// SetConsent is customers/setConsent.
func (s *CRM) SetConsent(ctx context.Context, m kernel.Meta, id string, granted bool, source, textVersion string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := LockCustomer(t, m, id)
		if err != nil {
			return err
		}
		return ChangeConsent(t, m, c, granted, source, textVersion)
	})
}

// ChangeConsent records a shopper's answer about marketing messages and puts it on their timeline.
func ChangeConsent(t *kernel.Tx, m kernel.Meta, c domain.Customer, granted bool, source, textVersion string) error {
	if why := rules.ConsentBlocker(c, granted, source, textVersion); why != "" {
		return kernel.Refuse(why)
	}
	if !granted && c.MarketingConsent != nil {
		textVersion = c.MarketingConsent.TextVersion
	}
	c.MarketingConsent = &domain.MarketingConsent{Granted: granted, At: m.At, Source: source, TextVersion: textVersion}
	if err := t.Put("customers", c.ID, c); err != nil {
		return err
	}
	e := noteEvent(c, "privacy", rules.ConsentLabel(granted, source), m.At, m.By())
	return t.Put("customerEvents", e.ID, e)
}

// OpenPrivacyRequest logs a request with its 3x24 hour deadline.
func OpenPrivacyRequest(t *kernel.Tx, m kernel.Meta, c domain.Customer, kind, note string) (domain.PrivacyRequest, error) {
	if !requestKinds[kind] {
		return domain.PrivacyRequest{}, kernel.Invalid{Reason: "Choose access, correction, erasure or withdraw_consent."}
	}
	if c.ErasedAt != "" {
		return domain.PrivacyRequest{}, kernel.Refuse("This customer's personal data is already erased.")
	}
	var open bool
	if err := t.QueryRow(t.Ctx, `select exists (select 1 from privacy_requests where customer_id = $1 and kind = $2 and status = 'open')`,
		c.ID, kind).Scan(&open); err != nil {
		return domain.PrivacyRequest{}, err
	}
	if open {
		return domain.PrivacyRequest{}, kernel.Refuse("A request of this kind is already open. The store answers it within 3x24 hours.")
	}
	at := clock.MustParse(m.At)
	r := domain.PrivacyRequest{
		ID: ids.New("prq"), TenantID: c.TenantID, CustomerID: c.ID, Kind: kind, Status: "open",
		RequestedAt: m.At, DueAt: clock.Iso(at.Add(responseTime)), Note: note,
	}
	_, err := t.Exec(t.Ctx, `insert into privacy_requests (id, tenant_id, customer_id, kind, status, requested_at, due_at, note)
		values ($1, $2, $3, $4, $5, $6, $7, $8)`, r.ID, r.TenantID, r.CustomerID, r.Kind, r.Status, at, at.Add(responseTime), r.Note)
	return r, err
}

const privacyColumns = `id, tenant_id, customer_id, kind, status, requested_at, due_at, completed_at, handled_by, note`

func scanPrivacyRequest(row pgx.Row) (domain.PrivacyRequest, error) {
	var r domain.PrivacyRequest
	var requested, due time.Time
	var completed *time.Time
	if err := row.Scan(&r.ID, &r.TenantID, &r.CustomerID, &r.Kind, &r.Status, &requested, &due, &completed, &r.HandledBy, &r.Note); err != nil {
		return r, err
	}
	r.RequestedAt, r.DueAt = clock.Iso(requested), clock.Iso(due)
	if completed != nil {
		r.CompletedAt = kernel.Ptr(clock.Iso(*completed))
	}
	return r, nil
}

// LockPrivacyRequest loads a request for update, checked against the principal.
func LockPrivacyRequest(t *kernel.Tx, m kernel.Meta, id string) (domain.PrivacyRequest, error) {
	r, err := scanPrivacyRequest(t.QueryRow(t.Ctx, `select `+privacyColumns+` from privacy_requests where id = $1 for update`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return r, kernel.NotFound{What: "privacy request"}
	}
	if err != nil {
		return r, err
	}
	return r, kernel.Access(m, r.TenantID)
}

// CompletePrivacyRequests closes the customer's open requests of one kind. With none open it logs a
// completed one, so an erasure staff start without a request still leaves a record.
func CompletePrivacyRequests(t *kernel.Tx, m kernel.Meta, c domain.Customer, kind, note string) error {
	tag, err := t.Exec(t.Ctx, `update privacy_requests set status = 'completed', completed_at = $3, handled_by = $4,
		note = case when $5 = '' then note else $5 end
		where customer_id = $1 and kind = $2 and status = 'open'`, c.ID, kind, clock.MustParse(m.At), m.By(), note)
	if err != nil || tag.RowsAffected() > 0 {
		return err
	}
	at := clock.MustParse(m.At)
	_, err = t.Exec(t.Ctx, `insert into privacy_requests (id, tenant_id, customer_id, kind, status, requested_at, due_at, completed_at, handled_by, note)
		values ($1, $2, $3, $4, 'completed', $5, $6, $5, $7, $8)`, ids.New("prq"), c.TenantID, c.ID, kind, at, at.Add(responseTime), m.By(), note)
	return err
}

// PrivacyRequestFilter narrows a request list.
type PrivacyRequestFilter struct {
	TenantID   string
	CustomerID string
	// Status is open, completed or "" for both.
	Status string
}

// PrivacyRequests lists requests, open ones by deadline and the rest newest first.
func PrivacyRequests(ctx context.Context, q store.Querier, f PrivacyRequestFilter) ([]domain.PrivacyRequest, error) {
	rows, err := q.Query(ctx, `select `+privacyColumns+` from privacy_requests
		where tenant_id = $1 and ($2 = '' or customer_id = $2) and ($3 = '' or status = $3)
		order by status = 'completed', case when status = 'open' then due_at end, requested_at desc limit 500`,
		f.TenantID, f.CustomerID, f.Status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.PrivacyRequest{}
	for rows.Next() {
		r, err := scanPrivacyRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CustomerRecords is what crm holds about one customer, for an access request's export.
type CustomerRecords struct {
	Customer domain.Customer         `json:"customer"`
	Events   []domain.CustomerEvent  `json:"events"`
	Leads    []domain.Lead           `json:"leads"`
	Tickets  []domain.Ticket         `json:"tickets"`
	Requests []domain.PrivacyRequest `json:"privacyRequests"`
}

// Records reads what crm holds about one customer.
func Records(ctx context.Context, q store.Querier, c domain.Customer) (CustomerRecords, error) {
	out := CustomerRecords{Customer: c}
	var err error
	if out.Events, err = store.List[domain.CustomerEvent](ctx, q, "customerEvents", "customer_id = $1", c.ID); err != nil {
		return out, err
	}
	if out.Leads, err = store.List[domain.Lead](ctx, q, "leads", "customer_id = $1", c.ID); err != nil {
		return out, err
	}
	if out.Tickets, err = store.List[domain.Ticket](ctx, q, "tickets", "customer_id = $1", c.ID); err != nil {
		return out, err
	}
	out.Requests, err = PrivacyRequests(ctx, q, PrivacyRequestFilter{TenantID: c.TenantID, CustomerID: c.ID})
	return out, err
}
