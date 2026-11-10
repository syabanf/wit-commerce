package httpapi_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

type inbox struct {
	mu   sync.Mutex
	sent []map[string]any
	fail bool
	// outbox sends the queued email, as the drain loop in cmd/api or cmd/notifier would.
	outbox *notifications.Notifications
}

func (b *inbox) count() int {
	if _, err := b.outbox.Drain(context.Background()); err != nil {
		panic(err)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.sent)
}

// link waits for mail number n and returns the token in its link.
func (b *inbox) link(t *testing.T, n int) (string, string) {
	t.Helper()
	for range 100 {
		if b.count() >= n {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if b.count() < n {
		t.Fatalf("expected mail number %d, got %d", n, b.count())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	text := b.sent[n-1]["text"].(string)
	found := regexp.MustCompile(`https?://\S+`).FindString(text)
	parsed, err := url.Parse(found)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"token", "reset", "verify"} {
		if v := parsed.Query().Get(key); v != "" {
			return v, found
		}
	}
	t.Fatalf("no token in %q", found)
	return "", ""
}

func mailEnv(t *testing.T) (*env, *inbox) {
	t.Helper()
	return mailEnvAt(t, "")
}

// mailEnvAt sets STORE_ROOT_DOMAIN to root.
func mailEnvAt(t *testing.T, root string) (*env, *inbox) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	box := &inbox{}
	resend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/emails" || r.Header.Get("Authorization") != "Bearer re_test" {
			t.Errorf("unexpected call to %s", r.URL.Path)
		}
		if box.fail {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		box.mu.Lock()
		box.sent = append(box.sent, m)
		box.mu.Unlock()
		_, _ = w.Write([]byte(`{"id":"x"}`))
	}))
	t.Cleanup(resend.Close)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	mailer := mail.New(resend.URL, "re_test", "Shop <noreply@example.com>")
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	box.outbox = &notifications.Notifications{Runtime: &kernel.Runtime{DB: db}, Mail: mailer, Log: log}
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Hub: events.New(),
		Mail: mailer, PublicURL: "https://shop.example.com", StoreRootDomain: root,
		Log: log, Version: "test",
	}))
	t.Cleanup(srv.Close)
	return &env{t: t, url: srv.URL + "/api/v1", db: db}, box
}

func TestStaffResetsAPasswordByEmailOnce(t *testing.T) {
	e, box := mailEnv(t)
	old := e.signIn("maya@lari.co.id", password)
	e.expect(202, "POST", "/auth/forgot", "", map[string]string{"email": "Maya@Lari.co.id"})
	token, link := box.link(t, 1)
	if !strings.HasPrefix(link, "https://shop.example.com/reset-password?token=") {
		t.Errorf("link: %s", link)
	}
	time.Sleep(1100 * time.Millisecond)
	e.expect(422, "POST", "/auth/reset", "", map[string]string{"token": token, "newPassword": "short"})
	e.expect(204, "POST", "/auth/reset", "", map[string]string{"token": token, "newPassword": "a brand new password"})
	e.expect(410, "POST", "/auth/reset", "", map[string]string{"token": token, "newPassword": "a second new password"})
	e.expect(401, "GET", "/auth/me", old, nil)
	e.signIn("maya@lari.co.id", "a brand new password")
}

func TestForgotRevealsNothingAndSendsNothingForUnknownEmail(t *testing.T) {
	e, box := mailEnv(t)
	e.expect(202, "POST", "/auth/forgot", "", map[string]string{"email": "nobody@example.com"})
	e.expect(202, "POST", "/shop/lari/forgot", "", map[string]string{"email": "nobody@example.com"})
	time.Sleep(100 * time.Millisecond)
	if box.count() != 0 {
		t.Errorf("sent %d emails for an unknown address", box.count())
	}
}

func TestOnlyTheNewestLinkWorksAndKindsDoNotMix(t *testing.T) {
	e, box := mailEnv(t)
	e.expect(202, "POST", "/auth/forgot", "", map[string]string{"email": "maya@lari.co.id"})
	first, _ := box.link(t, 1)
	e.expect(202, "POST", "/auth/forgot", "", map[string]string{"email": "maya@lari.co.id"})
	second, _ := box.link(t, 2)
	e.expect(410, "POST", "/auth/reset", "", map[string]string{"token": first, "newPassword": "a brand new password"})
	e.expect(410, "POST", "/shop/lari/reset", "", map[string]string{"token": second, "newPassword": "a brand new password"})
	e.expect(204, "POST", "/auth/reset", "", map[string]string{"token": second, "newPassword": "a brand new password"})
}

