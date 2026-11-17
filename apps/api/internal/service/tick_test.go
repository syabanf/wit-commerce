package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// page-lari-trail is seeded as scheduled for 14 October; the tick after that time publishes it.
const trail, afterTrail = "page-lari-trail", "2026-10-14T10:00:00+07:00"

func trailService(t *testing.T) (*service.Service, *store.DB, service.Meta, domain.Page) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(context.Background(), db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))})
	page, err := store.Get[domain.Page](t.Context(), db.Pool, "pages", trail)
	if err != nil {
		t.Fatal(err)
	}
	maya := service.Meta{P: auth.Principal{Kind: auth.KindUser, ID: "usr-maya", Role: "platform_admin"}, At: clock.FixtureNow}
	return svc, db, maya, page
}

func TestTickPublishesAScheduledPagesDraft(t *testing.T) {
	svc, db, maya, page := trailService(t)
	sections := append([]domain.PageSection(nil), page.Sections...)
	sections[0].Headline = "Trail season is here"
	seo := domain.PageSeo{Title: "Trail season", Description: page.Seo.Description}
	if _, err := svc.SavePage(t.Context(), maya, trail, service.SavePageInput{Sections: sections, Seo: &seo, Note: "Edit"}); err != nil {
		t.Fatal(err)
	}
	if still, _ := store.Get[domain.Page](t.Context(), db.Pool, "pages", trail); still.Sections[0].Headline == "Trail season is here" {
		t.Fatal("saving a scheduled page changed the page instead of its draft")
	}

	if _, err := svc.Tick(t.Context(), afterTrail); err != nil {
		t.Fatal(err)
	}
	live, _ := store.Get[domain.Page](t.Context(), db.Pool, "pages", trail)
	if live.Status != "published" || live.Sections[0].Headline != "Trail season is here" || live.Seo.Title != "Trail season" {
		t.Fatalf("the tick did not publish the draft: %s %q %q", live.Status, live.Sections[0].Headline, live.Seo.Title)
	}
	if live.Revisions[0].Note != "Published" || live.Revisions[0].By != "system" || len(live.Revisions) != len(page.Revisions)+1 {
		t.Fatalf("revisions: %+v", live.Revisions[0])
	}
	if _, err := store.Get[domain.PageDraft](t.Context(), db.Pool, "pageDrafts", trail); err == nil {
		t.Fatal("the draft outlived the tick")
	}
}

// A draft that would not pass the publish checks stays a draft; the page goes live as scheduled.
func TestTickKeepsADraftThatFailsTheChecks(t *testing.T) {
	svc, db, maya, page := trailService(t)
	sections := append([]domain.PageSection(nil), page.Sections...)
	sections[0].Hidden = true // the hero is required
	if _, err := svc.SavePage(t.Context(), maya, trail, service.SavePageInput{Sections: sections, Note: "Hid the hero"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Tick(t.Context(), afterTrail); err != nil {
		t.Fatal(err)
	}
	live, _ := store.Get[domain.Page](t.Context(), db.Pool, "pages", trail)
	if live.Status != "published" || live.Sections[0].Hidden {
		t.Fatalf("status %s, hero hidden %v", live.Status, live.Sections[0].Hidden)
	}
	if _, err := store.Get[domain.PageDraft](t.Context(), db.Pool, "pageDrafts", trail); err != nil {
		t.Fatalf("the draft was lost: %v", err)
	}
}

// TestRollUpRunsOncePerDay: the timer calls the roll-up every minute, and it works once per WIB day.
func TestRollUpRunsOncePerDay(t *testing.T) {
	svc, db, _, _ := trailService(t)
	now := clock.MustParse(clock.FixtureNow)
	if err := svc.RollUpSales(t.Context(), now); err != nil {
		t.Fatal(err)
	}
	var done string
	if err := db.Pool.QueryRow(t.Context(), `select done_day from sales_rollup`).Scan(&done); err != nil || done != "2026-10-05" {
		t.Fatalf("done day %q (%v)", done, err)
	}
	// An old daily row appears; the same day does not roll up again, the next day does.
	if _, err := db.Pool.Exec(t.Context(), `insert into sales_days values ('old', 'ten-lari', '2024-01-02', 'web', null, null, 1, 100)`); err != nil {
		t.Fatal(err)
	}
	count := func() (n int) {
		_ = db.Pool.QueryRow(t.Context(), `select count(*) from sales_days where day < '2025-01-01'`).Scan(&n)
		return n
	}
	if err := svc.RollUpSales(t.Context(), now.Add(time.Hour)); err != nil || count() != 1 {
		t.Fatalf("rolled up twice in one day: %d rows left (%v)", count(), err)
	}
	if err := svc.RollUpSales(t.Context(), now.Add(24*time.Hour)); err != nil || count() != 0 {
		t.Fatalf("the next day left %d old rows (%v)", count(), err)
	}
}
