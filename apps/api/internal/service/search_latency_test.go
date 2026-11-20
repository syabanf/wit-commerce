package service_test

import (
	"context"
	"fmt"
	"math/rand/v2"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// TestSearchLatency times searches over a generated catalogue of SEARCH_LATENCY products (try 4000)
// added to the seeded lari store. It runs only when the variable is set.
func TestSearchLatency(t *testing.T) {
	var n int
	if _, err := fmt.Sscan(os.Getenv("SEARCH_LATENCY"), &n); err != nil || n <= 0 {
		t.Skip("SEARCH_LATENCY not set")
	}
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	words := []string{"Velocity", "Trail", "Aero", "Merino", "Carbon", "Swift", "Ridge", "Tempo", "Cloud", "Summit", "Thermo", "Sepatu", "Kaos", "Botol", "Lari"}
	kinds := []string{"Shoe", "Tee", "Shorts", "Socks", "Cap", "Bottle", "Jacket", "Tights"}
	categories := []string{"cat-lari-road", "cat-lari-trail", "cat-lari-apparel", "cat-lari-acc", "cat-lari-nutri"}
	cushions := []string{"Low", "Medium", "Max"}
	r := rand.New(rand.NewPCG(1, 2))
	err := func() error {
		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		for i := range n {
			id := fmt.Sprintf("prd-gen-%05d", i)
			price := (r.IntN(400) + 5) * 5000
			p := domain.Product{
				ID: id, TenantID: "ten-lari", Code: fmt.Sprintf("GEN-%05d", i),
				Name:       fmt.Sprintf("%s %s %s %d", words[r.IntN(len(words))], words[r.IntN(len(words))], kinds[r.IntN(len(kinds))], i%97),
				CategoryID: categories[r.IntN(len(categories))], Type: "physical", Status: "active", Price: price,
				Tags:       []string{words[r.IntN(len(words))]},
				Attributes: map[string]string{"att-lari-cushion": cushions[r.IntN(3)]},
				Variants:   []domain.Variant{{ID: "var-" + id, Sku: fmt.Sprintf("GEN-%05d-1", i), Name: "Default", Price: price}},
				Views30d:   r.IntN(5000), CreatedAt: domain.IsoDate(clock.FixtureNow),
			}
			if err := store.Put(ctx, tx, "products", id, p); err != nil {
				return err
			}
			level := domain.StockLevel{ID: "stk-" + id, TenantID: "ten-lari", VariantID: "var-" + id, ProductID: id, WarehouseID: "wh-lari-ckr", OnHand: r.IntN(20)}
			if err := store.Put(ctx, tx, "stock", level.ID, level); err != nil {
				return err
			}
		}
		return tx.Commit(ctx)
	}()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, "analyze products; analyze stock"); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(time.Now())})
	cases := []struct {
		name string
		q    service.SearchQuery
	}{
		{"one word", service.SearchQuery{Q: "velocity"}},
		{"typo", service.SearchQuery{Q: "velocty"}},
		{"two words", service.SearchQuery{Q: "trail jacket"}},
		{"synonym", service.SearchQuery{Q: "sepatu"}},
		{"no words, filtered", service.SearchQuery{Category: "cat-lari-trail", InStock: true, Sort: service.SortPriceAsc}},
		{"no match", service.SearchQuery{Q: "qqqzzz"}},
	}
	for _, c := range cases {
		var times []time.Duration
		var total int
		for range 30 {
			start := time.Now()
			res, err := svc.SearchProducts(ctx, "ten-lari", c.q)
			if err != nil {
				t.Fatal(err)
			}
			times = append(times, time.Since(start))
			total = res.Total
		}
		slices.Sort(times)
		t.Logf("%-20s %5d results  p50 %6.1fms  p95 %6.1fms", c.name, total,
			float64(times[len(times)/2].Microseconds())/1000, float64(times[len(times)*95/100].Microseconds())/1000)
	}
}
