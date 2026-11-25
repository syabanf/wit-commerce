package service_test

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// Backdated rows on both sides of each PP 80/2019 period: only those past it go, customers are
// anonymised through the erasure path first, and a pseudonymous customer stays while an order of
// theirs is inside its 10 years.
func TestPruneCoreKeepsEverythingInsideItsPeriod(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	appNow := clock.MustParse(clock.FixtureNow)
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(appNow)})
	ago := func(years int) string { return clock.Iso(appNow.AddDate(-years, 0, -1)) }
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	put := func(collection, id string, doc map[string]any) {
		t.Helper()
		doc["id"], doc["tenantId"] = id, "ten-a"
		if err := store.Put(ctx, db.Pool, collection, id, doc); err != nil {
			t.Fatal(err)
		}
	}
	put("tenants", "ten-a", map[string]any{"subdomain": "a", "code": "A"})
	customer := func(id string, created int) {
		put("customers", id, map[string]any{"code": "A-" + id, "name": "Name " + id, "email": id + "@example.com", "phone": "+628123456" + id[len(id)-2:], "createdAt": ago(created), "tags": []string{}, "interests": []string{}})
	}
	order := func(id, customerID, status string, created, lastEvent int) {
		put("orders", id, map[string]any{"code": "A-" + id, "customerId": customerID, "status": status, "paymentStatus": "paid", "channel": "web",
			"createdAt": ago(created), "lines": []any{}, "total": 1000,
			"events": []any{map[string]any{"id": "oev-" + id, "at": ago(lastEvent), "by": "x", "status": status, "note": ""}}})
	}

	// Transaction data: 10 years from the order's last activity.
	customer("cus-g1", 12) // only an old order and old events: anonymised, then deleted
	order("ord-old", "cus-g1", "delivered", 11, 11)
	put("customerEvents", "ev-g1", map[string]any{"customerId": "cus-g1", "kind": "note", "label": "Called", "at": ago(11)})
	put("tickets", "tic-g1", map[string]any{"customerId": "cus-g1", "status": "resolved", "subject": "Late", "createdAt": ago(11)})
	exec(`insert into payments (order_id, tenant_id, provider, status, gross_amount) values ('ord-old', 'ten-a', 'midtrans', 'settlement', 1000)`)
	exec(`insert into payment_refunds (refund_key, order_id, tenant_id, return_id, attempt, provider, amount, status) values ('rk-1', 'ord-old', 'ten-a', 'ret-old', 1, 'midtrans', 500, 'succeeded')`)
	exec(`insert into order_invoices (order_id, tenant_id, seq, number, issued_at) values ('ord-old', 'ten-a', 1, 'INV/A/1', now())`)
	put("returns", "ret-old", map[string]any{"orderId": "ord-old", "customerId": "cus-g1", "code": "A-R1", "status": "refunded", "createdAt": ago(11), "events": []any{}})

	customer("cus-i1", 6) // inactive 6 years with a 7-year-old order: anonymised, row kept
	order("ord-late-event", "cus-i1", "delivered", 11, 7)
	customer("cus-r1", 1)
	order("ord-return", "cus-r1", "delivered", 11, 11)
	put("returns", "ret-new", map[string]any{"orderId": "ord-return", "customerId": "cus-r1", "code": "A-R2", "status": "refunded", "createdAt": ago(11),
		"events": []any{map[string]any{"at": ago(9), "status": "refunded"}}})
	order("ord-new", "cus-r1", "delivered", 9, 9)
	if err := readmodel.RefreshOrders(ctx, db.Pool, []string{"ord-old", "ord-late-event", "ord-return", "ord-new"}); err != nil {
		t.Fatal(err)
	}

	// Other PMSE data: 5 years from the customer's last activity.
	customer("cus-a1", 6)
	put("customerEvents", "ev-a1", map[string]any{"customerId": "cus-a1", "kind": "page_view", "label": "Shoes", "at": ago(1)})
	customer("cus-h1", 6) // an order still on its way holds the erasure
	order("ord-held", "cus-h1", "shipped", 6, 6)
	put("tickets", "tic-old", map[string]any{"customerId": "", "status": "resolved", "subject": "Size", "createdAt": ago(6)})
	put("tickets", "tic-open", map[string]any{"customerId": "", "status": "open", "subject": "Size", "createdAt": ago(6)})
	put("tickets", "tic-kept", map[string]any{"customerId": "", "status": "resolved", "subject": "Size", "createdAt": ago(4)})
	put("leads", "lead-old", map[string]any{"name": "Old", "createdAt": ago(7), "updatedAt": ago(6)})
	put("leads", "lead-kept", map[string]any{"name": "Kept", "createdAt": ago(7), "updatedAt": ago(4)})

	// Privacy requests: 5 years after completion; platform invoices 10 years after issue.
	for _, r := range []struct {
		id, status string
		years      int
	}{{"pr-old", "completed", 6}, {"pr-kept", "completed", 4}, {"pr-open", "open", 6}} {
		exec(`insert into privacy_requests (id, tenant_id, customer_id, kind, status, requested_at, due_at, completed_at)
			values ($1, 'ten-a', 'cus-x', 'access', $2, $3::timestamptz, $3::timestamptz, case when $2 = 'completed' then $3::timestamptz end)`, r.id, r.status, appNow.AddDate(-r.years, 0, -1))
	}
	for _, r := range []struct {
		id, period, status string
		years              int
	}{{"inv-old", "2015-01", "paid", 11}, {"inv-due", "2015-02", "due", 11}, {"inv-kept", "2017-01", "paid", 9}} {
		exec(`insert into invoices (id, tenant_id, period, plan, amount, status, issued_at) values ($1, 'ten-a', $2, 'growth', 1, $3, $4)`, r.id, r.period, r.status, appNow.AddDate(-r.years, 0, -1))
	}

	deleted, err := svc.Prune(ctx, time.Now(), appNow, service.DefaultRetention())
	if err != nil {
		t.Fatal(err)
	}
	for key, n := range map[string]int64{"orders": 1, "payments": 1, "payment_refunds": 1, "order_invoices": 1, "returns": 1, "invoices": 1,
		"customers_anonymised": 2, "customers_held": 1, "customers": 1, "tickets": 2, "leads": 1, "privacy_requests": 1} {
		if deleted[key] != n {
			t.Errorf("%s: %d, want %d (all: %v)", key, deleted[key], n, deleted)
		}
	}
	ids := func(sql string) []string {
		t.Helper()
		rows, err := db.Pool.Query(ctx, sql)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		slices.Sort(out)
		return out
	}
	for sql, want := range map[string][]string{
		`select id from orders`:     {"ord-held", "ord-late-event", "ord-new", "ord-return"},
		`select id from order_rows`: {"ord-late-event", "ord-new", "ord-return"},
		`select order_id from payments union all select order_id from payment_refunds union all select order_id from order_invoices`: nil,
		`select id from returns`:                                               {"ret-new"},
		`select id from customers`:                                             {"cus-a1", "cus-h1", "cus-i1", "cus-r1"},
		`select id from customers where data->>'erasedAt' <> ''`:               {"cus-i1"},
		`select customer_id from customer_events where customer_id = 'cus-g1'`: nil,
		`select id from tickets`:                                               {"tic-kept", "tic-open"},
		`select id from leads`:                                                 {"lead-kept"},
		`select id from privacy_requests where customer_id = 'cus-x'`:          {"pr-kept", "pr-open"},
		`select id from invoices`:                                              {"inv-due", "inv-kept"},
	} {
		if got := ids(sql); !slices.Equal(got, want) {
			t.Errorf("%s: %q, want %q", sql, got, want)
		}
	}
	kept, err := store.Get[domain.Customer](ctx, db.Pool, "customers", "cus-i1")
	if err != nil || kept.Name == "Name cus-i1" || kept.Email != "" || kept.Code != "A-cus-i1" {
		t.Errorf("anonymised customer: %+v (%v)", kept, err)
	}

	// A second run an hour later changes nothing more: the erasure did not restart any clock.
	again, err := svc.Prune(ctx, time.Now(), appNow.Add(time.Hour), service.DefaultRetention())
	if err != nil {
		t.Fatal(err)
	}
	for key, n := range again {
		if key != "customers_held" && n != 0 {
			t.Errorf("second run %s: %d", key, n)
		}
	}
}

func TestCoreRetentionKeepsItsLegalFloors(t *testing.T) {
	env := map[string]string{"RETAIN_TRANSACTIONS_YEARS": "3", "RETAIN_CUSTOMERS_YEARS": "7", "RETAIN_PRIVACY_REQUESTS_YEARS": "0"}
	r, warnings := service.RetentionFromEnv(func(k string) string { return env[k] })
	const year = 365 * 24 * time.Hour
	if r.Transactions != 10*year || r.Customers != 7*year || r.PrivacyRequests != 0 || len(warnings) != 1 {
		t.Errorf("transactions %v customers %v privacy %v warnings %v", r.Transactions, r.Customers, r.PrivacyRequests, warnings)
	}
	if d := service.DefaultRetention(); d.Transactions != 10*year || d.Customers != 5*year || d.PrivacyRequests != 5*year {
		t.Errorf("defaults %+v", d)
	}
}
