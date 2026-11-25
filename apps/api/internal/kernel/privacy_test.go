package kernel_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// An erasure scrubs the customer from the brand's assistant questions: email and phone anywhere,
// the full name and its longer parts as whole words. A short part alone, a longer word that holds a
// part, and another brand's questions stay.
func TestScrubAssistantLogTakesWholeNamesOnly(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	rows := map[string][2]string{
		"q1": {"ten-a", "Did Ani Wijaya (ani.w@example.com, +62 812-3456-7890) pay? Call 6281234567890."},
		"q2": {"ten-a", "Orders from Daniel and ANI last week"},
		"q3": {"ten-a", "Wijayakusuma stock, and is wijaya back?"},
		"q4": {"ten-b", "Did Ani Wijaya pay?"},
	}
	for id, r := range rows {
		if _, err := db.Pool.Exec(ctx, `insert into assistant_log (id, tenant_id, user_id, at, question) values ($1, $2, 'usr', now(), $3)`, id, r[0], r[1]); err != nil {
			t.Fatal(err)
		}
	}
	err := pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		return (&kernel.Tx{Ctx: ctx, Tx: tx}).ScrubAssistantLog("ten-a", "Erased", "ani.w@example.com", "+62 812-3456-7890", "Ani Wijaya")
	})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"q1": "Did Erased (Erased, Erased) pay? Call Erased.",
		"q2": "Orders from Daniel and ANI last week",
		"q3": "Wijayakusuma stock, and is Erased back?",
		"q4": "Did Ani Wijaya pay?",
	}
	for id, w := range want {
		var got string
		if err := db.Pool.QueryRow(ctx, `select question from assistant_log where id = $1`, id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != w {
			t.Errorf("%s: %q, want %q", id, got, w)
		}
	}
}
