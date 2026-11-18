package readmodel_test

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// TestConcurrentWritesOnOneDay: ten writes that each move a different order of one WIB day commit
// side by side. Every one succeeds, and the day's facts and the customers' metrics count all ten
// orders. The createdAt offsets vary, so the day match must convert them. With one buyer per order
// the writes meet only on the sales facts; with one buyer for all, also on the customer's metrics.
func TestConcurrentWritesOnOneDay(t *testing.T) {
	t.Run("one buyer per order", func(t *testing.T) { raceOneDay(t, func(i int) string { return fmt.Sprintf("cus-race-%02d", i) }) })
	t.Run("one buyer", func(t *testing.T) { raceOneDay(t, func(int) string { return "cus-race-00" }) })
}

func raceOneDay(t *testing.T, buyer func(i int) string) {
	db := testdb.Open(t)
	ctx := context.Background()
	seller := "slr-race"
	at := []string{
		"2026-10-07T00:30:00+07:00", "2026-10-06T17:30:00Z", "2026-10-07T23:30:00+07:00", "2026-10-07T16:59:00Z",
		"2026-10-06T12:30:00-05:00", "2026-10-07T12:00:00+07:00", "2026-10-07T05:00:00Z", "2026-10-07T09:00:00+09:00",
		"2026-10-07T08:00:00+07:00", "2026-10-08T01:00:00+14:00",
	}
	orders := make([]domain.Order, len(at))
	for i := range orders {
		orders[i] = domain.Order{
			ID: fmt.Sprintf("ord-race-%02d", i), TenantID: "ten-race", Code: fmt.Sprintf("RACE-%02d", i), CustomerID: buyer(i),
			Channel: "web", SellerID: &seller, Status: "new", PaymentStatus: "pending", PaymentMethod: "va", Courier: "jne",
			WarehouseID: "wh-race", Lines: []domain.OrderLine{{ProductID: "prd-race", VariantID: "var-race", Qty: 1, Price: 10_000 * (i + 1)}},
			Subtotal: 10_000 * (i + 1), Total: 10_000 * (i + 1), CreatedAt: at[i], Events: []domain.OrderEvent{},
		}
	}
	// Sold orders just outside the day on either side, which the day must leave out.
	outside := []domain.Order{orders[0], orders[0]}
	outside[0].ID, outside[0].Code, outside[0].CreatedAt, outside[0].Status = "ord-race-before", "RACE-B", "2026-10-06T16:59:59Z", "paid"
	outside[1].ID, outside[1].Code, outside[1].CreatedAt, outside[1].Status = "ord-race-after", "RACE-A", "2026-10-07T17:00:00Z", "paid"

	write := func(o domain.Order) error {
		return pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
			if err := store.Put(ctx, tx, "orders", o.ID, o); err != nil {
				return err
			}
			return readmodel.Apply(ctx, tx, map[string][]any{"orders": {o}}, map[string][]string{})
		})
	}
	for i := range orders {
		id := buyer(i)
		customer := map[string]any{"id": id, "tenantId": "ten-race", "name": "Race", "code": "C-" + id}
		if err := store.Put(ctx, db.Pool, "customers", id, customer); err != nil {
			t.Fatal(err)
		}
	}
	for _, o := range append(append([]domain.Order{}, orders...), outside...) {
		if err := write(o); err != nil {
			t.Fatal(err)
		}
	}

	for _, status := range []string{"paid", "processing", "packed"} {
		start := make(chan struct{})
		errs := make([]error, len(orders))
		var wg sync.WaitGroup
		for i := range orders {
			wg.Add(1)
			go func() {
				defer wg.Done()
				o := orders[i]
				o.Status, o.PaymentStatus = status, "paid"
				<-start
				errs[i] = write(o)
			}()
		}
		close(start)
		wg.Wait()
		for i, err := range errs {
			if err != nil {
				t.Fatalf("%s, order %d: %v", status, i, err)
			}
		}

		var n, revenue int64
		if err := db.Pool.QueryRow(ctx, `select coalesce(sum(orders), 0), coalesce(sum(revenue), 0) from sales_days
			where tenant_id = 'ten-race' and day = '2026-10-07'`).Scan(&n, &revenue); err != nil {
			t.Fatal(err)
		}
		if n != 10 || revenue != 550_000 {
			t.Fatalf("%s: sales day counts %d orders and %d revenue, want 10 and 550000", status, n, revenue)
		}
		var units, buyerOrders int64
		if err := db.Pool.QueryRow(ctx, `select (select coalesce(sum(units), 0) from product_days where tenant_id = 'ten-race' and day = '2026-10-07'),
			(select coalesce(sum(orders), 0) from seller_buyers where tenant_id = 'ten-race' and day = '2026-10-07')`).Scan(&units, &buyerOrders); err != nil {
			t.Fatal(err)
		}
		if units != 10 || buyerOrders != 10 {
			t.Fatalf("%s: product day has %d units and seller buyers %d orders, want 10 and 10", status, units, buyerOrders)
		}
		var metricOrders, spend int64
		if err := db.Pool.QueryRow(ctx, `select sum(orders), sum(spend) from customer_metrics where tenant_id = 'ten-race'`).Scan(&metricOrders, &spend); err != nil {
			t.Fatal(err)
		}
		if metricOrders != 12 || spend != 570_000 {
			t.Fatalf("%s: customer metrics count %d orders and %d spend, want 12 and 570000", status, metricOrders, spend)
		}
	}
	for day, want := range map[string]int64{"2026-10-06": 1, "2026-10-08": 1} {
		var n int64
		if err := db.Pool.QueryRow(ctx, `select coalesce(sum(orders), 0) from sales_days where tenant_id = 'ten-race' and day = $1`, day).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != want {
			t.Errorf("%s counts %d orders, want %d", day, n, want)
		}
	}
}
