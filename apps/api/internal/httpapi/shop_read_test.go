package httpapi_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
)

// shopServer is cmd/shop's handler on the monolith's database, with a hub of its own.
func shopServer(t *testing.T, e *env) (string, *events.Hub) {
	t.Helper()
	hub := events.New()
	srv := httptest.NewServer(httpapi.NewShopReadHandler(httpapi.Options{
		DB: e.db, Clock: clock.New(time.Now()), Hub: hub,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	return srv.URL + "/api/v1", hub
}

func get(t *testing.T, url string) (*http.Response, []byte) {
	t.Helper()
	res, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res, raw
}

func TestShopReadServesTheMonolithsDataset(t *testing.T) {
	e := setup(t)
	shop, _ := shopServer(t, e)
	for _, path := range []string{"/shop", "/shop/lari/state"} {
		mono, monoRaw := get(t, e.url+path)
		split, splitRaw := get(t, shop+path)
		if mono.StatusCode != 200 || split.StatusCode != 200 {
			t.Fatalf("%s: monolith %d, shop %d", path, mono.StatusCode, split.StatusCode)
		}
		if a, b := mono.Header.Get("Content-Type"), split.Header.Get("Content-Type"); a != b {
			t.Errorf("%s content type: monolith %q, shop %q", path, a, b)
		}
		// "now" moves between the two calls; everything else must be byte for byte the same.
		var a, b map[string]json.RawMessage
		if err := json.Unmarshal(monoRaw, &a); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(splitRaw, &b); err != nil {
			t.Fatal(err)
		}
		delete(a, "now")
		delete(b, "now")
		if len(a) == 0 || len(a) != len(b) {
			t.Fatalf("%s: keys differ: %d and %d", path, len(a), len(b))
		}
		for k := range a {
			if !bytes.Equal(a[k], b[k]) {
				t.Errorf("%s: %q differs between the monolith and the shop", path, k)
			}
		}
	}
	if res, _ := get(t, shop+"/shop/nowhere/state"); res.StatusCode != 404 {
		t.Errorf("unknown store: %d", res.StatusCode)
	}
	if res, _ := get(t, shop+"/health"); res.StatusCode != 200 {
		t.Errorf("health: %d", res.StatusCode)
	}
}

func TestShopReadLeavesWritesAuthAndAIToTheAPI(t *testing.T) {
	e := setup(t)
	shop, _ := shopServer(t, e)
	for _, route := range []string{
		"POST /shop/lari/orders", "POST /shop/lari/login", "POST /shop/lari/register", "POST /shop/lari/sign-in",
		"POST /shop/lari/price", "POST /shop/lari/leads", "POST /shop/lari/ai/chat", "POST /shop/lari/state",
		"GET /shop/lari/me", "GET /shop/lari/demo-customers", "GET /state", "GET /events", "POST /auth/login",
	} {
		method, path, _ := strings.Cut(route, " ")
		req, err := http.NewRequest(method, shop+path, strings.NewReader("{}"))
		if err != nil {
			t.Fatal(err)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 404 && res.StatusCode != 405 {
			t.Errorf("%s: %d, want 404 or 405", route, res.StatusCode)
		}
	}
}

func TestShopReadStreamsTheStore(t *testing.T) {
	e := setup(t)
	shop, hub := shopServer(t, e)
	res, err := http.Get(shop + "/shop/lari/events")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	lines := bufio.NewScanner(res.Body)
	lines.Scan() // event: hello
	for hub.Count() == 0 {
		time.Sleep(10 * time.Millisecond)
	}
	hub.Deliver(events.Change{Upserts: map[string][]events.Row{
		"products":  {{TenantID: "ten-lari", Data: json.RawMessage(`{"id":"prd-new"}`)}},
		"customers": {{TenantID: "ten-lari", Data: json.RawMessage(`{"id":"cus-hidden"}`)}},
	}})
	for lines.Scan() {
		line := lines.Text()
		if !strings.HasPrefix(line, "data: ") || !strings.Contains(line, "upserts") {
			continue
		}
		if !strings.Contains(line, "prd-new") || strings.Contains(line, "cus-hidden") {
			t.Fatalf("delta %s", line)
		}
		return
	}
	t.Fatal("the stream ended without a delta")
}
