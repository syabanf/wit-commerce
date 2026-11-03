package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

const password = "test-password"

type env struct {
	t     *testing.T
	url   string
	db    *store.DB
	vault *auth.Vault
	admin string
}

func setup(t *testing.T) *env {
	t.Helper()
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	signer, err := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	vault, err := auth.DeriveVault("test")
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login("andi@lari.co.id")
	return e
}

func (e *env) login(email string) string {
	e.t.Helper()
	var out struct {
		Token string `json:"token"`
	}
	if code := e.call("POST", "/auth/login", "", map[string]string{"email": email, "password": password}, &out); code != 200 {
		e.t.Fatalf("login %s: %d", email, code)
	}
	return out.Token
}

func (e *env) call(method, path, token string, body, out any) int {
	e.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			e.t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, e.url+path, reader)
	if err != nil {
		e.t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if out != nil && res.StatusCode < 300 {
		if err := json.Unmarshal(raw, out); err != nil {
			e.t.Fatalf("%s %s: %v\n%s", method, path, err, raw)
		}
	}
	return res.StatusCode
}

func (e *env) expect(want int, method, path, token string, body any) {
	e.t.Helper()
	if got := e.call(method, path, token, body, nil); got != want {
		e.t.Errorf("%s %s: got %d, want %d", method, path, got, want)
	}
}

func (e *env) issue(scopes ...string) service.IssuedCredential {
	e.t.Helper()
	var out service.IssuedCredential
	code := e.call("POST", "/tenants/ten-lari/credentials", e.admin, service.NewCredential{Name: "ERP sync", Scopes: scopes}, &out)
	if code != 201 || !strings.HasPrefix(out.Secret, service.APIKeyPrefix) {
		e.t.Fatalf("issue: %d %+v", code, out)
	}
	return out
}

func TestAPIKeyActsOnlyWithinScopeAndTenant(t *testing.T) {
	e := setup(t)
	key := e.issue("orders:read", "catalog:write").Secret

	var page struct {
		Items []struct {
			ID       string `json:"id"`
			TenantID string `json:"tenantId"`
		} `json:"items"`
		NextCursor *string `json:"nextCursor"`
	}
	if code := e.call("GET", "/orders?limit=5", key, nil, &page); code != 200 || len(page.Items) != 5 || page.NextCursor == nil {
		t.Fatalf("orders: %d %+v", code, page)
	}
	for _, o := range page.Items {
		if o.TenantID != "ten-lari" {
			t.Errorf("read an order of %s", o.TenantID)
		}
	}
	first := page.Items[4].ID
	if code := e.call("GET", "/orders?limit=5&cursor="+*page.NextCursor, key, nil, &page); code != 200 || page.Items[0].ID <= first {
		t.Errorf("next page: %d, %s after %s", code, page.Items[0].ID, first)
	}

	e.expect(200, "GET", "/products?limit=1", key, nil) // catalog:write implies catalog:read
	e.expect(403, "GET", "/customers", key, nil)        // no scope
	e.expect(403, "POST", "/orders/x/notes", key, map[string]string{"note": "no"})
	e.expect(403, "GET", "/state", key, nil)                                      // the full dataset is for people
	e.expect(403, "GET", "/tenants/ten-lari/credentials", key, nil)               // a key cannot manage keys
	e.expect(403, "POST", "/tenants/ten-lari/credentials", key, map[string]any{}) // nor mint one

	// Another tenant's order reads as missing.
	var other string
	if err := e.db.Pool.QueryRow(context.Background(), `select id from orders where tenant_id = 'ten-teknika' limit 1`).Scan(&other); err != nil {
		t.Fatal(err)
	}
	e.expect(404, "GET", "/orders/"+other, key, nil)
}

func TestSaveCannotTakeAnotherTenantsRecord(t *testing.T) {
	e := setup(t)
	key := e.issue("catalog:write").Secret
	ctx := context.Background()
	var id string
	var raw []byte
	if err := e.db.Pool.QueryRow(ctx, `select id, data from products where tenant_id = 'ten-teknika' limit 1`).Scan(&id, &raw); err != nil {
		t.Fatal(err)
	}
	var product map[string]any
	if err := json.Unmarshal(raw, &product); err != nil {
		t.Fatal(err)
	}
	product["tenantId"] = "ten-lari"
	product["name"] = "Stolen"
	e.expect(404, "PUT", "/products/"+id, key, product)
	product["tenantId"] = "ten-teknika"
	e.expect(403, "PUT", "/products/"+id, key, product)
	var name string
	if err := e.db.Pool.QueryRow(ctx, `select data->>'name' from products where id = $1`, id).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name == "Stolen" {
		t.Fatal("another tenant's product was overwritten")
	}
}

func TestRotateAndRevokeStopTheOldSecret(t *testing.T) {
	e := setup(t)
	issued := e.issue("orders:read")
	old := issued.Secret
	e.expect(200, "GET", "/orders?limit=1", old, nil)
	var used httpapi.CredentialList
	if e.call("GET", "/tenants/ten-lari/credentials", e.admin, nil, &used); used.Credentials[0].LastUsedAt == nil {
		t.Error("a used key still reads as never used")
	}

	var rotated service.IssuedCredential
	if code := e.call("POST", "/credentials/"+issued.Credential.ID+"/rotate", e.admin, nil, &rotated); code != 200 {
		t.Fatalf("rotate: %d", code)
	}
	e.expect(401, "GET", "/orders?limit=1", old, nil)
	e.expect(200, "GET", "/orders?limit=1", rotated.Secret, nil)

	e.expect(200, "POST", "/credentials/"+issued.Credential.ID+"/revoke", e.admin, nil)
	e.expect(401, "GET", "/orders?limit=1", rotated.Secret, nil)
	e.expect(409, "POST", "/credentials/"+issued.Credential.ID+"/rotate", e.admin, nil)

	var list httpapi.CredentialList
	if code := e.call("GET", "/tenants/ten-lari/credentials", e.admin, nil, &list); code != 200 {
		t.Fatalf("list: %d", code)
	}
	if len(list.Credentials) != 1 || list.Credentials[0].Status != "revoked" || len(list.Events) != 3 || len(list.Scopes) == 0 {
		t.Errorf("list: %+v", list)
	}
}

