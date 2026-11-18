package service_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// stockOrder is a cash-on-delivery order for qty units of the level's variant at its warehouse,
// built on a seeded order of the same store.
func stockOrder(t *testing.T, db *store.DB, level domain.StockLevel, id string, qty int) domain.Order {
	t.Helper()
	var o domain.Order
	if err := db.Pool.QueryRow(t.Context(), `select data from orders where tenant_id = $1 limit 1`, level.TenantID).Scan(&o); err != nil {
		t.Fatal(err)
	}
	o.ID, o.Code = id, "LOCK-"+id
	o.Status, o.PaymentStatus, o.PaymentMethod, o.PaymentTypeID = "new", "pending", "cod", nil
	o.WarehouseID = level.WarehouseID
	o.Lines = []domain.OrderLine{{ProductID: level.ProductID, VariantID: level.VariantID, Qty: qty, Price: 10_000}}
	o.DiscountLines, o.VoucherCode = nil, nil
	o.Subtotal, o.Total, o.RefundedAmount = 10_000*qty, 10_000*qty, 0
	o.Events = []domain.OrderEvent{}
	return o
}

// TestOrdersForOtherVariantsDoNotWait: an order holds the stock row of one variant; an order for
// another variant of the same warehouse places without waiting for it.
func TestOrdersForOtherVariantsDoNotWait(t *testing.T) {
	svc, db, maya, _ := trailService(t)
	var a, b domain.StockLevel
	if err := db.Pool.QueryRow(t.Context(), `select a.data, b.data from stock a join stock b
		on b.warehouse_id = a.warehouse_id and b.tenant_id = a.tenant_id and b.variant_id <> a.variant_id
		where (b.data->>'onHand')::int - (b.data->>'reserved')::int >= 1 order by a.id, b.id limit 1`).Scan(&a, &b); err != nil {
		t.Fatal(err)
	}
	holder, err := db.Pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = holder.Rollback(context.Background()) }()
	if _, err := holder.Exec(t.Context(), `select 1 from stock where id = $1 for update`, a.ID); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	start := time.Now()
	if _, err := svc.PlaceOrder(ctx, maya, stockOrder(t, db, b, "ord-lock-other", 1), nil); err != nil {
		t.Fatalf("the order for another variant waited or failed after %s: %v", time.Since(start).Round(time.Millisecond), err)
	}
}

// TestLastUnitSellsOnce: two orders race for the last unit of a variant; one places and the other is
// refused with the sold-out sentence.
func TestLastUnitSellsOnce(t *testing.T) {
	svc, db, maya, _ := trailService(t)
	var level domain.StockLevel
	if err := db.Pool.QueryRow(t.Context(), `select data from stock order by id limit 1`).Scan(&level); err != nil {
		t.Fatal(err)
	}
	level.OnHand = level.Reserved + 1
	if err := store.Put(t.Context(), db.Pool, "stock", level.ID, level); err != nil {
		t.Fatal(err)
	}
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = svc.PlaceOrder(t.Context(), maya, stockOrder(t, db, level, fmt.Sprintf("ord-lock-last-%d", i), 1), nil)
		}()
	}
	wg.Wait()
	placed, refused := 0, 0
	for _, err := range errs {
		var no kernel.Refusal
		switch {
		case err == nil:
			placed++
		case errors.As(err, &no) && no.Reason == "One item just sold out. Remove it to continue.":
			refused++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if placed != 1 || refused != 1 {
		t.Fatalf("%d placed and %d refused, want 1 and 1", placed, refused)
	}
	after, err := store.Get[domain.StockLevel](t.Context(), db.Pool, "stock", level.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Reserved != level.Reserved+1 {
		t.Fatalf("reserved %d, want %d", after.Reserved, level.Reserved+1)
	}
}
