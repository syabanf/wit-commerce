package crm_test

import (
	"context"
	"slices"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// fromEveryRow is the audience as campaigns/launch computed it before the read model: every order
// and event of the tenant.
func fromEveryRow(t *kernel.Tx, s domain.Segment, now int64) ([]string, error) {
	orders, err := kernel.TenantRows[domain.Order](t, "orders", s.TenantID)
	if err != nil {
		return nil, err
	}
	events, err := kernel.TenantRows[domain.CustomerEvent](t, "customerEvents", s.TenantID)
	if err != nil {
		return nil, err
	}
	customers, err := kernel.TenantRows[domain.Customer](t, "customers", s.TenantID)
	if err != nil {
		return nil, err
	}
	ctx := rules.NewSegmentContext(orders, events, now)
	var ids []string
	for _, c := range customers {
		if rules.InSegment(s, c, ctx) {
			ids = append(ids, c.ID)
		}
	}
	return ids, nil
}

func TestSegmentAudienceMatchesEveryRow(t *testing.T) {
	ctx := context.Background()
	db := testdb.Open(t)
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	rt := kernel.Runtime{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))}
	seedNow := clock.Ms(clock.FixtureNow)
	// The seed clock, plus moments that cross the 7-day abandoned-cart window and push recency.
	moments := []int64{seedNow, seedNow + 3*clock.Day, seedNow + 8*clock.Day, seedNow + 90*clock.Day}
	nonEmpty := 0
	_, err := rt.Run(ctx, func(tx *kernel.Tx) error {
		rows, err := tx.Query(ctx, `select id, tenant_id from segments order by id`)
		if err != nil {
			return err
		}
		var segments [][2]string
		for rows.Next() {
			var id, tenant string
			if err := rows.Scan(&id, &tenant); err != nil {
				return err
			}
			segments = append(segments, [2]string{id, tenant})
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if len(segments) == 0 {
			t.Fatal("the seed has no segments")
		}
		for _, seg := range segments {
			s, err := kernel.Get[domain.Segment](tx, "segments", seg[0], "segment")
			if err != nil {
				return err
			}
			for _, now := range moments {
				want, err := fromEveryRow(tx, s, now)
				if err != nil {
					return err
				}
				got, err := crm.SegmentAudience(tx, seg[1], seg[0], now)
				if err != nil {
					return err
				}
				var gotIDs []string
				for _, c := range got {
					gotIDs = append(gotIDs, c.ID)
				}
				if !slices.Equal(gotIDs, want) {
					t.Errorf("segment %s at %s: read model gives %v, every row gives %v", s.ID, clock.Iso(clock.FromMs(now)), gotIDs, want)
				}
				if len(want) > 0 {
					nonEmpty++
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if nonEmpty == 0 {
		t.Fatal("every audience is empty, so the comparison proves nothing")
	}
}
