package httpapi_test

import (
	"context"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// syntheticTenant copies ten-lari's tenant row and segments into ten-synth and adds customers,
// their metrics and order rows, then gives andi access to it.
func syntheticTenant(t *testing.T, e *env, customers, orders int) {
	t.Helper()
	ctx := context.Background()
	for _, sql := range []string{
		`insert into tenants (id, data) select 'ten-synth', data || '{"id": "ten-synth", "subdomain": "synth", "name": "Synth", "code": "SYNTH"}' from tenants where id = 'ten-lari'`,
		`insert into segments (id, data) select id || '-synth', data || '{"tenantId": "ten-synth"}' || jsonb_build_object('id', id || '-synth') from segments where tenant_id = 'ten-lari'`,
		`insert into customers (id, data) select 'cus-s-' || i, jsonb_build_object('id', 'cus-s-' || i, 'tenantId', 'ten-synth', 'code', 'S-' || i,
			'name', 'Synth Person ' || i, 'tier', (array['member', 'silver', 'gold', 'platinum'])[i % 4 + 1],
			'stage', (array['registered', 'first_buyer', 'repeat_buyer', 'loyal', 'at_risk', 'dormant'])[i % 6 + 1],
			'city', 'Jakarta', 'interests', '[]'::jsonb, 'tags', '[]'::jsonb, 'sellerId', null, 'points', 0, 'source', 'web',
			'createdAt', '2026-01-01T00:00:00+07:00') from generate_series(1, $1) i`,
		`insert into customer_metrics (customer_id, tenant_id, orders, spend, first_at, last_at, product_counts, last_abandoned_at, last_purchase_event_at)
			select 'cus-s-' || i, 'ten-synth', i % 7, (i % 7) * 350000, timestamptz '2026-10-05' - interval '1 day' * (i % 700),
			timestamptz '2026-10-05' - interval '1 day' * (i % 400), '{}', case when i % 13 = 0 then timestamptz '2026-10-03' end, null
			from generate_series(1, $1) i`,
		`update users set data = jsonb_set(data, '{tenantIds}', (data->'tenantIds') || '"ten-synth"') where data->>'email' = 'andi@lari.co.id'`,
	} {
		var args []any
		if strings.Contains(sql, "$1") {
			args = []any{customers}
		}
		if _, err := e.db.Pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	_, err := e.db.Pool.Exec(ctx, `insert into order_rows (id, tenant_id, code, customer_id, customer_name, customer_code, status, payment_status,
		channel, seller_id, created_at, total, item_count, agent, refunded_amount, search, payment_method)
		select 'ord-s-' || i, 'ten-synth', 'SO-' || i, 'cus-s-' || (i % $2 + 1), 'Synth Person', 'S-' || (i % $2 + 1),
			(array['completed', 'completed', 'completed', 'delivered', 'shipped', 'paid', 'processing', 'packed', 'cancelled', 'new'])[i % 10 + 1],
			'paid', 'web', null, timestamptz '2026-10-05' - interval '1 minute' * i, 250000, 1, false, 0, 'so-' || i, 'transfer'
		from generate_series(1, $1) i`, orders, customers)
	if err != nil {
		t.Fatal(err)
	}
}

// TestAssistantFactsTiming times questions on a synthetic brand. ASSISTANT_TIMING=full uses 50,000
// customers and 200,000 order rows; the default is a tenth of that, to keep the suite quick.
func TestAssistantFactsTiming(t *testing.T) {
	e, _, _ := assistantEnv(t)
	customers, orders := 5_000, 20_000
	if os.Getenv("ASSISTANT_TIMING") == "full" {
		customers, orders = 50_000, 200_000
	}
	syntheticTenant(t, e, customers, orders)
	path := "/ai/assistant?tenantId=ten-synth"
	var took []time.Duration
	for range 3 {
		start := time.Now()
		if code := e.call("POST", path, e.admin, ask("How big are my segments?", "/customers/segments"), nil); code != 200 {
			t.Fatalf("assistant: %d", code)
		}
		took = append(took, time.Since(start))
	}
	t.Logf("%d customers, %d order rows: first question %v, then %v and %v", customers, orders, took[0], took[1], took[2])
	limit := 3 * time.Second
	if v, err := strconv.Atoi(os.Getenv("ASSISTANT_TIMING_LIMIT_MS")); err == nil {
		limit = time.Duration(v) * time.Millisecond
	}
	if took[0] > limit {
		t.Errorf("the first question took %v, over %v", took[0], limit)
	}
}
