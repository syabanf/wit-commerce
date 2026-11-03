// Package service holds the business rules: every reducer action of packages/fixtures as one
// transactional method that reads what it needs, applies the same checks, writes the rows it changed
// and reports them as a Delta.
package service

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Service runs actions against the database.
type Service struct {
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

func (m Meta) by() string { return m.P.By() }

// Delta lists the rows an action wrote and the ids it removed, per collection. The HTTP layer
// returns it to the caller and broadcasts it to every other client.
type Delta struct {
	Upserts map[string][]any    `json:"upserts"`
	Removes map[string][]string `json:"removes"`
}

func newDelta() *Delta {
	return &Delta{Upserts: map[string][]any{}, Removes: map[string][]string{}}
}

// Empty reports whether the action changed nothing.
func (d *Delta) Empty() bool { return len(d.Upserts) == 0 && len(d.Removes) == 0 }

// Collections lists what the delta touches.
func (d *Delta) Collections() []string {
	seen := map[string]bool{}
	var out []string
	for _, c := range store.Collections {
		if (len(d.Upserts[c]) > 0 || len(d.Removes[c]) > 0) && !seen[c] {
			seen[c] = true
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

func refuse(reason string) error { return Refusal{Reason: reason} }

// tx is the shape of every action: a transaction that fills a delta.
type tx struct {
	ctx context.Context
	pgx.Tx
	d *Delta
	// events and created feed the webhook outbox.
	events  []outboxEvent
	created map[string]bool
}

func (s *Service) run(ctx context.Context, fn func(t *tx) error) (*Delta, error) {
	d := newDelta()
	err := pgx.BeginFunc(ctx, s.DB.Pool, func(ptx pgx.Tx) error {
		t := &tx{ctx: ctx, Tx: ptx, d: d, created: map[string]bool{}}
		if err := fn(t); err != nil {
			return err
		}
		return t.enqueue(s.Clock.NowIso())
	})
	if err != nil {
		return nil, err
	}
	return d, nil
}

// put writes a row and records it.
func (t *tx) put(collection, id string, v any) error {
	if err := store.Put(t.ctx, t.Tx, collection, id, v); err != nil {
		return err
	}
	t.d.Upserts[collection] = append(t.d.Upserts[collection], v)
	return nil
}

// del removes a row and records it.
func (t *tx) del(collection, id string) error {
	if err := store.Delete(t.ctx, t.Tx, collection, id); err != nil {
		return err
	}
	t.d.Removes[collection] = append(t.d.Removes[collection], id)
	return nil
}

// lock loads a row for update or returns NotFound.
func lock[T any](t *tx, collection, id, what string) (T, error) {
	v, err := store.Lock[T](t.ctx, t.Tx, collection, id)
	if errors.Is(err, store.ErrNotFound) {
		return v, NotFound{What: what}
	}
	return v, err
}

// get loads a row or returns NotFound.
func get[T any](t *tx, collection, id, what string) (T, error) {
	v, err := store.Get[T](t.ctx, t.Tx, collection, id)
	if errors.Is(err, store.ErrNotFound) {
		return v, NotFound{What: what}
	}
	return v, err
}

// tenantRows lists a tenant's rows of one collection.
func tenantRows[T any](t *tx, collection, tenantID string) ([]T, error) {
	return store.ListTenant[T](t.ctx, t.Tx, collection, tenantID)
}

// access refuses principals outside the tenant.
func access(m Meta, tenantID string) error {
	if !m.P.CanAccess(tenantID) {
		return Forbidden{TenantID: tenantID}
	}
	return nil
}

// --- shared row builders (the reducer's helpers) ---

func customerEvent(o domain.Order, kind, label, at, by string) domain.CustomerEvent {
	return domain.CustomerEvent{
		ID: ids.New("ev"), TenantID: o.TenantID, CustomerID: o.CustomerID, Kind: kind, At: at, Label: label,
		ProductID: nil, OrderID: &o.ID, CampaignID: nil, By: &by,
	}
}

func orderEvent(at, by string, status *string, note string) domain.OrderEvent {
	return domain.OrderEvent{ID: ids.New("oev"), At: at, By: by, Status: status, Note: note}
}

func ptr[T any](v T) *T { return &v }

// stockAt loads and locks the levels of one warehouse, plus everything the blockers read.
func stockAt(t *tx, tenantID, warehouseID string) (stock []domain.StockLevel, modifierStock []domain.ModifierStockLevel, err error) {
	stock, err = store.List[domain.StockLevel](t.ctx, t.Tx, "stock",
		"tenant_id = $1 and warehouse_id = $2 for update", tenantID, warehouseID)
	if err != nil {
		return nil, nil, err
	}
	modifierStock, err = store.List[domain.ModifierStockLevel](t.ctx, t.Tx, "modifierStock",
		"tenant_id = $1 and warehouse_id = $2 for update", tenantID, warehouseID)
	return stock, modifierStock, err
}