func TestMailToOneAddressIsCappedInSilence(t *testing.T) {
	e, box := mailEnv(t)
	for range 6 {
		e.expect(202, "POST", "/auth/forgot", "", map[string]string{"email": "maya@lari.co.id"})
	}
	time.Sleep(200 * time.Millisecond)
	if box.count() > 3 {
		t.Errorf("sent %d emails to one address in a minute", box.count())
	}
}

func TestVerifyingBringsGuestOrdersIntoTheAccount(t *testing.T) {
	e, box := mailEnv(t)
	email := "claim@example.com"
	guest := map[string]any{"id": "cus-claim", "tenantId": "ten-lari", "code": "LARI-C99998", "name": "Guest", "email": email, "points": 5}
	if code := e.call("POST", "/shop/lari/orders", "", map[string]any{"order": e.placeable("ord-claim", "cus-claim"), "customer": guest}, nil); code != 200 {
		t.Fatalf("guest order: %d", code)
	}
	var made struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	if code := e.call("POST", "/shop/lari/register", "", map[string]string{"name": "Owner", "email": email, "password": shopPassword}, &made); code != 200 {
		t.Fatalf("register: %d", code)
	}
	var before struct {
		Orders        []domain.Order `json:"orders"`
		EmailVerified bool           `json:"emailVerified"`
	}
	e.call("GET", "/shop/lari/me", made.Token, nil, &before)
	if len(before.Orders) != 0 || before.EmailVerified {
		t.Fatalf("before verifying: %+v", before)
	}
	token, _ := box.link(t, 1)
	e.expect(410, "POST", "/shop/aruna/verify", "", map[string]string{"token": "made-up"})
	e.expect(204, "POST", "/shop/lari/verify", "", map[string]string{"token": token})
	var after struct {
		Customer      domain.Customer `json:"customer"`
		Orders        []domain.Order  `json:"orders"`
		EmailVerified bool            `json:"emailVerified"`
	}
	e.call("GET", "/shop/lari/me", made.Token, nil, &after)
	if len(after.Orders) != 1 || after.Orders[0].ID != "ord-claim" || !after.EmailVerified || after.Customer.Points < 5 {
		t.Errorf("after verifying: %+v", after)
	}
}

func TestAResetLinkFromOneStoreFailsAtAnother(t *testing.T) {
	e, box := mailEnv(t)
	e.call("POST", "/shop/lari/register", "", map[string]string{"name": "Owner", "email": "two@example.com", "password": shopPassword}, nil)
	box.link(t, 1)
	e.expect(202, "POST", "/shop/lari/forgot", "", map[string]string{"email": "two@example.com"})
	token, link := box.link(t, 2)
	if !strings.Contains(link, "/shop/lari/account?reset=") {
		t.Errorf("link: %s", link)
	}
	e.expect(410, "POST", "/shop/aruna/reset", "", map[string]string{"token": token, "newPassword": "a brand new password"})
}

func TestShopperLinksGoToTheStoreHost(t *testing.T) {
	e, box := mailEnvAt(t, "commerce.example.com")
	e.call("POST", "/shop/lari/register", "", map[string]string{"name": "Owner", "email": "host@example.com", "password": shopPassword}, nil)
	if _, link := box.link(t, 1); !strings.HasPrefix(link, "https://lari.commerce.example.com/account?verify=") {
		t.Errorf("verify link: %s", link)
	}
	e.expect(202, "POST", "/shop/lari/forgot", "", map[string]string{"email": "host@example.com"})
	if _, link := box.link(t, 2); !strings.HasPrefix(link, "https://lari.commerce.example.com/account?reset=") {
		t.Errorf("reset link: %s", link)
	}
}

func TestEmailOffSaysSoWithoutAKey(t *testing.T) {
	e := setup(t)
	e.expect(503, "POST", "/auth/forgot", "", map[string]string{"email": "maya@lari.co.id"})
	e.expect(503, "POST", "/shop/lari/forgot", "", map[string]string{"email": "a@example.com"})
}

func TestInvitationKeepsThePasswordFromTheAdmin(t *testing.T) {
	e, box := mailEnv(t)
	admin := e.signIn("andi@lari.co.id", password)
	var made struct {
		User              domain.User `json:"user"`
		TemporaryPassword string      `json:"temporaryPassword"`
		EmailSent         bool        `json:"emailSent"`
	}
	if code := e.call("POST", "/users", admin, newStaff("invited@example.com", "marketing", "ten-lari"), &made); code != 200 {
		t.Fatalf("create: %d", code)
	}
	if made.TemporaryPassword != "" || !made.EmailSent || !made.User.Invited {
		t.Fatalf("response: %+v", made)
	}
	first, link := box.link(t, 1)
	if !strings.Contains(link, "/reset-password?token=") || !strings.Contains(link, "invite=1") {
		t.Errorf("link: %s", link)
	}
	// Sending again retires the first link.
	path := "/users/" + made.User.ID + "/invite"
	e.expect(200, "POST", path, admin, nil)
	second, _ := box.link(t, 2)
	e.expect(410, "POST", "/auth/reset", "", map[string]string{"token": first, "newPassword": "my own long password"})
	e.expect(204, "POST", "/auth/reset", "", map[string]string{"token": second, "newPassword": "my own long password"})
	e.signIn("invited@example.com", "my own long password")
	var me struct {
		User domain.User `json:"user"`
	}
	e.call("GET", "/auth/me", e.signIn("invited@example.com", "my own long password"), nil, &me)
	if me.User.Invited {
		t.Error("still invited after choosing a password")
	}
	e.expect(409, "POST", path, admin, nil)
}

