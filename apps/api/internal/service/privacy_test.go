package service_test

import (
	"context"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/marketing"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// Seeded customers carry no consent record, so a campaign reaches none of them until one agrees,
// and stops reaching them when they withdraw.
func TestCampaignsSkipCustomersWithoutMarketingConsent(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))})
	m := service.Meta{P: auth.Principal{Kind: auth.KindUser, ID: "usr-andi", Role: "tenant_admin", TenantIDs: []string{"ten-lari"}}, At: clock.FixtureNow}

	campaigns, err := store.ListTenant[domain.Campaign](ctx, db.Pool, "campaigns", "ten-lari")
	if err != nil {
		t.Fatal(err)
	}
	var campaign domain.Campaign
	var before service.CampaignAudience
	for _, c := range campaigns {
		if before, err = svc.Audience(ctx, m, c.ID); err != nil {
			t.Fatal(err)
		}
		if before.InSegment > 0 {
			campaign = c
			break
		}
	}
	if campaign.ID == "" {
		t.Fatal("no seeded campaign has an audience")
	}
	if before.Reach != 0 || before.Skipped != before.InSegment {
		t.Fatalf("seeded audience without consent: %+v", before)
	}
	var member string
	if _, err := svc.Run(ctx, func(tx *kernel.Tx) error {
		in, err := crm.SegmentAudience(tx, "ten-lari", *campaign.SegmentID, clock.Ms(m.At))
		member = in[0].ID
		return err
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.SetConsent(ctx, m, member, true, "staff", "2026-11"); err != nil {
		t.Fatal(err)
	}
	after, err := svc.Audience(ctx, m, campaign.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Reach != 1 || after.Skipped != before.InSegment-1 {
		t.Errorf("after one consent: %+v", after)
	}
	if _, err := svc.Run(ctx, func(tx *kernel.Tx) error {
		reach, _, err := marketing.Recipients(tx, "ten-lari", campaign.SegmentID, clock.Ms(m.At))
		if err == nil && (len(reach) != 1 || reach[0].ID != member) {
			t.Errorf("recipients: %+v", reach)
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.SetConsent(ctx, m, member, false, "staff", ""); err != nil {
		t.Fatal(err)
	}
	if again, _ := svc.Audience(ctx, m, campaign.ID); again.Reach != 0 {
		t.Errorf("after withdrawal: %+v", again)
	}
	// A second withdrawal is refused: nothing changes.
	if _, err := svc.SetConsent(ctx, m, member, false, "staff", ""); err == nil {
		t.Error("withdrawing twice changed something")
	}
}
