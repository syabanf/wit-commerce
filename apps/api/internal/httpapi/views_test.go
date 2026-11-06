package httpapi_test

import (
	"context"
	"encoding/json"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
)

type orderRowsPage struct {
	Rows []struct {
		ID           string `json:"id"`
		Code         string `json:"code"`
		CustomerName string `json:"customerName"`
		Status       string `json:"status"`
		ItemCount    int    `json:"itemCount"`
		Total        int64  `json:"total"`
	} `json:"rows"`
	Total        int            `json:"total"`
	StatusCounts map[string]int `json:"statusCounts"`
	Stats        struct {
		ToFulfil  int `json:"toFulfil"`
		Unpaid    int `json:"unpaid"`
		InTransit int `json:"inTransit"`
		Returns   int `json:"returns"`
	} `json:"stats"`
}

func (e *env) orderRows(token string, params url.Values) orderRowsPage {
	e.t.Helper()
	var out orderRowsPage
	if code := e.call("GET", "/views/orders?"+params.Encode(), token, nil, &out); code != 200 {
		e.t.Fatalf("views/orders %s: %d", params.Encode(), code)
	}
	return out
}

// snapshot reads every order row, to compare the projected rows with a full rebuild.
func (e *env) snapshot() map[string][]any {
	e.t.Helper()
	rows, err := e.db.Pool.Query(context.Background(), `select * from order_rows order by id`)
	if err != nil {
		e.t.Fatal(err)
	}
	out := map[string][]any{}
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			e.t.Fatal(err)
		}
		out[values[0].(string)] = values
	}
	return out
}

func TestOrderRowsFollowEveryWrite(t *testing.T) {
	e := setup(t)
	paid := e.orderIn("paid")
	e.expect(200, "POST", "/orders/"+paid+"/advance", e.admin, map[string]any{})
	shipping := e.orderIn("packed")
	e.expect(200, "POST", "/orders/"+shipping+"/advance", e.admin, map[string]any{"trackingNo": "TRACK-ROWS-1"})
	e.expect(200, "POST", "/orders/"+e.orderIn("new")+"/cancel", e.admin, map[string]any{"reason": "test"})
	guest := map[string]any{"id": "cus-rows", "tenantId": "ten-lari", "code": "LARI-C99997", "name": "Rows Guest", "email": "rows@example.com"}
	e.expect(200, "POST", "/shop/lari/orders", "", map[string]any{"order": e.placeable("ord-rows", "cus-rows"), "customer": guest})

	// A rename reaches the rows of that customer's orders.
	var customer domain.Customer
	raw, _ := json.Marshal(guest)
	_ = json.Unmarshal(raw, &customer)
	customer.Name = "Renamed Guest"
	e.expect(200, "PUT", "/customers/cus-rows", e.admin, customer)

	projected := e.snapshot()
	err := pgx.BeginFunc(context.Background(), e.db.Pool, func(tx pgx.Tx) error { return readmodel.Rebuild(context.Background(), tx) })
	if err != nil {
		t.Fatal(err)
	}
	if rebuilt := e.snapshot(); !reflect.DeepEqual(projected, rebuilt) {
		t.Fatalf("the projected rows differ from a rebuild: %d vs %d rows", len(projected), len(rebuilt))
	}
	row := projected["ord-rows"]
	if row == nil || row[4] != "Renamed Guest" {
		t.Errorf("the guest order row: %v", row)
	}
	page := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, "q": {"track-rows-1"}})
	if page.Total != 1 || page.Rows[0].ID != shipping {
		t.Errorf("tracking search: %+v", page)
	}
}

