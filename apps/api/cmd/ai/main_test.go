package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

const chatPath = "/api/v1/shop/lari/ai/chat"

// serve runs this binary's handler against the seeded test database.
func serve(t *testing.T, cfg config) string {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), "test-password"); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(handler(cfg, db, time.Now(), slog.New(slog.NewTextHandler(io.Discard, nil))))
	t.Cleanup(srv.Close)
	return srv.URL
}

// fakeModel answers every call with `answer` in the Ollama chat shape and counts the calls.
func fakeModel(t *testing.T, answer string) (config, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"role": "assistant", "content": answer}})
	}))
	t.Cleanup(model.Close)
	return config{ollamaURL: model.URL, ollamaKey: "test-key"}, &calls
}

func post(t *testing.T, url string, in httpapi.AIChatInput) (*http.Response, httpapi.Problem, []byte) {
	t.Helper()
	raw, _ := json.Marshal(in)
	res, err := http.Post(url, "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	var p httpapi.Problem
	_ = json.Unmarshal(body, &p)
	return res, p, body
}

func TestAIServiceServesTheMonolithRoute(t *testing.T) {
	spec := httpapi.New(httpapi.Options{Version: "test"}).Spec()
	if !bytes.Contains(spec, []byte(`"/shop/{store}/ai/chat"`)) {
		t.Fatal("the monolith no longer serves the path the ai service serves")
	}
}

func TestAIOffWithoutAKey(t *testing.T) {
	url := serve(t, config{})
	res, p, _ := post(t, url+chatPath, httpapi.AIChatInput{Message: "halo"})
	if res.StatusCode != 503 || p.Code != "AI_OFF" {
		t.Errorf("got %d %s, want 503 AI_OFF", res.StatusCode, p.Code)
	}
	health, err := http.Get(url + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer health.Body.Close()
	var h struct{ OK, DB, Model bool }
	_ = json.NewDecoder(health.Body).Decode(&h)
	if health.StatusCode != 200 || !h.OK || !h.DB || h.Model {
		t.Errorf("health: %d %+v", health.StatusCode, h)
	}
}

func TestAIServiceAnswersAndRefuses(t *testing.T) {
	cfg, calls := fakeModel(t, `{"action":"answer","reply":"Ada!","productIds":["prd-lr-101","prd-fake"]}`)
	url := serve(t, cfg)

	res, _, body := post(t, url+chatPath, httpapi.AIChatInput{Mode: "agent", Message: "sepatu lari?"})
	var out httpapi.AIChatAnswer
	_ = json.Unmarshal(body, &out)
	if res.StatusCode != 200 || out.Reply != "Ada!" || len(out.ProductIDs) != 1 || out.ProductIDs[0] != "prd-lr-101" {
		t.Errorf("answer: %d %+v", res.StatusCode, out)
	}

	if res, p, _ := post(t, url+chatPath, httpapi.AIChatInput{Message: "   "}); res.StatusCode != 422 || p.Code != "INVALID" {
		t.Errorf("empty message: got %d %s, want 422 INVALID", res.StatusCode, p.Code)
	}
	if res, p, _ := post(t, url+"/api/v1/shop/nope/ai/chat", httpapi.AIChatInput{Message: "halo"}); res.StatusCode != 404 || p.Code != "NOT_FOUND" {
		t.Errorf("unknown store: got %d %s, want 404 NOT_FOUND", res.StatusCode, p.Code)
	}

	before := calls.Load()
	for range 40 {
		res, p, _ := post(t, url+chatPath, httpapi.AIChatInput{Message: "halo"})
		if res.StatusCode == http.StatusTooManyRequests {
			if p.Code != "RATE_LIMITED" || res.Header.Get("Retry-After") == "" {
				t.Errorf("limited without RATE_LIMITED and Retry-After: %s %q", p.Code, res.Header.Get("Retry-After"))
			}
			if calls.Load()-before > 30 {
				t.Errorf("the model took %d calls past the limit", calls.Load()-before)
			}
			return
		}
	}
	t.Error("the limit never applied")
}

func TestModelFailureIs502(t *testing.T) {
	cfg, _ := fakeModel(t, "not json")
	url := serve(t, cfg)
	if res, p, _ := post(t, url+chatPath, httpapi.AIChatInput{Message: "halo"}); res.StatusCode != 502 || p.Code != "AI_FAILED" {
		t.Errorf("got %d %s, want 502 AI_FAILED", res.StatusCode, p.Code)
	}
}