func TestAnInvitationCannotBeSentAcrossBrands(t *testing.T) {
	e, box := mailEnv(t)
	var made struct {
		User domain.User `json:"user"`
	}
	if code := e.call("POST", "/users", e.signIn("hendra@teknika.co.id", password), newStaff("t2@example.com", "marketing", "ten-teknika"), &made); code != 200 {
		t.Fatalf("create: %d", code)
	}
	box.link(t, 1)
	e.expect(403, "POST", "/users/"+made.User.ID+"/invite", e.signIn("andi@lari.co.id", password), nil)
}

func TestAdminResetByEmailShowsNoPasswordAndEndsTheOldOne(t *testing.T) {
	e, box := mailEnv(t)
	admin := e.signIn("andi@lari.co.id", password)
	var out struct {
		TemporaryPassword string `json:"temporaryPassword"`
		EmailSent         bool   `json:"emailSent"`
	}
	if code := e.call("POST", "/users/usr-maya/reset-password", admin, nil, &out); code != 200 {
		t.Fatalf("reset: %d", code)
	}
	if out.TemporaryPassword != "" || !out.EmailSent {
		t.Fatalf("response: %+v", out)
	}
	e.expect(401, "POST", "/auth/login", "", map[string]string{"email": "maya@lari.co.id", "password": password})
	token, _ := box.link(t, 1)
	e.expect(204, "POST", "/auth/reset", "", map[string]string{"token": token, "newPassword": "my own long password"})
}

func TestAFailedSendTellsTheAdmin(t *testing.T) {
	e, box := mailEnv(t)
	box.fail = true
	var out struct {
		EmailSent bool `json:"emailSent"`
	}
	if code := e.call("POST", "/users", e.signIn("andi@lari.co.id", password), newStaff("fail@example.com", "marketing", "ten-lari"), &out); code != 200 {
		t.Fatalf("create: %d", code)
	}
	if out.EmailSent {
		t.Error("the admin was told a failed invitation went out")
	}
}

func TestAFailedResendKeepsTheEarlierLink(t *testing.T) {
	e, box := mailEnv(t)
	admin := e.signIn("andi@lari.co.id", password)
	var made struct {
		User domain.User `json:"user"`
	}
	if code := e.call("POST", "/users", admin, newStaff("keep@example.com", "marketing", "ten-lari"), &made); code != 200 {
		t.Fatalf("create: %d", code)
	}
	first, _ := box.link(t, 1)
	box.mu.Lock()
	box.fail = true
	box.mu.Unlock()
	var out struct {
		EmailSent bool `json:"emailSent"`
	}
	e.call("POST", "/users/"+made.User.ID+"/invite", admin, nil, &out)
	if out.EmailSent {
		t.Error("a failed send reported success")
	}
	e.expect(204, "POST", "/auth/reset", "", map[string]string{"token": first, "newPassword": "my own long password"})
}

func TestInvitationOutcomesLandInTheHistory(t *testing.T) {
	e, box := mailEnv(t)
	admin := e.signIn("andi@lari.co.id", password)
	var made struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	e.call("POST", "/users", admin, newStaff("log@example.com", "marketing", "ten-lari"), &made)
	token, _ := box.link(t, 1)
	box.mu.Lock()
	box.fail = true
	box.mu.Unlock()
	e.call("POST", "/users/"+made.User.ID+"/invite", admin, nil, nil)
	e.expect(204, "POST", "/auth/reset", "", map[string]string{"token": token, "newPassword": "my own long password"})
	page := e.events(admin, "tenantId=ten-lari")
	var actions []string
	for _, event := range page.Events {
		actions = append(actions, event.Action)
	}
	if strings.Join(actions, " ") != "invite_accepted invite_failed invite_sent created" {
		t.Errorf("actions: %v", actions)
	}
	if page.Events[0].ActorName != "New Person" {
		t.Errorf("the person accepting is the actor: %+v", page.Events[0])
	}
}