func TestOrderViewsMatchTheDocuments(t *testing.T) {
	e := setup(t)
	var orders []domain.Order
	rows, err := e.db.Pool.Query(context.Background(), `select data from orders where tenant_id = 'ten-lari'`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var raw []byte
		_ = rows.Scan(&raw)
		var o domain.Order
		_ = json.Unmarshal(raw, &o)
		orders = append(orders, o)
	}
	// The same tests the console's VIEW_TEST runs.
	views := map[string]func(o domain.Order) bool{
		"all": func(domain.Order) bool { return true },
		"unpaid": func(o domain.Order) bool {
			return (o.Status == "new" || o.Status == "confirmed") && o.PaymentStatus == "pending"
		},
		"to-fulfil": func(o domain.Order) bool {
			return o.Status == "paid" || o.Status == "processing" || o.Status == "packed"
		},
		"in-transit": func(o domain.Order) bool { return o.Status == "shipped" },
		"returns": func(o domain.Order) bool {
			return o.Status == "returned" || o.Status == "refunded" || o.RefundedAmount > 0
		},
	}
	for view, test := range views {
		want := map[string]int{}
		total := 0
		for _, o := range orders {
			if test(o) {
				want[o.Status]++
				total++
			}
		}
		page := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, "view": {view}})
		if page.Total != total || !reflect.DeepEqual(page.StatusCounts, want) {
			t.Errorf("view %s: total %d want %d, counts %v want %v", view, page.Total, total, page.StatusCounts, want)
		}
	}
	page := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}})
	count := func(view string) (n int) {
		for _, o := range orders {
			if views[view](o) {
				n++
			}
		}
		return n
	}
	if page.Stats.ToFulfil != count("to-fulfil") || page.Stats.Unpaid != count("unpaid") || page.Stats.InTransit != count("in-transit") || page.Stats.Returns != count("returns") {
		t.Errorf("stats: %+v", page.Stats)
	}
}

func TestOrderRowsPageSortAndSearch(t *testing.T) {
	e := setup(t)
	base := url.Values{"tenantId": {"ten-lari"}, "status": {"completed"}, "sort": {"total"}, "desc": {"true"}}
	first := e.orderRows(e.admin, base)
	if len(first.Rows) != 12 || first.Total <= 12 {
		t.Fatalf("first page: %d of %d", len(first.Rows), first.Total)
	}
	for i := 1; i < len(first.Rows); i++ {
		if first.Rows[i].Total > first.Rows[i-1].Total || first.Rows[i].Status != "completed" {
			t.Fatalf("row %d is out of order or status", i)
		}
	}
	next := url.Values{}
	for k, v := range base {
		next[k] = v
	}
	next.Set("page", "1")
	second := e.orderRows(e.admin, next)
	if second.Rows[0].ID == first.Rows[0].ID || second.Rows[0].Total > first.Rows[11].Total {
		t.Error("the second page repeats or breaks the order")
	}
	name := first.Rows[0].CustomerName
	found := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, "q": {strings.ToUpper(name)}})
	for _, row := range found.Rows {
		if row.CustomerName != name && !strings.Contains(strings.ToLower(row.CustomerName), strings.ToLower(strings.Fields(name)[0])) {
			t.Errorf("search for %q returned %q", name, row.CustomerName)
		}
	}
	if found.Total == 0 {
		t.Error("search found nothing")
	}
	// Wildcards in the search are literal.
	if got := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, "q": {"%"}}); got.Total != 0 {
		t.Errorf("%% matched %d orders", got.Total)
	}
	// An unknown sort falls back to the newest first instead of reaching the SQL.
	e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, "sort": {"id; drop table orders"}})
	e.expect(422, "GET", "/views/orders?tenantId=ten-lari&view=nope", e.admin, nil)
}

func TestOrderRowsStayWithinTheBrand(t *testing.T) {
	e := setup(t)
	e.expect(403, "GET", "/views/orders?tenantId=ten-teknika", e.admin, nil)
	e.expect(403, "GET", "/views/orders", e.admin, nil)
	e.expect(401, "GET", "/views/orders?tenantId=ten-lari", "", nil)
	e.expect(403, "GET", "/views/orders?tenantId=ten-lari", e.issue("customers:read").Secret, nil)
	e.expect(200, "GET", "/views/orders?tenantId=ten-lari", e.issue("orders:read").Secret, nil)
}

