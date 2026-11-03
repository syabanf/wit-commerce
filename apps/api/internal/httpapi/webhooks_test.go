package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

type received struct {
	event, signature string
	body             []byte
}

// receiver is a subscriber's server; answer decides its status.
func receiver(t *testing.T, answer func(n int) int) (*httptest.Server, func() []received) {
	t.Helper()
	var mu sync.Mutex
	var got []received
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		got = append(got, received{r.Header.Get("X-Commerce-Event"), r.Header.Get("X-Commerce-Signature"), body})
		n := len(got)
		mu.Unlock()
		w.WriteHeader(answer(n))
	}))
	t.Cleanup(srv.Close)
	return srv, func() []received {
		mu.Lock()
		defer mu.Unlock()
		return append([]received(nil), got...)
	}
}

func (e *env) deliverer() *service.Service {
	return &service.Service{DB: e.db, Vault: e.vault, Clock: clock.New(time.Now()), HTTP: service.OutboundClient(true), AllowInternalWebhooks: true}
}

func (e *env) hook(url string, events ...string) service.IssuedWebhook {
	e.t.Helper()
	svc := e.deliverer()
	issued, err := svc.CreateWebhook(context.Background(), service.Meta{P: auth.Principal{Kind: auth.KindUser, Role: "platform_admin", ID: "usr-andi"}, At: clock.FixtureNow}, "ten-lari", service.NewWebhook{URL: url, Events: events})
	if err != nil {
		e.t.Fatal(err)
	}
	return *issued
}

func (e *env) orderIn(status string) string {
	e.t.Helper()
	var id string
	if err := e.db.Pool.QueryRow(context.Background(), `select id from orders where tenant_id = 'ten-lari' and status = $1 limit 1`, status).Scan(&id); err != nil {
		e.t.Fatal(err)
	}
	return id
}

