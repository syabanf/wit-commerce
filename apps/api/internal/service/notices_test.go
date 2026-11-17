package service_test

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// mailService is the service with shopper email on: a mail client that is never called, since these
// tests read the queue, not the inbox.
func mailService(t *testing.T, client *mail.Client) (*service.Service, *store.DB, service.Meta) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(context.Background(), db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))})
	svc.UseShopperNotices(&notifications.Notifications{
		Runtime: svc.Runtime, Mail: client, PublicURL: "https://commerce.example.com",
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	admin := service.Meta{P: auth.Principal{Kind: auth.KindUser, ID: "usr-andi", Role: "tenant_admin", TenantIDs: []string{"ten-lari"}}, At: clock.FixtureNow}
	return svc, db, admin
}

// packedOrder is a lari order ready to ship whose customer has an email.
func packedOrder(t *testing.T, db *store.DB, skip ...string) domain.Order {
	t.Helper()
	orders, err := store.List[domain.Order](t.Context(), db.Pool, "orders", "tenant_id = 'ten-lari' and status = 'packed'")
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range orders {
		c, err := store.Get[domain.Customer](t.Context(), db.Pool, "customers", o.CustomerID)
		if err == nil && c.Email != "" && !strings.Contains(strings.Join(skip, " "), o.ID) {
			return o
		}
	}
	t.Fatal("no packed order with a customer email in the seed")
	return domain.Order{}
}

type queuedEmail struct{ to, subject, text, kind string }

func outbox(t *testing.T, db *store.DB) []queuedEmail {
	t.Helper()
	rows, err := db.Pool.Query(t.Context(), `select "to", subject, text, kind from email_outbox order by id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []queuedEmail
	for rows.Next() {
		var e queuedEmail
		if err := rows.Scan(&e.to, &e.subject, &e.text, &e.kind); err != nil {
			t.Fatal(err)
		}
		out = append(out, e)
	}
	return out
}

func TestShippingQueuesOneEmailWithTheTrackingNumber(t *testing.T) {
	svc, db, admin := mailService(t, mail.New("http://127.0.0.1:1", "re_test", "Shop <noreply@example.com>"))
	o := packedOrder(t, db)
	if _, err := svc.AdvanceOrder(t.Context(), admin, o.ID, new("JNE-0042")); err != nil {
		t.Fatal(err)
	}
	got := outbox(t, db)
	if len(got) != 1 || got[0].kind != "shopper_order_shipped" || !strings.Contains(got[0].text, "JNE-0042") {
		t.Fatalf("outbox after shipping: %+v", got)
	}
	// The same event again, as a retried action would raise it, queues nothing more.
	shipped, _ := store.Get[domain.Order](t.Context(), db.Pool, "orders", o.ID)
	err := pgx.BeginFunc(t.Context(), db.Pool, func(tx pgx.Tx) error {
		return svc.Notices.QueueNotices(t.Context(), tx, []kernel.Notice{{Kind: "order_shipped", Order: shipped}})
	})
	if err != nil {
		t.Fatal(err)
	}
	if n := len(outbox(t, db)); n != 1 {
		t.Errorf("a repeated event queued %d emails", n)
	}

	// The brand switches shipping emails off: the next parcel goes out without one.
	if _, err := svc.SetShopSettings(t.Context(), admin, "ten-lari", 7, []string{"order_shipped"}); err != nil {
		t.Fatal(err)
	}
	next := packedOrder(t, db, o.ID)
	if _, err := svc.AdvanceOrder(t.Context(), admin, next.ID, nil); err != nil {
		t.Fatal(err)
	}
	if n := len(outbox(t, db)); n != 1 {
		t.Errorf("a switched-off email was queued: %d rows", n)
	}
}

func TestNoEmailWhenEmailIsOff(t *testing.T) {
	svc, db, admin := mailService(t, nil)
	if _, err := svc.AdvanceOrder(t.Context(), admin, packedOrder(t, db).ID, nil); err != nil {
		t.Fatal(err)
	}
	if got := outbox(t, db); len(got) != 0 {
		t.Errorf("email is off but %d rows were queued", len(got))
	}
}
