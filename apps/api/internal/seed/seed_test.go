package seed_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// Every seed document must survive a trip through the Go types unchanged, so the API serves the
// apps the exact JSON their fixtures hold.
func TestSeedRoundTripsThroughDomainTypes(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	dir := testdb.SeedDir(t)
	if err := seed.Load(ctx, db, dir, "demo-pass"); err != nil {
		t.Fatal(err)
	}

	var state domain.AppState
	v := reflect.ValueOf(&state).Elem()
	for i := range v.NumField() {
		field := v.Type().Field(i)
		collection := field.Tag.Get("json")
		raw, err := store.Raw(ctx, db.Pool, collection, "")
		if err != nil {
			t.Fatalf("%s: %v", collection, err)
		}
		slice := reflect.MakeSlice(field.Type, 0, len(raw))
		for _, doc := range raw {
			item := reflect.New(field.Type.Elem())
			dec := json.NewDecoder(bytes.NewReader(doc))
			dec.DisallowUnknownFields()
			if err := dec.Decode(item.Interface()); err != nil {
				t.Fatalf("%s: decode: %v\n%s", collection, err, doc)
			}
			again, err := json.Marshal(item.Interface())
			if err != nil {
				t.Fatal(err)
			}
			if !sameJSON(t, doc, again) {
				t.Fatalf("%s: lossy mapping\n seed: %s\n   go: %s", collection, doc, again)
			}
			slice = reflect.Append(slice, item.Elem())
		}
		// Every seeded page shows what shoppers see, so no page starts with unpublished changes.
		if slice.Len() == 0 && collection != "pageDrafts" {
			t.Fatalf("%s: nothing seeded", collection)
		}
	}

	var n int
	if err := db.Pool.QueryRow(ctx, `select count(*) from credentials`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n == 0 {
		t.Fatal("no credentials seeded")
	}
	if _, err := os.Stat(filepath.Join(dir, "orders.json")); err != nil {
		t.Fatal(err)
	}
}

func sameJSON(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatal(err)
	}
	return reflect.DeepEqual(x, y)
}
