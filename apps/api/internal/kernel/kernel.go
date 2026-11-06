// Package kernel is what every module shares: the transaction an action runs in, the delta it
// fills, the errors the HTTP layer maps to statuses, and the webhook outbox written in the same
// transaction. Modules own their collections; the kernel owns none.
package kernel

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Runtime is what a module needs to run actions.
type Runtime struct {
	DB    *store.DB
	Clock clock.Clock
	// Vault encrypts connector secrets.
	Vault *auth.Vault
	// HTTP makes outbound calls: webhook deliveries and provider checks.
	HTTP *http.Client
	// AllowInternalWebhooks permits http:// endpoints, for development.
	AllowInternalWebhooks bool
}

// Meta is who performs an action and when, stamped on every event and move it writes.
type Meta struct {
	P  auth.Principal
	At string
}

// By names the actor on the rows an action writes.
func (m Meta) By() string { return m.P.By() }

// Delta lists the rows an action wrote and the ids it removed, per collection. The HTTP layer
// returns it to the caller and broadcasts it to every other client.
type Delta struct {
	Upserts map[string][]any    `json:"upserts"`
	Removes map[string][]string `json:"removes"`
}

// NewDelta makes an empty delta.
func NewDelta() *Delta {
	return &Delta{Upserts: map[string][]any{}, Removes: map[string][]string{}}
}

// Empty reports whether the action changed nothing.
func (d *Delta) Empty() bool { return len(d.Upserts) == 0 && len(d.Removes) == 0 }

// Collections lists what the delta touches.
func (d *Delta) Collections() []string {
	var out []string
	for _, c := range store.Collections {
		if len(d.Upserts[c]) > 0 || len(d.Removes[c]) > 0 {
			out = append(out, c)
		}
	}
	return out
}

// Errors the HTTP layer maps to statuses.
type (
	// Refusal is a business rule saying no (409), with the sentence the UI shows.
	Refusal struct{ Reason string }
	// NotFound is a missing row (404).
	NotFound struct{ What string }
	// Invalid is a request the rules cannot act on (422).
	Invalid struct{ Reason string }
	// Forbidden is a tenant the principal may not touch (403).
	Forbidden struct{ TenantID string }
)

func (e Refusal) Error() string   { return e.Reason }
func (e NotFound) Error() string  { return e.What + " not found" }
func (e Invalid) Error() string   { return e.Reason }
func (e Forbidden) Error() string { return "no access to tenant " + e.TenantID }

// Refuse is a business rule saying no.
func Refuse(reason string) error { return Refusal{Reason: reason} }

// Access refuses principals outside the tenant.
func Access(m Meta, tenantID string) error {
	if !m.P.CanAccess(tenantID) {
		return Forbidden{TenantID: tenantID}
	}
	return nil
}

// Tx is the shape of every action: a transaction that fills a delta.
type Tx struct {
	Ctx context.Context
	pgx.Tx
	D *Delta
	// Created marks rows this action made, so the outbox reports them once.
	Created map[string]bool
	events  []outboxEvent
}

// Run executes an action in one transaction, projects the read models from its delta and queues
// its webhooks, so the write, the read side and the outbox commit together.
func (r *Runtime) Run(ctx context.Context, fn func(t *Tx) error) (*Delta, error) {
	d := NewDelta()
	err := pgx.BeginFunc(ctx, r.DB.Pool, func(ptx pgx.Tx) error {
		t := &Tx{Ctx: ctx, Tx: ptx, D: d, Created: map[string]bool{}}
		if err := fn(t); err != nil {
			return err
		}
		if err := readmodel.Apply(ctx, ptx, d.Upserts, d.Removes); err != nil {
			return err
		}
		return t.enqueue(r.Clock.NowIso())
	})
	if err != nil {
		return nil, err
	}
	return d, nil
}

// Put writes a row and records it.
func (t *Tx) Put(collection, id string, v any) error {
	if err := store.Put(t.Ctx, t.Tx, collection, id, v); err != nil {
		return err
	}
	t.D.Upserts[collection] = append(t.D.Upserts[collection], v)
	return nil
}

// Del removes a row and records it.
func (t *Tx) Del(collection, id string) error {
	if err := store.Delete(t.Ctx, t.Tx, collection, id); err != nil {
		return err
	}
	t.D.Removes[collection] = append(t.D.Removes[collection], id)
	return nil
}

// Lock loads a row for update or returns NotFound.
func Lock[T any](t *Tx, collection, id, what string) (T, error) {
	v, err := store.Lock[T](t.Ctx, t.Tx, collection, id)
	if errors.Is(err, store.ErrNotFound) {
		return v, NotFound{What: what}
	}
	return v, err
}

// Get loads a row or returns NotFound.
func Get[T any](t *Tx, collection, id, what string) (T, error) {
	v, err := store.Get[T](t.Ctx, t.Tx, collection, id)
	if errors.Is(err, store.ErrNotFound) {
		return v, NotFound{What: what}
	}
	return v, err
}

// TenantRows lists a tenant's rows of one collection.
func TenantRows[T any](t *Tx, collection, tenantID string) ([]T, error) {
	return store.ListTenant[T](t.Ctx, t.Tx, collection, tenantID)
}

// Ptr returns a pointer to a copy of v.
func Ptr[T any](v T) *T { return &v }

// CustomerEvent is a history row about an order, for the customer timeline.
func CustomerEvent(o domain.Order, kind, label, at, by string) domain.CustomerEvent {
	return domain.CustomerEvent{
		ID: ids.New("ev"), TenantID: o.TenantID, CustomerID: o.CustomerID, Kind: kind, At: at, Label: label,
		ProductID: nil, OrderID: &o.ID, CampaignID: nil, By: &by,
	}
}

// OrderEvent is a step on an order's own timeline.
func OrderEvent(at, by string, status *string, note string) domain.OrderEvent {
	return domain.OrderEvent{ID: ids.New("oev"), At: at, By: by, Status: status, Note: note}
}
