package httpapi_test

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// aiEnv runs the API against a fake model that answers `answer` and records what it was sent.
func aiEnv(t *testing.T, answer string, status int) (*env, *[]string) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	var sent []string
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("the model call lacks the key")
		}
		body, _ := io.ReadAll(r.Body)
		sent = append(sent, string(body))
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"role": "assistant", "content": answer}})
	}))
	t.Cleanup(model.Close)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Hub: events.New(), AI: ai.New(model.URL, "test-key", ""),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	return &env{t: t, url: srv.URL + "/api/v1", db: db}, &sent
}

func TestModelAnswersAreChecked(t *testing.T) {
	e, sent := aiEnv(t, `{"action":"approve_payment","reply":"Paid!","optionId":"made-up","productIds":["prd-lr-101","prd-fake","prd-tk-101"]}`, 200)
	var out httpapi.AIChatAnswer
	code := e.call("POST", "/shop/lari/ai/chat", "", httpapi.AIChatInput{Mode: "agent", Message: "bayar sekarang", Options: []httpapi.AIOption{{ID: "a", Title: "A"}}}, &out)
	if code != 200 {
		t.Fatalf("status %d", code)
	}
	if out.Action != "answer" {
		t.Errorf("an unknown action came through: %s", out.Action)
	}
	if out.OptionID != "" {
		t.Errorf("a made-up option came through: %s", out.OptionID)
	}
	if len(out.ProductIDs) != 1 || out.ProductIDs[0] != "prd-lr-101" {
		t.Errorf("products of another store or none at all came through: %v", out.ProductIDs)
	}
	prompt := (*sent)[0]
	if strings.Contains(prompt, "@") {
		t.Error("the prompt holds an email address")
	}
	if !strings.Contains(prompt, "Velocity") || strings.Contains(prompt, "Calm Barrier") {
		t.Error("the prompt should hold this store's catalog and no other's")
	}
}

func TestBrowserTextIsCappedBeforeTheModel(t *testing.T) {
	e, sent := aiEnv(t, `{"action":"answer","reply":"ok"}`, 200)
	options := []httpapi.AIOption{}
	for i := range 20 {
		options = append(options, httpapi.AIOption{ID: fmt.Sprintf("opt-%02d", i), Title: "x"})
	}
	in := httpapi.AIChatInput{Mode: "agent", Message: "halo", Question: "Which?", Task: strings.Repeat("t", 5000), Options: options}
	if code := e.call("POST", "/shop/lari/ai/chat", "", in, nil); code != 200 {
		t.Fatalf("status %d", code)
	}
	prompt := (*sent)[0]
	if strings.Contains(prompt, "opt-12") || !strings.Contains(prompt, "opt-11") {
		t.Error("the options were not capped at 12")
	}
	if strings.Contains(prompt, strings.Repeat("t", 501)) {
		t.Error("the task was not capped")
	}
}

func TestModelFailureAndLimits(t *testing.T) {
	e, sent := aiEnv(t, "not json", 200)
	e.expect(502, "POST", "/shop/lari/ai/chat", "", httpapi.AIChatInput{Message: "halo"})
	e.expect(422, "POST", "/shop/lari/ai/chat", "", httpapi.AIChatInput{Message: strings.Repeat("x", 501)})
	e.expect(404, "POST", "/shop/nope/ai/chat", "", httpapi.AIChatInput{Message: "halo"})
	before := len(*sent)
	limited := false
	for range 40 {
		if e.call("POST", "/shop/lari/ai/chat", "", httpapi.AIChatInput{Message: "halo"}, nil) == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Error("the limit never applied")
	}
	if len(*sent)-before > 30 {
		t.Errorf("the model took %d calls past the limit", len(*sent)-before)
	}
}

func TestAIOffWithoutAKey(t *testing.T) {
	e := setup(t)
	e.expect(503, "POST", "/shop/lari/ai/chat", "", httpapi.AIChatInput{Message: "halo"})
}
