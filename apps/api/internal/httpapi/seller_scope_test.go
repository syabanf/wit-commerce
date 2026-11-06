package httpapi_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// ownRule is the seller app's rule: orders sold by the seller or bought by a customer assigned to them.
const ownRule = `(o.data->>'sellerId' = 'sel-fahmi' or o.customer_id in
	(select id from customers where data->>'sellerId' = 'sel-fahmi'))`

func (e *env) ids(query string) map[string]bool {
	e.t.Helper()
	rows, err := e.db.Pool.Query(context.Background(), query)
	if err != nil {
		e.t.Fatal(err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		e.t.Fatal(err)
	}
	out := map[string]bool{}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func (e *env) first(query string) string {
	e.t.Helper()
	var id string
	if err := e.db.Pool.QueryRow(context.Background(), query).Scan(&id); err != nil {
		e.t.Fatalf("%s: %v", query, err)
	}
	return id
}

func TestSalesReadsOnlyTheirOwnOrders(t *testing.T) {
	e := setup(t)
	fahmi := e.login("fahmi@lari.co.id")
	own := e.ids(`select o.id from orders o where o.tenant_id = 'ten-lari' and ` + ownRule)
	if len(own) == 0 {
		t.Fatal("the seed has no orders for sel-fahmi")
	}

	page := e.orderRows(fahmi, url.Values{"tenantId": {"ten-lari"}, "pageSize": {"500"}})
	if page.Total != len(own) {
		t.Fatalf("sales total %d, want %d", page.Total, len(own))
	}
	for _, r := range page.Rows {
		if !own[r.ID] {
			t.Fatalf("sales read %s, which is another seller's", r.ID)
		}
	}
	if all := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}}); all.Total <= page.Total {
		t.Fatalf("admin total %d should exceed the seller's %d", all.Total, page.Total)
	}
	// A filter cannot widen the scope.
	foreignSeller := e.orderRows(fahmi, url.Values{"tenantId": {"ten-lari"}, "sellerId": {"sel-sherlyn"}})
	if foreignSeller.Total != 0 {
		t.Fatalf("sales read %d orders of sel-sherlyn", foreignSeller.Total)
	}

	foreign := e.first(`select o.id from orders o where o.tenant_id = 'ten-lari' and not ` + ownRule + ` order by o.id limit 1`)
	mine := e.first(`select o.id from orders o where o.tenant_id = 'ten-lari' and ` + ownRule + ` order by o.id limit 1`)
	e.expect(404, "GET", "/orders/"+foreign+"?tenantId=ten-lari", fahmi, nil)
	e.expect(200, "GET", "/orders/"+mine+"?tenantId=ten-lari", fahmi, nil)
	e.expect(200, "GET", "/orders/"+foreign+"?tenantId=ten-lari", e.admin, nil)

	var state struct {
		State struct {
			Orders []struct {
				ID string `json:"id"`
			} `json:"orders"`
			CustomerMetrics []struct {
				CustomerID string `json:"customerId"`
			} `json:"customerMetrics"`
			SalesDays []struct {
				SellerID *string `json:"sellerId"`
			} `json:"salesDays"`
			ProductDays []json.RawMessage `json:"productDays"`
		} `json:"state"`
	}
	if code := e.call("GET", "/state", fahmi, nil, &state); code != 200 {
		t.Fatalf("state: %d", code)
	}
	for _, o := range state.State.Orders {
		if !own[o.ID] {
			t.Fatalf("state carried %s, which is another seller's", o.ID)
		}
	}
	mineCustomers := e.ids(`select id from customers where data->>'sellerId' = 'sel-fahmi'`)
	for _, m := range state.State.CustomerMetrics {
		if !mineCustomers[m.CustomerID] {
			t.Fatalf("state carried the metrics of %s, who is not assigned to the seller", m.CustomerID)
		}
	}
	for _, d := range state.State.SalesDays {
		if d.SellerID == nil || *d.SellerID != "sel-fahmi" {
			t.Fatalf("state carried another seller's sales day: %v", d.SellerID)
		}
	}
	if len(state.State.ProductDays) != 0 {
		t.Fatalf("state carried %d brand-wide product days", len(state.State.ProductDays))
	}

	var history struct {
		Events []json.RawMessage `json:"events"`
	}
	stranger := e.first(`select customer_id from customer_events where tenant_id = 'ten-lari' and customer_id not in
		(select id from customers where data->>'sellerId' = 'sel-fahmi') order by customer_id limit 1`)
	if code := e.call("GET", "/views/customer-events?tenantId=ten-lari&customerId="+stranger, fahmi, nil, &history); code != 200 || len(history.Events) != 0 {
		t.Fatalf("sales read %d events of an unassigned customer (%d)", len(history.Events), code)
	}
	assigned := e.first(`select customer_id from customer_events where tenant_id = 'ten-lari' and customer_id in
		(select id from customers where data->>'sellerId' = 'sel-fahmi') order by customer_id limit 1`)
	if code := e.call("GET", "/views/customer-events?tenantId=ten-lari&customerId="+assigned, fahmi, nil, &history); code != 200 || len(history.Events) == 0 {
		t.Fatalf("sales read no events of their own customer (%d)", code)
	}
}

func TestSalesStreamCarriesOnlyTheirOwnOrders(t *testing.T) {
	e := setup(t)
	fahmi := e.login("fahmi@lari.co.id")
	foreign := e.first(`select o.id from orders o where o.tenant_id = 'ten-lari' and o.status = 'paid' and not ` + ownRule + ` order by o.id limit 1`)
	mine := e.first(`select o.id from orders o where o.tenant_id = 'ten-lari' and o.status = 'processing' and ` + ownRule + ` order by o.id limit 1`)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", e.url+"/events", nil)
	req.Header.Set("Authorization", "Bearer "+fahmi)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	lines := bufio.NewScanner(res.Body)
	lines.Buffer(make([]byte, 1<<20), 1<<22)
	lines.Scan() // event: hello
	lines.Scan()

	e.expect(200, "POST", "/orders/"+foreign+"/advance", e.admin, map[string]any{})
	e.expect(200, "POST", "/orders/"+mine+"/advance", e.admin, map[string]any{})
	for lines.Scan() {
		line := lines.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		if strings.Contains(line, foreign) {
			t.Fatalf("the stream carried %s, another seller's order", foreign)
		}
		if strings.Contains(line, mine) {
			return
		}
	}
	t.Fatalf("the stream never carried the seller's own order %s: %v", mine, lines.Err())
}