func TestSecretIsNeverStoredOrListedInClear(t *testing.T) {
	e := setup(t)
	issued := e.issue("orders:read")
	var dump string
	if err := e.db.Pool.QueryRow(context.Background(), `select row_to_json(a)::text from api_credentials a where id = $1`, issued.Credential.ID).Scan(&dump); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(dump, issued.Secret) {
		t.Error("the database holds the secret in clear")
	}
	var raw json.RawMessage
	e.call("GET", "/tenants/ten-lari/credentials", e.admin, nil, &raw)
	if strings.Contains(string(raw), issued.Secret) {
		t.Error("the list carries the secret")
	}
}

func TestExpiredAndQueryStringKeysAreRefused(t *testing.T) {
	e := setup(t)
	issued := e.issue("orders:read")
	e.expect(401, "GET", "/orders?limit=1&token="+issued.Secret, "", nil)
	if _, err := e.db.Pool.Exec(context.Background(), `update api_credentials set expires_at = '2000-01-01' where id = $1`, issued.Credential.ID); err != nil {
		t.Fatal(err)
	}
	e.expect(401, "GET", "/orders?limit=1", issued.Secret, nil)
}

func TestOnlyIntegrationManagersHandleCredentials(t *testing.T) {
	e := setup(t)
	maya := e.login("maya@lari.co.id") // marketing
	e.expect(403, "GET", "/tenants/ten-lari/credentials", maya, nil)
	e.expect(403, "GET", "/integrations/int-lari-midtrans/credentials", maya, nil)
	hendra := e.login("hendra@teknika.co.id") // tenant admin of another brand
	e.expect(403, "GET", "/tenants/ten-lari/credentials", hendra, nil)
	e.expect(403, "GET", "/integrations/int-lari-midtrans/credentials", hendra, nil)
	e.expect(403, "PUT", "/integrations/int-lari-midtrans/credentials", hendra, map[string]any{"values": map[string]string{"server_key": "x"}})
	e.expect(401, "GET", "/tenants/ten-lari/credentials", "", nil)
}

func TestConnectorValuesAreEncryptedAndWriteOnly(t *testing.T) {
	e := setup(t)
	const value = "SB-Mid-server-abcdefgh1234"
	path := "/integrations/int-lari-midtrans/credentials"

	var state service.ConnectorCredentials
	if code := e.call("GET", path, e.admin, nil, &state); code != 200 || state.Complete || len(state.Fields) != 2 {
		t.Fatalf("empty state: %d %+v", code, state)
	}
	raw := map[string]any{"values": map[string]any{"server_key": value, "client_key": "SB-Mid-client-zzzzzzzz5678"}}
	var body json.RawMessage
	if code := e.call("PUT", path, e.admin, raw, &body); code != 200 {
		t.Fatalf("save: %d", code)
	}
	if strings.Contains(string(body), value) {
		t.Error("the answer carries the value")
	}
	if err := json.Unmarshal(body, &state); err != nil {
		t.Fatal(err)
	}
	if !state.Complete || *state.Fields[0].Last4 != "1234" {
		t.Errorf("state: %+v", state)
	}

	ctx := context.Background()
	var sealed []byte
	if err := e.db.Pool.QueryRow(ctx, `select ciphertext from connector_secrets where integration_id = 'int-lari-midtrans' and field = 'server_key'`).Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte(value)) {
		t.Error("the database holds the value in clear")
	}
	svc := &service.Service{DB: e.db, Vault: e.vault}
	values, err := svc.ConnectorValues(ctx, "int-lari-midtrans")
	if err != nil || values["server_key"] != value {
		t.Errorf("decrypt: %v %v", err, values)
	}
	// A value moved to another row does not decrypt.
	if _, err := e.vault.Open(sealed, "int-lari-xendit/server_key"); err == nil {
		t.Error("a sealed value opened under another row's context")
	}

	// Blank keeps, null clears, unknown fields are refused.
	e.expect(200, "PUT", path, e.admin, map[string]any{"values": map[string]any{"server_key": "  "}})
	if values, _ := svc.ConnectorValues(ctx, "int-lari-midtrans"); values["server_key"] != value {
		t.Error("a blank value replaced the secret")
	}
	e.expect(200, "PUT", path, e.admin, map[string]any{"values": map[string]any{"server_key": nil}})
	if e.call("GET", path, e.admin, nil, &state); state.Complete {
		t.Error("clearing a required field should leave the connector incomplete")
	}
	e.expect(422, "PUT", path, e.admin, map[string]any{"values": map[string]any{"nope": "x"}})
}

func TestRateLimitPerKey(t *testing.T) {
	e := setup(t)
	key := e.issue("orders:read").Secret
	limited := false
	// The count restarts each minute, so a run crossing one needs room for a second full window.
	for range 1300 {
		if e.call("GET", "/orders?limit=1", key, nil, nil) == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Error("a key went past the limit")
	}
	e.expect(200, "GET", "/tenants/ten-lari/credentials", e.admin, nil) // people are not limited
}
