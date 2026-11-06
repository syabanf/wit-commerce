package httpapi_test

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
)

type metricRow struct {
	ID                  string         `json:"id"`
	CustomerID          string         `json:"customerId"`
	Orders              int            `json:"orders"`
	Spend               int64          `json:"spend"`
	FirstAt             *time.Time     `json:"firstAt"`
	LastAt              *time.Time     `json:"lastAt"`
	ProductCounts       map[string]int `json:"productCounts"`
	LastAbandonedAt     *time.Time     `json:"lastAbandonedAt"`
	LastPurchaseEventAt *time.Time     `json:"lastPurchaseEventAt"`
}

func (e *env) metrics(tenantID string) map[string]metricRow {
	e.t.Helper()
	rows, err := readmodel.CustomerMetricsRows(context.Background(), e.db.Pool, "tenant_id = $1", tenantID)
	if err != nil {
		e.t.Fatal(err)
	}
	out := map[string]metricRow{}
	for _, raw := range rows {
		var m metricRow
		if err := json.Unmarshal(raw, &m); err != nil {
			e.t.Fatal(err)
		}
		out[m.CustomerID] = m
	}
	return out
}

func docs[T any](e *env, table, tenantID string) []T {
	e.t.Helper()
	rows, err := e.db.Pool.Query(context.Background(), `select data from `+table+` where tenant_id = $1`, tenantID)
	if err != nil {
		e.t.Fatal(err)
	}
	var out []T
	for rows.Next() {
		var raw []byte
		_ = rows.Scan(&raw)
		var v T
		_ = json.Unmarshal(raw, &v)
		out = append(out, v)
	}
	return out
}

// TestCustomerMetricsMatchTheDocuments computes the metrics the way customerMetrics and
// abandonedCheckouts in packages/fixtures do, from every order and event, and compares.
func TestCustomerMetricsMatchTheDocuments(t *testing.T) {
	e := setup(t)
	sold := map[string]bool{"paid": true, "processing": true, "packed": true, "shipped": true, "delivered": true, "completed": true}
	want := map[string]*metricRow{}
	row := func(id string) *metricRow {
		if want[id] == nil {
			want[id] = &metricRow{ID: id, CustomerID: id, ProductCounts: map[string]int{}}
		}
		return want[id]
	}
	later := func(a *time.Time, b time.Time) *time.Time {
		if a == nil || b.After(*a) {
			return &b
		}
		return a
	}
	for _, o := range docs[domain.Order](e, "orders", "ten-lari") {
		if !sold[o.Status] {
			continue
		}
		m := row(o.CustomerID)
		at, _ := time.Parse(time.RFC3339, string(o.CreatedAt))
		m.Orders++
		m.Spend += int64(o.Total - o.RefundedAmount)
		if m.FirstAt == nil || at.Before(*m.FirstAt) {
			m.FirstAt = &at
		}
		m.LastAt = later(m.LastAt, at)
		for _, l := range o.Lines {
			m.ProductCounts[l.ProductID] += l.Qty
		}
	}
	abandoned := map[string]bool{}
	for _, ev := range docs[domain.CustomerEvent](e, "customer_events", "ten-lari") {
		at, _ := time.Parse(time.RFC3339, string(ev.At))
		switch ev.Kind {
		case "checkout_abandoned":
			abandoned[ev.CustomerID] = true
			row(ev.CustomerID).LastAbandonedAt = later(row(ev.CustomerID).LastAbandonedAt, at)
		case "purchase":
			if want[ev.CustomerID] != nil || abandoned[ev.CustomerID] {
				row(ev.CustomerID).LastPurchaseEventAt = later(row(ev.CustomerID).LastPurchaseEventAt, at)
			}
		}
	}
	// A customer with history but no sold order and no abandoned checkout has no row.
	for id, m := range want {
		if m.Orders == 0 && m.LastAbandonedAt == nil {
			delete(want, id)
		}
	}
	got := e.metrics("ten-lari")
	if len(got) != len(want) {
		t.Fatalf("rows: got %d, want %d", len(got), len(want))
	}
	for id, w := range want {
		g, ok := got[id]
		if !ok {
			t.Fatalf("no row for %s", id)
		}
		// The purchase event time is only compared where it decides the abandoned cart.
		if w.LastAbandonedAt == nil {
			g.LastPurchaseEventAt, w.LastPurchaseEventAt = nil, nil
		}
		if g.Orders != w.Orders || g.Spend != w.Spend || !sameTime(g.FirstAt, w.FirstAt) || !sameTime(g.LastAt, w.LastAt) ||
			!reflect.DeepEqual(g.ProductCounts, w.ProductCounts) || !sameTime(g.LastAbandonedAt, w.LastAbandonedAt) {
			t.Fatalf("%s differs:\n got %+v\nwant %+v", id, g, *w)
		}
	}
}

func sameTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equal(*b)
}

func TestCustomerMetricsFollowWritesAndReachTheConsole(t *testing.T) {
	e := setup(t)
	paid := e.orderIn("paid")
	var buyer string
	_ = e.db.Pool.QueryRow(context.Background(), `select data->>'customerId' from orders where id = $1`, paid).Scan(&buyer)
	before := e.metrics("ten-lari")[buyer]

	var out struct {
		Delta struct {
			Upserts map[string][]json.RawMessage `json:"upserts"`
		} `json:"delta"`
		Upserts map[string][]json.RawMessage `json:"upserts"`
	}
	if code := e.call("POST", "/orders/"+paid+"/refund", e.admin, map[string]any{"amount": 1000, "reason": "test"}, &out); code != 200 {
		t.Fatalf("refund: %d", code)
	}
	upserts := out.Upserts
	if upserts == nil {
		upserts = out.Delta.Upserts
	}
	if len(upserts["customerMetrics"]) != 1 {
		t.Errorf("the change sent %d metric rows to the console", len(upserts["customerMetrics"]))
	}
	after := e.metrics("ten-lari")[buyer]
	if after.Spend != before.Spend-1000 {
		t.Errorf("spend: %d → %d after a 1000 refund", before.Spend, after.Spend)
	}
	e.expect(200, "POST", "/orders/"+e.orderIn("new")+"/cancel", e.admin, map[string]any{"reason": "test"})
	e.expect(200, "POST", "/orders/"+e.orderIn("packed")+"/advance", e.admin, map[string]any{"trackingNo": "M-1"})

	projected := e.metrics("ten-lari")
	if err := pgx.BeginFunc(context.Background(), e.db.Pool, func(tx pgx.Tx) error { return readmodel.Rebuild(context.Background(), tx) }); err != nil {
		t.Fatal(err)
	}
	if rebuilt := e.metrics("ten-lari"); !reflect.DeepEqual(projected, rebuilt) {
		t.Errorf("the projected metrics differ from a rebuild: %d vs %d rows", len(projected), len(rebuilt))
	}

	var state struct {
		State map[string][]json.RawMessage `json:"state"`
	}
	e.call("GET", "/state", e.admin, nil, &state)
	if len(state.State["customerMetrics"]) == 0 {
		t.Error("the state carries no customer metrics")
	}
}
