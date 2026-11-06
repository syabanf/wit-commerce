package httpapi_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

const savedKey = "re_saved_0123456789abcdef"

// resendCall is what the fake Resend saw.
type resendCall struct {
	key, from, to string
}

type fakeResend struct {
	mu     sync.Mutex
	calls  []resendCall
	refuse bool
}

func (f *fakeResend) last(t *testing.T) resendCall {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.calls) == 0 {
		t.Fatal("Resend was not called")
	}
	return f.calls[len(f.calls)-1]
}

// settingsEnv runs the API with a fake Resend. envKey, when set, plays RESEND_API_KEY.
func settingsEnv(t *testing.T, envKey string) (*env, *fakeResend, *notifications.Notifications) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	fake := &fakeResend{}
	resend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var m struct {
			From string   `json:"from"`
			To   []string `json:"to"`
		}
		_ = json.NewDecoder(r.Body).Decode(&m)
		fake.mu.Lock()
		fake.calls = append(fake.calls, resendCall{strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), m.From, m.To[0]})
		refuse := fake.refuse
		fake.mu.Unlock()
		if refuse {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"name":"validation_error","message":"The example.com domain is not verified."}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"x"}`))
	}))
	t.Cleanup(resend.Close)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	vault, _ := auth.DeriveVault("test")
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	envMail := mail.New(resend.URL, envKey, "Env <env@example.com>")
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(),
		Mail: envMail, ResendURL: resend.URL, PublicURL: "https://shop.example.com", Log: log, Version: "test",
	}))
	t.Cleanup(srv.Close)
	// worker drains the outbox as cmd/notifier would: its own process, the same database and key.
	worker := &notifications.Notifications{Runtime: &kernel.Runtime{DB: db, Vault: vault}, Mail: envMail, ResendURL: resend.URL, Log: log}
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login("dewi@commerceos.id")
	return e, fake, worker
}

func (e *env) emailSettings() (notifications.EmailSettings, string) {
	e.t.Helper()
	req, _ := http.NewRequest("GET", e.url+"/settings/email", nil)
	req.Header.Set("Authorization", "Bearer "+e.admin)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var out notifications.EmailSettings
	if res.StatusCode != 200 || json.Unmarshal(raw, &out) != nil {
		e.t.Fatalf("GET /settings/email: %d %s", res.StatusCode, raw)
	}
	return out, string(raw)
}

func TestOnlyAPlatformAdminReachesEmailSettings(t *testing.T) {
	e, fake, _ := settingsEnv(t, "")
	andi := e.login("andi@lari.co.id")
	body := map[string]string{"key": savedKey, "from": "Shop <shop@example.com>"}
	e.expect(401, "GET", "/settings/email", "", nil)
	e.expect(403, "GET", "/settings/email", andi, nil)
	e.expect(403, "PUT", "/settings/email", andi, body)
	e.expect(403, "POST", "/settings/email/test", andi, nil)
	var key struct {
		Secret string `json:"secret"`
	}
	e.call("POST", "/tenants/ten-lari/credentials", e.admin, map[string]any{"name": "ERP", "scopes": []string{"catalog:read"}}, &key)
	e.expect(403, "GET", "/settings/email", key.Secret, nil)
	if got, _ := e.emailSettings(); got.KeySet || got.Source != notifications.SourceOff {
		t.Errorf("a refused save changed the settings: %+v", got)
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if len(fake.calls) != 0 {
		t.Errorf("a refused test sent email")
	}
}

func TestEmailSettingsNeverShowTheKeyAndKeepItWhenLeftEmpty(t *testing.T) {
	e, fake, _ := settingsEnv(t, "")
	e.expect(422, "PUT", "/settings/email", e.admin, map[string]string{"from": "Shop <shop@example.com>"})
	e.expect(422, "PUT", "/settings/email", e.admin, map[string]string{"key": savedKey, "from": "shop@localhost"})
	e.expect(422, "PUT", "/settings/email", e.admin, map[string]string{"key": savedKey, "from": "Shop"})
	e.expect(200, "PUT", "/settings/email", e.admin, map[string]string{"key": savedKey, "from": "Shop <shop@example.com>"})
	got, raw := e.emailSettings()
	if strings.Contains(raw, savedKey) || strings.Contains(raw, "0123456789") {
		t.Fatalf("GET leaked the key: %s", raw)
	}
	if !got.KeySet || got.KeyLast4 != "cdef" || got.From != "Shop <shop@example.com>" || got.Source != notifications.SourceSettings ||
		got.UpdatedBy == nil || *got.UpdatedBy != "usr-dewi" || got.UpdatedAt == nil {
		t.Errorf("settings: %+v", got)
	}
	var stored []byte
	if err := e.db.Pool.QueryRow(t.Context(), `select ciphertext from email_settings`).Scan(&stored); err != nil || strings.Contains(string(stored), savedKey) {
		t.Errorf("the key is not sealed: %v", err)
	}

	e.expect(200, "PUT", "/settings/email", e.admin, map[string]string{"key": "", "from": "News <news@example.com>"})
	var result notifications.EmailTestResult
	if code := e.call("POST", "/settings/email/test", e.admin, nil, &result); code != 200 || !result.Ok || result.To != "dewi@commerceos.id" {
		t.Fatalf("test: %d %+v", code, result)
	}
	if call := fake.last(t); call.key != savedKey || call.from != "News <news@example.com>" || call.to != "dewi@commerceos.id" {
		t.Errorf("Resend saw %+v", call)
	}

	var audit int
	if err := e.db.Pool.QueryRow(t.Context(), `select count(*) from credential_events where tenant_id = 'platform'`).Scan(&audit); err != nil || audit != 3 {
		t.Errorf("audit rows: %d %v", audit, err)
	}
}

func TestSavedEmailSettingsWinOverTheEnvironment(t *testing.T) {
	e, fake, _ := settingsEnv(t, "re_env_0123456789")
	if got, _ := e.emailSettings(); got.Source != notifications.SourceEnv || got.KeyLast4 != "6789" || got.From != "Env <env@example.com>" {
		t.Fatalf("before saving: %+v", got)
	}
	e.expect(200, "PUT", "/settings/email", e.admin, map[string]string{"key": savedKey, "from": "Shop <shop@example.com>"})
	if got, _ := e.emailSettings(); got.Source != notifications.SourceSettings {
		t.Errorf("after saving: %+v", got)
	}
	e.expect(200, "POST", "/settings/email/test", e.admin, nil)
	if call := fake.last(t); call.key != savedKey || call.from != "Shop <shop@example.com>" {
		t.Errorf("Resend saw %+v", call)
	}
}

func TestTestEmailReportsResendsRefusalWithoutTheKey(t *testing.T) {
	e, fake, _ := settingsEnv(t, "")
	var result notifications.EmailTestResult
	if e.call("POST", "/settings/email/test", e.admin, nil, &result); result.Ok || result.Error == "" {
		t.Errorf("test with email off: %+v", result)
	}
	e.expect(200, "PUT", "/settings/email", e.admin, map[string]string{"key": savedKey, "from": "Shop <shop@example.com>"})
	fake.mu.Lock()
	fake.refuse = true
	fake.mu.Unlock()
	e.call("POST", "/settings/email/test", e.admin, nil, &result)
	if result.Ok || !strings.Contains(result.Error, "403") || !strings.Contains(result.Error, "domain is not verified") || strings.Contains(result.Error, savedKey) {
		t.Errorf("refused test: %+v", result)
	}
}

func TestAKeySavedInTheConsoleTurnsEmailOnWithoutARestart(t *testing.T) {
	e, fake, worker := settingsEnv(t, "")
	forgot := map[string]string{"email": "maya@lari.co.id"}
	e.expect(503, "POST", "/auth/forgot", "", forgot)
	if sent, err := worker.Drain(t.Context()); err != nil || sent != 0 {
		t.Fatalf("drain with email off: %d %v", sent, err)
	}
	e.expect(200, "PUT", "/settings/email", e.admin, map[string]string{"key": savedKey, "from": "Shop <shop@example.com>"})
	e.expect(202, "POST", "/auth/forgot", "", forgot)
	if sent, err := worker.Drain(t.Context()); err != nil || sent != 1 {
		t.Fatalf("drain after saving: %d %v", sent, err)
	}
	if call := fake.last(t); call.key != savedKey || call.to != "maya@lari.co.id" {
		t.Errorf("Resend saw %+v", call)
	}
}
