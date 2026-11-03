// Package testdb opens the test database named by TEST_DATABASE_URL, migrates it and empties it,
// so each test package starts from a clean schema. Tests skip when the variable is unset.
package testdb

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Open connects, migrates and truncates. The pool closes when the test ends.
func Open(t *testing.T) *store.DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	db, err := store.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Pool.Close)
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := db.Truncate(ctx); err != nil {
		t.Fatal(err)
	}
	return db
}

// SeedDir is packages/fixtures/data, found from this file's location in the monorepo.
func SeedDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the seed directory")
	}
	dir := filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "packages", "fixtures", "data")
	if _, err := os.Stat(dir); err != nil {
		t.Fatal(err)
	}
	return dir
}
