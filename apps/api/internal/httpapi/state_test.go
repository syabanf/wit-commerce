package httpapi_test

import (
	"context"
	"encoding/json"
	"net/url"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

func TestStateLeavesOutCustomerHistoryAndOrderNotes(t *testing.T) {
	e := setup(t)
	var out struct {
		State map[string][]json.RawMessage `json:"state"`
	}
	if code := e.call("GET", "/state", e.admin, nil, &out); code != 200 {
		t.Fatalf("state: %d", code)
	}
	if _, ok := out.State["customerEvents"]; ok {
		t.Error("the state still carries customer history")
	}
	shipped := 0
	for _, raw := range out.State["orders"] {
		var o domain.Order
		_ = json.Unmarshal(raw, &o)
		for _, ev := range o.Events {
			if ev.Status == nil || *ev.Status != "shipped" {
				t.Fatalf("order %s carries a %v event", o.ID, ev.Status)
			}
			shipped++
		}
	}
	if shipped == 0 {
		t.Error("no shipment survived the trim, so the dashboard count breaks")
	}
	// The whole order, history included, is one read away.
	id := e.orderIn("delivered")
	var full domain.Order
	e.call("GET", "/orders/"+id+"?tenantId=ten-lari", e.admin, nil, &full)
	if len(full.Events) < 2 {
		t.Errorf("the full order has %d events", len(full.Events))
	}
}

func TestCustomerEventsQuery(t *testing.T) {
	e := setup(t)
	var customerID string
	if err := e.db.Pool.QueryRow(context.Background(), `select customer_id from customer_events where tenant_id = 'ten-lari'
		group by customer_id order by count(*) desc limit 1`).Scan(&customerID); err != nil {
		t.Fatal(err)
	}
	read := func(params url.Values) []domain.CustomerEvent {
		t.Helper()
		var out struct {
			Events []domain.CustomerEvent `json:"events"`
		}
		params.Set("tenantId", "ten-lari")
		if code := e.call("GET", "/views/customer-events?"+params.Encode(), e.admin, nil, &out); code != 200 {
			t.Fatalf("customer-events %s: %d", params.Encode(), code)
		}
		return out.Events
	}
	timeline := read(url.Values{"customerId": {customerID}, "limit": {"500"}})
	if len(timeline) < 2 {
		t.Fatalf("timeline: %d", len(timeline))
	}
	for i, ev := range timeline {
		if ev.CustomerID != customerID || (i > 0 && ev.At > timeline[i-1].At) {
			t.Fatalf("event %d is another customer's or out of order", i)
		}
	}
	for _, ev := range read(url.Values{"excludeKind": {"registered"}, "limit": {"20"}}) {
		if ev.Kind == "registered" {
			t.Error("excludeKind let a registration through")
		}
	}
	// A bound inside one day: the text compare must order 08:00 and 09:00 the way time does.
	cutoff := timeline[len(timeline)/2].At
	for _, ev := range read(url.Values{"customerId": {customerID}, "since": {string(cutoff)}, "limit": {"500"}}) {
		if ev.At < cutoff {
			t.Errorf("since %s let %s through", cutoff, ev.At)
		}
	}
	utc, _ := time.Parse(time.RFC3339, string(cutoff))
	if got := read(url.Values{"customerId": {customerID}, "since": {utc.UTC().Format(time.RFC3339)}, "limit": {"500"}}); len(got) == 0 || got[len(got)-1].At < cutoff {
		t.Error("the same moment written in UTC gave a different answer")
	}
	kind := timeline[0].Kind
	for _, ev := range read(url.Values{"kind": {kind}, "since": {"2026-01-01T00:00:00Z"}}) {
		if ev.Kind != kind || ev.At < "2026-01-01" {
			t.Errorf("kind or since filter let %+v through", ev)
		}
	}
	e.expect(403, "GET", "/views/customer-events?tenantId=ten-teknika", e.admin, nil)
	e.expect(422, "GET", "/views/customer-events?tenantId=ten-lari&limit=9000", e.admin, nil)
	e.expect(403, "GET", "/views/customer-events", e.issue("orders:read").Secret, nil)
	e.expect(200, "GET", "/views/customer-events", e.issue("customers:read").Secret, nil)
}
