package billing_test

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/billing"
)

// TestDefaultsMatchTheConsole reads PLAN_DEFAULTS in packages/fixtures/src/plans.ts and compares
// each plan's price and limits with Defaults.
func TestDefaultsMatchTheConsole(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	src, err := os.ReadFile(filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "..", "packages", "fixtures", "src", "plans.ts"))
	if err != nil {
		t.Fatal(err)
	}
	table := string(src)[strings.Index(string(src), "PLAN_DEFAULTS"):]
	number := func(block, key string) int {
		m := regexp.MustCompile(`\b` + key + `: ([0-9_]+)`).FindStringSubmatch(block)
		if m == nil {
			t.Fatalf("plans.ts has no %s", key)
		}
		n, _ := strconv.Atoi(strings.ReplaceAll(m[1], "_", ""))
		return n
	}
	for i, id := range billing.IDs {
		start := strings.Index(table, "\n  "+id+": {")
		end := len(table)
		if i+1 < len(billing.IDs) {
			end = strings.Index(table, "\n  "+billing.IDs[i+1]+": {")
		}
		if start < 0 || end < start {
			t.Fatalf("plans.ts has no %s plan", id)
		}
		block, want := table[start:end], billing.Defaults[id]
		if got := number(block, "price"); int64(got) != want.Price {
			t.Errorf("%s price: plans.ts %d, Go %d", id, got, want.Price)
		}
		for _, key := range billing.LimitKeys {
			if got := number(block, key); got != want.Limits.Of(key) {
				t.Errorf("%s %s: plans.ts %d, Go %d", id, key, got, want.Limits.Of(key))
			}
		}
	}
}