func TestStateHoldsOnlyOrdersUnderWay(t *testing.T) {
	e := setup(t)
	var out struct {
		State struct {
			Orders []domain.Order `json:"orders"`
		} `json:"state"`
	}
	e.call("GET", "/state", e.admin, nil, &out)
	open := map[string]bool{"new": true, "confirmed": true, "paid": true, "processing": true, "packed": true, "shipped": true}
	for _, o := range out.State.Orders {
		if !open[o.Status] {
			t.Fatalf("the state carries a %s order", o.Status)
		}
	}
	var want int
	_ = e.db.Pool.QueryRow(context.Background(), `select count(*) from orders where tenant_id = any('{ten-lari,ten-aruna}')
		and status in ('new', 'confirmed', 'paid', 'processing', 'packed', 'shipped')`).Scan(&want)
	if len(out.State.Orders) != want {
		t.Errorf("state orders: %d, open orders: %d", len(out.State.Orders), want)
	}
}

func TestOrderRowsRecordFiltersAndCounts(t *testing.T) {
	e := setup(t)
	var customer, seller, campaign string
	ctx := context.Background()
	_ = e.db.Pool.QueryRow(ctx, `select customer_id from orders where tenant_id = 'ten-lari' group by 1 order by count(*) desc limit 1`).Scan(&customer)
	_ = e.db.Pool.QueryRow(ctx, `select data->>'sellerId' from orders where tenant_id = 'ten-lari' and data->>'sellerId' is not null group by 1 order by count(*) desc limit 1`).Scan(&seller)
	_ = e.db.Pool.QueryRow(ctx, `select data->>'campaignId' from orders where tenant_id = 'ten-lari' and data->>'campaignId' is not null group by 1 order by count(*) desc limit 1`).Scan(&campaign)
	count := func(where string, args ...any) int {
		var n int
		if err := e.db.Pool.QueryRow(ctx, `select count(*) from orders where tenant_id = 'ten-lari' and `+where, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	for param, value := range map[string]string{"customerId": customer, "sellerId": seller, "campaignId": campaign} {
		column := map[string]string{"customerId": "customer_id", "sellerId": "data->>'sellerId'", "campaignId": "data->>'campaignId'"}[param]
		page := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, param: {value}, "pageSize": {"500"}})
		if want := count(column+" = $1", value); page.Total != want || len(page.Rows) != want {
			t.Errorf("%s: %d rows of %d, want %d", param, len(page.Rows), page.Total, want)
		}
	}
	var stages struct {
		StageCounts         map[string]int `json:"stageCounts"`
		PaymentStatusCounts map[string]int `json:"paymentStatusCounts"`
		Payments            struct {
			Paid      int   `json:"paid"`
			Collected int64 `json:"collected"`
		} `json:"payments"`
		Stats struct {
			ShippedLast24h int `json:"shippedLast24h"`
		} `json:"stats"`
	}
	e.call("GET", "/views/orders?tenantId=ten-lari&customerId="+customer+"&stage=closed", e.admin, nil, &stages)
	if got, want := stages.StageCounts["open"]+stages.StageCounts["delivered"]+stages.StageCounts["closed"], count("customer_id = $1", customer); got != want {
		t.Errorf("stage counts add up to %d, want %d", got, want)
	}
	if stages.Payments.Paid != count("data->>'paymentStatus' = 'paid'") {
		t.Errorf("paid orders: %d", stages.Payments.Paid)
	}
	var collected int64
	_ = e.db.Pool.QueryRow(ctx, `select coalesce(sum(greatest(0, (data->>'total')::bigint - (data->>'refundedAmount')::bigint)), 0)
		from orders where tenant_id = 'ten-lari' and data->>'paymentStatus' in ('paid', 'refunded')`).Scan(&collected)
	if stages.Payments.Collected != collected {
		t.Errorf("collected: %d, want %d", stages.Payments.Collected, collected)
	}
	agents := e.orderRows(e.admin, url.Values{"tenantId": {"ten-lari"}, "agent": {"true"}, "pageSize": {"500"}})
	if agents.Total != count("jsonb_typeof(data->'agent') = 'object'") {
		t.Errorf("agent orders: %d", agents.Total)
	}
	e.expect(422, "GET", "/views/orders?tenantId=ten-lari&stage=nope", e.admin, nil)
}
