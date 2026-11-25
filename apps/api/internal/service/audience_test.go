package service_test

import (
	"context"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// Postgres counts a segment's reach; the numbers must equal loading every member into Go and
// keeping those with marketing consent, for each segment of each brand, now and later.
func TestSegmentReachCountsWhatTheMembersGive(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))})
	// Every third customer of each brand agrees to marketing, and one of them withdraws again.
	customers, err := store.List[domain.Customer](ctx, db.Pool, "customers", "")
	if err != nil {
		t.Fatal(err)
	}
	withdrawn := map[string]bool{}
	for i, c := range customers {
		if i%3 != 0 {
			continue
		}
		m := service.Meta{P: auth.Principal{Kind: auth.KindUser, ID: "usr-dewi", Role: "platform_admin"}, At: clock.FixtureNow}
		if _, err := svc.SetConsent(ctx, m, c.ID, true, "staff", "2026-11"); err != nil {
			t.Fatal(err)
		}
		if !withdrawn[c.TenantID] {
			withdrawn[c.TenantID] = true
			if _, err := svc.SetConsent(ctx, m, c.ID, false, "staff", ""); err != nil {
				t.Fatal(err)
			}
		}
	}
	segments, err := store.List[domain.Segment](ctx, db.Pool, "segments", "")
	if err != nil {
		t.Fatal(err)
	}
	reached := 0
	for _, at := range []int64{clock.Ms(clock.FixtureNow), clock.Ms(clock.FixtureNow) + 90*clock.Day} {
		for _, seg := range segments {
			if _, err := svc.Run(ctx, func(tx *kernel.Tx) error {
				members, err := crm.SegmentAudience(tx, seg.TenantID, seg.ID, at)
				if err != nil {
					return err
				}
				want := 0
				for _, c := range members {
					if rules.MarketingAllowed(c) {
						want++
					}
				}
				in, reach, err := crm.SegmentReach(tx, seg.TenantID, seg.ID, at)
				if in != len(members) || reach != want {
					t.Errorf("segment %s at %d: counted %d/%d, members give %d/%d", seg.ID, at, in, reach, len(members), want)
				}
				reached += reach
				return err
			}); err != nil {
				t.Fatal(err)
			}
		}
	}
	if reached == 0 {
		t.Error("no segment reached anyone, so the consent filter went untested")
	}
}
