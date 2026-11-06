package notifications

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// TestTheNotifierPicksUpAChangedKey runs two processes' worth of Notifications on one database: the
// API saves settings, and the notifier, which never hears of the save, sends with them on its next drain.
func TestTheNotifierPicksUpAChangedKey(t *testing.T) {
	db := testdb.Open(t)
	var mu sync.Mutex
	var keys []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		keys = append(keys, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		mu.Unlock()
	}))
	t.Cleanup(srv.Close)
	vault, err := auth.DeriveVault("test")
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	runtime := &kernel.Runtime{DB: db, Vault: vault}
	api := &Notifications{Runtime: runtime, ResendURL: srv.URL, PublicURL: "https://shop.example.com", Log: log}
	notifier := &Notifications{Runtime: runtime, ResendURL: srv.URL, Log: log}
	admin := kernel.Meta{P: auth.Principal{Kind: auth.KindUser, ID: "usr-dewi", Role: "platform_admin"}, At: clock.FixtureNow}
	send := func(want string) {
		t.Helper()
		if err := enqueue(t.Context(), db.Pool, "test", mail.Message{To: "a@example.com", Subject: "s", Text: "t", HTML: "h"}); err != nil {
			t.Fatal(err)
		}
		sent, err := notifier.Drain(t.Context())
		if err != nil || sent != 1 {
			t.Fatalf("drain: %d %v", sent, err)
		}
		mu.Lock()
		defer mu.Unlock()
		if got := keys[len(keys)-1]; got != want {
			t.Errorf("sent with %q, want %q", got, want)
		}
	}

	if api.On() || notifier.Source() != SourceOff {
		t.Fatal("email is on before any key")
	}
	if sent, err := notifier.Drain(t.Context()); err != nil || sent != 0 {
		t.Fatalf("drain with email off: %d %v", sent, err)
	}
	if _, err := api.SaveEmailSettings(t.Context(), admin, EmailSettingsInput{Key: "re_first_0123456789", From: "Shop <shop@example.com>"}); err != nil {
		t.Fatal(err)
	}
	if !api.On() {
		t.Error("the saving process still reports email off")
	}
	send("re_first_0123456789")
	if _, err := api.SaveEmailSettings(t.Context(), admin, EmailSettingsInput{Key: "re_second_0123456789", From: "Shop <shop@example.com>"}); err != nil {
		t.Fatal(err)
	}
	send("re_second_0123456789")
}