func TestEventsAreSignedAndDeliveredToSubscribersOnly(t *testing.T) {
	e := setup(t)
	srv, got := receiver(t, func(int) int { return 200 })
	issued := e.hook(srv.URL, "order.shipped")
	e.hook(srv.URL+"/other", "customer.created")

	id := e.orderIn("packed")
	e.expect(200, "POST", "/orders/"+id+"/advance", e.admin, map[string]any{"trackingNo": "T1"})
	e.deliverer().DeliverDue(context.Background())

	deliveries := got()
	if len(deliveries) != 1 || deliveries[0].event != "order.shipped" {
		t.Fatalf("deliveries: %+v", deliveries)
	}
	var payload struct {
		Event, TenantID string
		Data            struct{ ID, TrackingNo string }
	}
	if err := json.Unmarshal(deliveries[0].body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Data.ID != id || payload.TenantID != "ten-lari" || payload.Data.TrackingNo != "T1" {
		t.Errorf("payload: %+v", payload)
	}
	var unix int64
	if _, err := fmt.Sscanf(deliveries[0].signature, "t=%d,", &unix); err != nil {
		t.Fatal(err)
	}
	if want := service.Sign(issued.Secret, unix, deliveries[0].body); deliveries[0].signature != want {
		t.Errorf("signature %s, want %s", deliveries[0].signature, want)
	}
}

func TestARefusedActionQueuesNothing(t *testing.T) {
	e := setup(t)
	srv, got := receiver(t, func(int) int { return 200 })
	e.hook(srv.URL, "order.shipped", "order.paid", "inventory.updated")
	e.expect(409, "POST", "/orders/"+e.orderIn("completed")+"/advance", e.admin, map[string]any{})
	e.deliverer().DeliverDue(context.Background())
	if len(got()) != 0 {
		t.Errorf("a refused action sent %d events", len(got()))
	}
}

func TestFailedDeliveriesRetryThenStop(t *testing.T) {
	e := setup(t)
	srv, got := receiver(t, func(int) int { return 500 })
	issued := e.hook(srv.URL, "order.shipped")
	ctx := context.Background()
	svc := e.deliverer()
	meta := service.Meta{P: auth.Principal{Kind: auth.KindUser, Role: "platform_admin", ID: "usr-andi"}, At: clock.FixtureNow}
	if err := svc.PingWebhook(ctx, meta, issued.Endpoint.ID); err != nil {
		t.Fatal(err)
	}
	for attempt := 1; attempt <= 7; attempt++ {
		if n, err := svc.DeliverDue(ctx); err != nil || n != 1 {
			t.Fatalf("attempt %d: tried %d, %v", attempt, n, err)
		}
		if n, _ := svc.DeliverDue(ctx); n != 0 {
			t.Fatalf("attempt %d: resent before its backoff", attempt)
		}
		if _, err := e.db.Pool.Exec(ctx, `update webhook_deliveries set next_attempt_at = now()`); err != nil {
			t.Fatal(err)
		}
	}
	if n, _ := svc.DeliverDue(ctx); n != 0 {
		t.Error("a failed delivery kept retrying")
	}
	var status string
	var id int64
	if err := e.db.Pool.QueryRow(ctx, `select id, status from webhook_deliveries`).Scan(&id, &status); err != nil || status != "failed" {
		t.Fatalf("status %q %v", status, err)
	}
	if len(got()) != 7 {
		t.Errorf("sent %d times, want 7", len(got()))
	}
	if err := svc.RetryDelivery(ctx, meta, id); err != nil {
		t.Fatal(err)
	}
	if n, _ := svc.DeliverDue(ctx); n != 1 {
		t.Error("a manual retry did not send")
	}
}

func TestWebhooksCannotReachInternalAddresses(t *testing.T) {
	e := setup(t)
	srv, got := receiver(t, func(int) int { return 200 })
	res, err := service.OutboundClient(false).Get(srv.URL)
	if err == nil {
		res.Body.Close()
		t.Fatal("the safe client reached a loopback address")
	}
	if len(got()) != 0 {
		t.Error("the request arrived")
	}
	e.expect(422, "POST", "/tenants/ten-lari/webhooks", e.admin, map[string]any{"url": "http://example.com/hook", "events": []string{"order.paid"}})
	e.expect(422, "POST", "/tenants/ten-lari/webhooks", e.admin, map[string]any{"url": "https://example.com/hook", "events": []string{"nope"}})
	e.expect(201, "POST", "/tenants/ten-lari/webhooks", e.admin, map[string]any{"url": "https://example.com/hook", "events": []string{"order.paid"}})
	key := e.issue("orders:write").Secret
	e.expect(403, "GET", "/tenants/ten-lari/webhooks", key, nil)
	e.expect(403, "GET", "/tenants/ten-lari/webhooks", e.login("hendra@teknika.co.id"), nil)
}

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestConnectionTestUsesTheStoredKey(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	const key = "SB-Mid-server-abcdefgh1234"
	meta := service.Meta{P: auth.Principal{Kind: auth.KindUser, Role: "platform_admin", ID: "usr-andi"}, At: clock.FixtureNow}
	status := 200
	var url, user string
	svc := e.deliverer()
	svc.HTTP = &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		url = r.URL.String()
		user, _, _ = r.BasicAuth()
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader("{}"))}, nil
	})}
	result, _, err := svc.TestConnector(ctx, meta, "int-lari-midtrans")
	if err != nil || result.Outcome != "incomplete" {
		t.Fatalf("empty: %+v %v", result, err)
	}
	if _, err := svc.SaveConnectorCredentials(ctx, meta, "int-lari-midtrans", map[string]*string{"server_key": ptr(key), "client_key": ptr("client")}); err != nil {
		t.Fatal(err)
	}
	result, delta, err := svc.TestConnector(ctx, meta, "int-lari-midtrans")
	if err != nil || result.Outcome != "ok" || user != key || !strings.Contains(url, "api.sandbox.midtrans.com") {
		t.Fatalf("ok: %+v %v user=%q url=%q", result, err, user, url)
	}
	raw, _ := json.Marshal(delta)
	if strings.Contains(string(raw), key) {
		t.Error("the log entry carries the key")
	}
	status = 401
	if result, _, _ = svc.TestConnector(ctx, meta, "int-lari-midtrans"); result.Outcome != "rejected" {
		t.Errorf("401 reads as %s", result.Outcome)
	}
	var jne string
	if err := e.db.Pool.QueryRow(ctx, `select id from integrations where tenant_id = 'ten-lari' and data->>'provider' = 'SiCepat'`).Scan(&jne); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SaveConnectorCredentials(ctx, meta, jne, map[string]*string{"api_key": ptr("k")}); err != nil {
		t.Fatal(err)
	}
	if result, _, _ = svc.TestConnector(ctx, meta, jne); result.Outcome != "unsupported" {
		t.Errorf("a provider without a probe reads as %s", result.Outcome)
	}
}

func ptr[T any](v T) *T { return &v }
