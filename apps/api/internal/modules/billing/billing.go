// Package billing owns the plan catalog, plan requests and invoices. A plan sets how much a brand
// may hold: products, staff accounts, sellers, warehouses, assistant questions a day, display
// currencies and media storage. It writes the plan_settings, plan_requests and invoices tables and
// owns no collection: the facade counts what a brand uses and changes tenant.plan.
package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Billing runs the plan and invoice actions.
type Billing struct {
	*kernel.Runtime
}

// Limits is what one plan allows. The JSON keys are the limit keys the console and the API share.
type Limits struct {
	Products        int `json:"products"`
	Staff           int `json:"staff"`
	Sellers         int `json:"sellers"`
	Warehouses      int `json:"warehouses"`
	AssistantPerDay int `json:"assistantPerDay"`
	Currencies      int `json:"currencies"`
	MediaMB         int `json:"mediaMb"`
}

// Limit keys, as they appear in Limits and Usage.
const (
	Products        = "products"
	Staff           = "staff"
	Sellers         = "sellers"
	Warehouses      = "warehouses"
	AssistantPerDay = "assistantPerDay"
	Currencies      = "currencies"
	MediaMB         = "mediaMb"
)

// Of reads one limit by its key.
func (l Limits) Of(key string) int {
	switch key {
	case Products:
		return l.Products
	case Staff:
		return l.Staff
	case Sellers:
		return l.Sellers
	case Warehouses:
		return l.Warehouses
	case AssistantPerDay:
		return l.AssistantPerDay
	case Currencies:
		return l.Currencies
	case MediaMB:
		return l.MediaMB
	}
	return 0
}

// Plan is one plan as it applies now: the defaults, or what a platform admin saved over them.
type Plan struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Price is rupiah a month; 0 means the plan is free and gets no invoices.
	Price  int64  `json:"price"`
	Limits Limits `json:"limits"`
	// UpdatedAt and UpdatedBy describe the saved override; null while the defaults apply.
	UpdatedAt *string `json:"updatedAt"`
	UpdatedBy *string `json:"updatedBy"`
}

// IDs lists the plans from smallest to largest.
var IDs = []string{"starter", "growth", "enterprise"}

// Defaults mirrors PLAN_DEFAULTS in packages/fixtures/src/plans.ts; plans_test.go compares them.
// A platform admin changes them per installation in Settings, Plans.
var Defaults = map[string]Plan{
	"starter": {ID: "starter", Name: "Starter", Price: 0,
		Limits: Limits{Products: 50, Staff: 3, Sellers: 5, Warehouses: 1, AssistantPerDay: 50, Currencies: 2, MediaMB: 500}},
	"growth": {ID: "growth", Name: "Growth", Price: 750_000,
		Limits: Limits{Products: 500, Staff: 15, Sellers: 25, Warehouses: 3, AssistantPerDay: 500, Currencies: 5, MediaMB: 5_000}},
	"enterprise": {ID: "enterprise", Name: "Enterprise", Price: 3_500_000,
		Limits: Limits{Products: 5_000, Staff: 100, Sellers: 200, Warehouses: 20, AssistantPerDay: 2_000, Currencies: 9, MediaMB: 50_000}},
}

// Valid reports whether a plan id exists.
func Valid(id string) bool { return slices.Contains(IDs, id) }

// Catalog lists the plans as they apply now, smallest first.
func Catalog(ctx context.Context, q store.Querier) ([]Plan, error) {
	out := make([]Plan, 0, len(IDs))
	for _, id := range IDs {
		out = append(out, Defaults[id])
	}
	rows, err := q.Query(ctx, `select plan, price, limits, updated_by, updated_at from plan_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, by string
		var price int64
		var raw []byte
		var at time.Time
		if err := rows.Scan(&id, &price, &raw, &by, &at); err != nil {
			return nil, err
		}
		i := slices.Index(IDs, id)
		if i < 0 {
			continue
		}
		if err := json.Unmarshal(raw, &out[i].Limits); err != nil {
			return nil, err
		}
		out[i].Price, out[i].UpdatedAt, out[i].UpdatedBy = price, kernel.Ptr(clock.Iso(at)), &by
	}
	return out, rows.Err()
}

// PlanOf is one plan as it applies now. A plan id the catalog does not hold reads as the smallest
// plan, so a mistyped label never lifts every limit.
func PlanOf(ctx context.Context, q store.Querier, id string) (Plan, error) {
	plans, err := Catalog(ctx, q)
	if err != nil {
		return Plan{}, err
	}
	return plans[max(0, slices.Index(IDs, id))], nil
}

// PlanInput replaces a plan's monthly price and limits.
type PlanInput struct {
	Price  int64  `json:"price"`
	Limits Limits `json:"limits"`
}

// maxLimit keeps a typo from saving a number the console cannot show.
const maxLimit = 1_000_000_000

// SavePlan stores a platform admin's price and limits for one plan.
func (b *Billing) SavePlan(ctx context.Context, m kernel.Meta, id string, in PlanInput) error {
	if !Valid(id) {
		return kernel.NotFound{What: "plan"}
	}
	if in.Price < 0 || in.Price > maxLimit {
		return kernel.Invalid{Reason: "Enter a monthly price of 0 or more."}
	}
	for _, key := range LimitKeys {
		if n := in.Limits.Of(key); n < 0 || n > maxLimit {
			return kernel.Invalid{Reason: "Enter every limit as a number of 0 or more."}
		}
	}
	// A store always has its owner and its first warehouse.
	if in.Limits.Staff < 1 || in.Limits.Warehouses < 1 {
		return kernel.Invalid{Reason: "A plan needs room for at least 1 staff account and 1 warehouse."}
	}
	raw, err := json.Marshal(in.Limits)
	if err != nil {
		return err
	}
	_, err = b.DB.Pool.Exec(ctx, `insert into plan_settings (plan, price, limits, updated_by, updated_at) values ($1, $2, $3, $4, $5)
		on conflict (plan) do update set price = excluded.price, limits = excluded.limits,
			updated_by = excluded.updated_by, updated_at = excluded.updated_at`, id, in.Price, raw, m.By(), clock.MustParse(m.At))
	return err
}

// LimitKeys lists the limits in the order the console shows them.
var LimitKeys = []string{Products, Staff, Sellers, Warehouses, AssistantPerDay, Currencies, MediaMB}

// limitNouns names each limit for one and for many.
var limitNouns = map[string][2]string{
	Products:        {"product", "products"},
	Staff:           {"staff account", "staff accounts"},
	Sellers:         {"seller", "sellers"},
	Warehouses:      {"warehouse", "warehouses"},
	AssistantPerDay: {"assistant question a day", "assistant questions a day"},
	Currencies:      {"display currency", "display currencies"},
	MediaMB:         {"MB of media storage", "MB of media storage"},
}

// LimitCode is the problem code of every refusal a plan limit causes.
const LimitCode = "PLAN_LIMIT"

// LimitReached is the 409 a creation past a limit answers with: it names the limit and the plan.
func LimitReached(p Plan, key string) error {
	n := p.Limits.Of(key)
	noun := limitNouns[key][1]
	if n == 1 {
		noun = limitNouns[key][0]
	}
	return kernel.Conflict{Code: LimitCode, Reason: fmt.Sprintf(
		"The %s plan allows %d %s. Ask for a larger plan in Settings, Plan & usage.", p.Name, n, noun)}
}
