package readmodel_test

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// TestProjectionMatchesTheDemo loads the seed, lets the projection build every read model and
// compares the rows with what packages/fixtures/src/facts.ts derives from the same seed
// (testdata/readmodels.json, written by pnpm gen:golden). Both modes then feed the analytics alike.
func TestProjectionMatchesTheDemo(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/readmodels.json")
	if err != nil {
		t.Fatal(err)
	}
	var want map[string][]map[string]any
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	var tenants []string
	rows, err := db.Pool.Query(ctx, `select id from tenants`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		tenants = append(tenants, id)
	}
	rows.Close()

	got := map[string][]json.RawMessage{}
	got[readmodel.CustomerMetricsCollection], err = readmodel.CustomerMetricsRows(ctx, db.Pool, "tenant_id = any($1)", tenants)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []string{readmodel.SalesDaysCollection, readmodel.ProductDaysCollection, readmodel.SellerBuyersCollection} {
		if got[c], err = readmodel.FactRows(ctx, db.Pool, c, "tenant_id = any($1)", tenants); err != nil {
			t.Fatal(err)
		}
	}
	for _, collection := range readmodel.Collections {
		w := normalize(t, want[collection])
		var g []map[string]any
		for _, r := range got[collection] {
			var m map[string]any
			_ = json.Unmarshal(r, &m)
			g = append(g, m)
		}
		gn := normalize(t, g)
		if len(w) != len(gn) {
			t.Errorf("%s: %d rows, the demo derives %d", collection, len(gn), len(w))
			continue
		}
		for i := range w {
			if !reflect.DeepEqual(w[i], gn[i]) {
				t.Errorf("%s row %d differs:\n  api  %v\n  demo %v", collection, i, gn[i], w[i])
				break
			}
		}
	}
}

// normalize sorts rows by id and writes times as instants, so offsets and float forms compare.
func normalize(t *testing.T, rows []map[string]any) []map[string]any {
	t.Helper()
	for _, r := range rows {
		for k, v := range r {
			if s, ok := v.(string); ok && len(s) >= 20 && s[4] == '-' && s[10] == 'T' {
				at, err := time.Parse(time.RFC3339, s)
				if err == nil {
					r[k] = at.UTC().Format(time.RFC3339)
				}
			}
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i]["id"].(string) < rows[j]["id"].(string) })
	return rows
}
