package readmodel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

func TestSalesCutoffKeepsThirteenWholeMonths(t *testing.T) {
	for now, want := range map[string]string{
		"2026-10-05T09:41:00+07:00": "2025-09-01",
		"2026-01-31T23:59:00+07:00": "2024-12-01",
		// 18:00 UTC on 31 March is already 1 April in WIB.
		"2026-03-31T18:00:00Z": "2025-03-01",
	} {
		if got := readmodel.SalesCutoff(clock.MustParse(now)); got != want {
			t.Errorf("cutoff at %s = %s, want %s", now, got, want)
		}
	}
}

// synthTenant adds three years of sold orders to a tenant of its own: three a day, across channels,
// sellers and products, with a refund now and then.
func synthTenant(t *testing.T, db *store.DB, now time.Time) []string {
	t.Helper()
	ctx := context.Background()
	var ids []string
	err := pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		channels := []string{"web", "personal_store", "whatsapp"}
		for day := 0; day < 3*365; day++ {
			for n := 0; n < 3; n++ {
				at := now.AddDate(0, 0, -day).Add(-time.Duration(n*5) * time.Hour)
				i := day*3 + n
				seller := (*string)(nil)
				if i%4 == 0 {
					seller = new(fmt.Sprintf("slr-synth-%d", i%3))
				}
				price := 50_000 + (i%7)*10_000
				o := domain.Order{
					ID: fmt.Sprintf("ord-synth-%05d", i), TenantID: "ten-synth", Code: fmt.Sprintf("SYN-%05d", i),
					CustomerID: fmt.Sprintf("cus-synth-%d", i%40), Channel: channels[i%3], SellerID: seller,
					Status: "completed", PaymentStatus: "paid", PaymentMethod: "va", Courier: "jne", WarehouseID: "wh-synth",
					Lines:     []domain.OrderLine{{ProductID: fmt.Sprintf("prd-synth-%d", i%12), VariantID: "v", Qty: 1 + i%3, Price: price}},
					CreatedAt: clock.Iso(at), Events: []domain.OrderEvent{},
				}
				o.Subtotal = o.Lines[0].Qty * price
				o.Total = o.Subtotal
				if i%11 == 0 {
					o.RefundedAmount = 10_000
				}
				if err := store.Put(ctx, tx, "orders", o.ID, o); err != nil {
					return err
				}
				ids = append(ids, o.ID)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return ids
}

// snapshot reads every sales fact table whole, in id order.
func snapshot(t *testing.T, q readmodel.Querier) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, table := range []string{"sales_days", "product_days", "seller_buyers", "sales_months", "product_months"} {
		var rows string
		if err := q.QueryRow(context.Background(), `select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]')::text from `+table+` x`).Scan(&rows); err != nil {
			t.Fatal(err)
		}
		out[table] = rows
	}
	return out
}

// TestRollUpMatchesRebuild proves the daily job and a rebuild from scratch agree: rolling up in small
// batches, rolling up again, and rolling up after a late refund to an old order all give the rows
// RebuildAt makes from the orders.
func TestRollUpMatchesRebuild(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	now := clock.MustParse(clock.FixtureNow)
	ids := synthTenant(t, db, now)
	cutoff := readmodel.SalesCutoff(now)
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Every day kept, as before this change: what /state used to send.
	if err := readmodel.RebuildAt(ctx, tx, time.Date(1990, 1, 1, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	before := factBytes(t, tx, "tenant_id = 'ten-synth'")
	for {
		n, err := readmodel.RollUpSales(ctx, tx, cutoff, 7)
		if err != nil {
			t.Fatal(err)
		}
		if n == 0 {
			break
		}
	}
	batched := snapshot(t, tx)
	if n, err := readmodel.RollUpSales(ctx, tx, cutoff, 0); err != nil || n != 0 {
		t.Fatalf("a second roll-up found %d months (%v)", n, err)
	}
	after := factBytes(t, tx, fmt.Sprintf("tenant_id = 'ten-synth' and day >= '%s'", cutoff))
	t.Logf("synthetic 3-year tenant, sales facts in /state: %d bytes before, %d after (%.0f%% smaller)",
		before, after, 100*(1-float64(after)/float64(before)))
	if after*2 > before {
		t.Errorf("the window kept %d of %d bytes", after, before)
	}

	if err := readmodel.RebuildAt(ctx, tx, now); err != nil {
		t.Fatal(err)
	}
	rebuilt := snapshot(t, tx)
	for table, rows := range rebuilt {
		if batched[table] != rows {
			t.Errorf("%s: the batched roll-up differs from a rebuild", table)
		}
	}
	var old int
	if err := tx.QueryRow(ctx, `select count(*) from sales_days where day < $1`, cutoff).Scan(&old); err != nil || old != 0 {
		t.Fatalf("%d daily rows older than the window survived (%v)", old, err)
	}
	var months, total int64
	if err := tx.QueryRow(ctx, `select count(*), coalesce(sum(revenue), 0) from sales_months where tenant_id = 'ten-synth'`).Scan(&months, &total); err != nil || months == 0 {
		t.Fatalf("no months rolled up (%v)", err)
	}

	// A refund to a two-year-old order: the write projects its old day again, and the next roll-up
	// folds it into the month, as a rebuild would.
	oldest := ids[len(ids)-1]
	o, err := store.Get[domain.Order](ctx, tx, "orders", oldest)
	if err != nil {
		t.Fatal(err)
	}
	o.RefundedAmount = o.Total
	o.Status = "refunded"
	if err := store.Put(ctx, tx, "orders", o.ID, o); err != nil {
		t.Fatal(err)
	}
	if err := readmodel.Apply(ctx, tx, map[string][]any{"orders": {o}}, map[string][]string{}); err != nil {
		t.Fatal(err)
	}
	if _, err := readmodel.RollUpSales(ctx, tx, cutoff, 0); err != nil {
		t.Fatal(err)
	}
	late := snapshot(t, tx)
	if err := readmodel.RebuildAt(ctx, tx, now); err != nil {
		t.Fatal(err)
	}
	for table, rows := range snapshot(t, tx) {
		if late[table] != rows {
			t.Errorf("%s: after a late refund the roll-up differs from a rebuild", table)
		}
	}
	var monthsAfter, totalAfter int64
	_ = tx.QueryRow(ctx, `select count(*), coalesce(sum(revenue), 0) from sales_months where tenant_id = 'ten-synth'`).Scan(&monthsAfter, &totalAfter)
	if totalAfter >= total {
		t.Errorf("the refund did not lower the long-range total: %d then %d", total, totalAfter)
	}
}

// TestSeedKeepsEveryDay checks the seed, which spans March to October 2026, loses nothing to the
// window, so every screen reads the numbers it read before.
func TestSeedKeepsEveryDay(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	cutoff := readmodel.SalesCutoff(clock.MustParse(clock.FixtureNow))
	all, window := factBytes(t, db.Pool, "true"), factBytes(t, db.Pool, fmt.Sprintf("day >= '%s'", cutoff))
	t.Logf("seed, sales facts in /state: %d bytes before, %d after", all, window)
	if all != window {
		t.Errorf("the window drops seed days: %d of %d bytes kept", window, all)
	}
	var months int
	if err := db.Pool.QueryRow(ctx, `select count(*) from sales_months`).Scan(&months); err != nil || months != 0 {
		t.Errorf("the seed rolled up %d months (%v)", months, err)
	}
}

// factBytes is the size of the three daily fact collections as /state sends them.
func factBytes(t *testing.T, q readmodel.Querier, where string) int {
	t.Helper()
	size := 0
	for _, c := range []string{readmodel.SalesDaysCollection, readmodel.ProductDaysCollection, readmodel.SellerBuyersCollection} {
		rows, err := readmodel.FactRows(context.Background(), q, c, where)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(rows)
		size += len(raw)
	}
	return size
}
