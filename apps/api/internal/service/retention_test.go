package service_test

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

func TestRetentionFromEnv(t *testing.T) {
	env := map[string]string{
		"RETAIN_REQUEST_LOG_DAYS":        "7",
		"RETAIN_EMAIL_OUTBOX_DAYS":       "0",
		"RETAIN_WEBHOOK_DELIVERIES_DAYS": "soon",
		"RETAIN_STOCK_MOVES_YEARS":       "3",
		"RETAIN_TRAFFIC_YEARS":           "6",
	}
	r, warnings := service.RetentionFromEnv(func(k string) string { return env[k] })
	const day, year = 24 * time.Hour, 365 * 24 * time.Hour
	def := service.DefaultRetention()
	if r.RequestLog != 7*day || r.EmailOutbox != 0 || r.WebhookDeliveries != def.WebhookDeliveries ||
		r.StockMoves != 10*year || r.IntegrationLogs != 5*year || r.Traffic != 6*year {
		t.Fatalf("retention: %+v", r)
	}
	if len(warnings) != 2 || !strings.Contains(warnings[0], "RETAIN_WEBHOOK_DELIVERIES_DAYS") || !strings.Contains(warnings[1], "PP 80/2019") {
		t.Fatalf("warnings: %q", warnings)
	}
}

func TestPruneDeletesOnlyWhatRetentionHasPassed(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	appNow := clock.MustParse(clock.FixtureNow)
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(time.Now())})
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
	put("tenants", "ten-a", map[string]any{"subdomain": "a"})

	// 5,001 old request rows take two batches; one recent row stays.
	exec(`insert into request_log (at, request_id, method, path, status, ms)
		select now() - interval '31 days', 'old', 'GET', '/x', 200, 1 from generate_series(1, 5001)`)
	exec(`insert into request_log (at, request_id, method, path, status, ms) values (now() - interval '29 days', 'new', 'GET', '/x', 200, 1)`)

	exec(`insert into webhook_endpoints (id, tenant_id, url, events, secret_sealed, created_by, created_at)
		values ('whe-1', 'ten-a', 'https://example.test', '{}', '\x00', 'test', now())`)
	for _, row := range []struct {
		status string
		age    string
	}{{"delivered", "40 days"}, {"failed", "40 days"}, {"pending", "40 days"}, {"delivered", "10 days"}} {
		exec(`insert into webhook_deliveries (endpoint_id, tenant_id, event, payload, status, created_at)
			values ('whe-1', 'ten-a', $1, '{}', $1, now() - $2::interval)`, row.status, row.age)
	}

	for _, row := range []struct {
		subject, age string
		sent         bool
		attempts     int
	}{{"sent-old", "40 days", true, 1}, {"given-up-old", "40 days", false, 8}, {"pending-old", "40 days", false, 3}, {"sent-new", "10 days", true, 1}} {
		exec(`insert into email_outbox (created_at, "to", subject, html, text, kind, attempts, sent_at)
			values (now() - $2::interval, 'a@example.test', $1, '', '', 'test', $3, case when $4 then now() end)`,
			row.subject, row.age, row.attempts, row.sent)
	}

	iso := func(years int) string { return clock.Iso(appNow.AddDate(-years, 0, -1)) }
	put("stockMoves", "mov-old", map[string]any{"at": iso(11)})
	put("stockMoves", "mov-kept", map[string]any{"at": iso(9)})
	put("integrationLogs", "log-old", map[string]any{"at": iso(6)})
	put("integrationLogs", "log-kept", map[string]any{"at": iso(4)})
	put("traffic", "trf-old", map[string]any{"day": iso(6)[:10]})
	put("traffic", "trf-kept", map[string]any{"day": iso(4)[:10]})
	put("orders", "ord-old", map[string]any{"code": "O-1", "status": "delivered", "createdAt": iso(20)})

	deleted, err := svc.Prune(ctx, time.Now(), appNow, service.DefaultRetention())
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]int64{"request_log": 5001, "webhook_deliveries": 2, "email_outbox": 2, "stock_moves": 1, "integration_logs": 1, "traffic": 1}
	for table, n := range want {
		if deleted[table] != n {
			t.Errorf("%s: deleted %d, want %d", table, deleted[table], n)
		}
	}

	left := func(sql string) []string {
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
		`select request_id from request_log`: {"new"},
		`select status || ' ' || (created_at > now() - interval '20 days') from webhook_deliveries`: {"delivered true", "pending false"},
		`select subject from email_outbox`: {"pending-old", "sent-new"},
		`select id from stock_moves`:       {"mov-kept"},
		`select id from integration_logs`:  {"log-kept"},
		`select id from traffic`:           {"trf-kept"},
		`select id from orders`:            {"ord-old"},
	} {
		if got := left(sql); !slices.Equal(got, want) {
			t.Errorf("%s: %q, want %q", sql, got, want)
		}
	}

	// A second run finds nothing; a zero period keeps a log forever.
	none := service.Retention{}
	if deleted, err := svc.Prune(ctx, time.Now().Add(100*365*24*time.Hour), appNow.AddDate(100, 0, 0), none); err != nil || len(deleted) != 0 {
		t.Fatalf("zero retention deleted %v (%v)", deleted, err)
	}
}

func TestPruneIfDueRunsOnceAnHour(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if _, err := db.Pool.Exec(ctx, `delete from meta where key = 'retention_pruned_at'`); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(time.Now())})
	if _, err := db.Pool.Exec(ctx, `insert into request_log (at, request_id, method, path, status, ms) values (now() - interval '40 days', 'a', 'GET', '/', 200, 1)`); err != nil {
		t.Fatal(err)
	}
	deleted, err := svc.PruneIfDue(ctx, clock.MustParse(clock.FixtureNow), service.DefaultRetention())
	if err != nil || deleted["request_log"] != 1 {
		t.Fatalf("first run: %v %v", deleted, err)
	}
	if _, err := db.Pool.Exec(ctx, `insert into request_log (at, request_id, method, path, status, ms) values (now() - interval '40 days', 'b', 'GET', '/', 200, 1)`); err != nil {
		t.Fatal(err)
	}
	deleted, err = svc.PruneIfDue(ctx, clock.MustParse(clock.FixtureNow), service.DefaultRetention())
	if err != nil || deleted != nil {
		t.Fatalf("second run within the hour: %v %v", deleted, err)
	}
}

// Migration 0032's email_outbox_done_idx spells the give-up count as a literal, so the prune query
// matches its predicate only while the two agree.
func TestEmailGiveUpCountMatchesThePruneIndex(t *testing.T) {
	if notifications.MaxAttempts != 8 {
		t.Fatalf("notifications.MaxAttempts is %d; update email_outbox_done_idx in a new migration", notifications.MaxAttempts)
	}
}

func TestAuditLogKeepsAtLeastFiveYears(t *testing.T) {
	env := map[string]string{"RETAIN_AUDIT_LOG_YEARS": "2", "RETAIN_PRODUCT_IMPORTS_DAYS": "7"}
	r, warnings := service.RetentionFromEnv(func(k string) string { return env[k] })
	if r.AuditLog != 5*365*24*time.Hour || r.ProductImports != 7*24*time.Hour || len(warnings) != 1 {
		t.Errorf("audit %v imports %v warnings %v", r.AuditLog, r.ProductImports, warnings)
	}
	if d := service.DefaultRetention(); d.AuditLog != 5*365*24*time.Hour || d.ProductImports != 30*24*time.Hour {
		t.Errorf("defaults %+v", d)
	}
}
