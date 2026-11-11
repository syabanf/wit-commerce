package httpapi_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

const assistantPath = "/ai/assistant?tenantId=ten-lari"

// assistantEnv runs the API against a fake model that answers *answer, read at each call, and
// records the system prompt of every call.
func assistantEnv(t *testing.T) (*env, *string, *[]string) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	answer := `{"answer":"ok"}`
	var prompts []string
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []ai.Message `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Messages) == 0 {
			t.Error("the model got no messages")
		}
		prompts = append(prompts, req.Messages[0].Content)
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]string{"role": "assistant", "content": answer}})
	}))
	t.Cleanup(model.Close)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	vault, _ := auth.DeriveVault("test")
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(), AI: ai.New(model.URL, "test-key", ""),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login("andi@lari.co.id")
	return e, &answer, &prompts
}

func ask(question, page string) httpapi.AssistantInput {
	return httpapi.AssistantInput{Messages: []httpapi.AssistantMessage{{Role: "user", Text: question}}, Page: page}
}

func (e *env) assist(token string, in httpapi.AssistantInput) httpapi.AssistantAnswer {
	e.t.Helper()
	var out httpapi.AssistantAnswer
	if code := e.call("POST", assistantPath, token, in, &out); code != 200 {
		e.t.Fatalf("assistant: %d", code)
	}
	return out
}

// facts reads the facts JSON back out of a system prompt.
func facts(t *testing.T, prompt string) map[string]any {
	t.Helper()
	_, rest, ok := strings.Cut(prompt, "Facts: ")
	raw, _, ok2 := strings.Cut(rest, "\n\nReply as")
	var out map[string]any
	if !ok || !ok2 || json.Unmarshal([]byte(raw), &out) != nil {
		t.Fatalf("no facts in the prompt:\n%s", prompt)
	}
	return out
}

func types(a httpapi.AssistantAnswer) []string {
	out := []string{}
	for _, x := range a.Actions {
		out = append(out, x.Type)
	}
	return out
}

// oldestToFulfil is the first order the facts list for the whole brand.
func (e *env) oldestToFulfil() string {
	return e.first(`select id from order_rows where tenant_id = 'ten-lari' and status in ('paid', 'processing', 'packed') order by created_at, id limit 1`)
}

func TestAssistantPassesCheckedActionsAndLinks(t *testing.T) {
	e, answer, _ := assistantEnv(t)
	*answer = `{"answer":"Revenue rose 12% in the last 7 days.",
		"actions":[
			{"type":"promotions/setStatus","label":"Pause Run month","reason":"It has run its course.","params":{"id":"promo-lari-runmonth","status":"paused"}},
			{"type":"customers/note","label":"Note the call","reason":"You called them today.","params":{"id":"cus-lari-0001","note":"Called about sizing."}},
			{"type":"promotions/save","label":"Weekend 10%","reason":"Weekends are slow.","params":{"name":"Weekend 10%","kind":"percentage","value":10,"trigger":"automatic","status":"draft","startAt":"2026-10-10","endAt":"2026-10-11"}}
		],
		"links":[
			{"label":"Orders to fulfil","path":"/commerce/orders?view=to-fulfil"},
			{"label":"Run month","path":"/marketing/promotions?id=promo-lari-runmonth"},
			{"label":"Elsewhere","path":"https://example.com/commerce/orders"},
			{"label":"Made up","path":"/admin/secrets"},
			{"label":"Unknown order","path":"/commerce/orders/ord-made-up"}
		]}`
	out := e.assist(e.admin, ask("What changed this week?", "/customers/all/cus-lari-0001"))
	if out.Answer != "Revenue rose 12% in the last 7 days." {
		t.Errorf("answer: %q", out.Answer)
	}
	if got := strings.Join(types(out), ","); got != "promotions/setStatus,customers/note,promotions/save" {
		t.Fatalf("actions: %s", got)
	}
	if p := out.Actions[0].Params; p["id"] != "promo-lari-runmonth" || p["status"] != "paused" || p["from"] != "active" {
		t.Errorf("setStatus params: %v", p)
	}
	if p := out.Actions[1].Params; p["note"] != "Called about sizing." || p["code"] != "LARI-C10001" {
		t.Errorf("note params: %v", p)
	}
	if p := out.Actions[2].Params; p["kind"] != "percentage" || p["value"] != float64(10) || p["status"] != "draft" {
		t.Errorf("save params: %v", p)
	}
	if len(out.Links) != 2 || out.Links[0].Path != "/commerce/orders?view=to-fulfil" || out.Links[1].Path != "/marketing/promotions?id=promo-lari-runmonth" {
		t.Errorf("links: %+v", out.Links)
	}
}

func TestAssistantDropsActionsOutsideTheAllowlist(t *testing.T) {
	e, answer, _ := assistantEnv(t)
	order := e.oldestToFulfil()
	*answer = `{"answer":"Done.","actions":[
		{"type":"orders/cancel","label":"Cancel","reason":"x","params":{"id":"` + order + `","reason":"other","note":""}},
		{"type":"orders/refund","label":"Refund","reason":"x","params":{"id":"` + order + `","amount":1000000,"note":""}},
		{"type":"orders/advance","label":"Ship","reason":"x","params":{"id":"` + order + `","trackingNo":"sneaky"}},
		{"type":"orders/advance","label":"Advance","reason":"x","params":{"id":"` + order + `"}}]}`
	out := e.assist(e.admin, ask("Which orders are late?", "/"))
	if got := strings.Join(types(out), ","); got != "orders/advance" {
		t.Fatalf("actions: %s", got)
	}
	if out.Actions[0].Params["id"] != order || out.Actions[0].Params["nextStatus"] == "" {
		t.Errorf("advance params: %v", out.Actions[0].Params)
	}
}

func TestAssistantDropsUnknownIDs(t *testing.T) {
	e, answer, _ := assistantEnv(t)
	*answer = `{"answer":"Pause these.","actions":[
		{"type":"campaigns/pause","label":"Pause","reason":"x","params":{"id":"cmp-made-up"}},
		{"type":"campaigns/pause","label":"Pause","reason":"x","params":{"id":"cmp-aruna-glow"}},
		{"type":"campaigns/pause","label":"Pause","reason":"x","params":{"id":"cmp-lari-trail"}},
		{"type":"customers/note","label":"Note","reason":"x","params":{"id":"cus-lari-9999","note":"hi"}},
		{"type":"stock/receive","label":"Restock","reason":"x","params":{"levelId":"stk-made-up","qty":10}},
		{"type":"campaigns/pause","label":"Pause","reason":"x","params":{"id":"cmp-lari-runmonth"}}]}`
	out := e.assist(e.admin, ask("Pause the slow campaigns", "/"))
	if got := strings.Join(types(out), ","); got != "campaigns/pause" || out.Actions[0].Params["id"] != "cmp-lari-runmonth" {
		t.Fatalf("actions: %s %v", got, out.Actions)
	}
}

func TestAssistantDropsActionsTheRoleCannotRun(t *testing.T) {
	e, answer, prompts := assistantEnv(t)
	order := e.oldestToFulfil()
	*answer = `{"answer":"Ship it and pause the promotion.","actions":[
		{"type":"orders/advance","label":"Advance","reason":"x","params":{"id":"` + order + `"}},
		{"type":"promotions/setStatus","label":"Pause","reason":"x","params":{"id":"promo-lari-runmonth","status":"paused"}}]}`
	maya := e.login("maya@lari.co.id")
	out := e.assist(maya, ask("Which orders are late?", "/"))
	if got := strings.Join(types(out), ","); got != "promotions/setStatus" {
		t.Fatalf("marketing got actions %s", got)
	}
	if prompt := (*prompts)[0]; strings.Contains(prompt, "- orders/advance:") || !strings.Contains(prompt, "- promotions/setStatus:") {
		t.Error("the prompt should offer marketing only the actions its role can run")
	}
	// The same answer keeps the order action for a role that fulfils orders.
	if got := strings.Join(types(e.assist(e.admin, ask("Which orders are late?", "/"))), ","); got != "orders/advance,promotions/setStatus" {
		t.Errorf("tenant admin got actions %s", got)
	}
}

func TestAssistantContextHoldsNoContactDetails(t *testing.T) {
	e, _, prompts := assistantEnv(t)
	e.assist(e.admin, ask("Who are my best customers?", "/customers/all/cus-lari-0001"))
	prompt := (*prompts)[0]
	rows, err := e.db.Pool.Query(context.Background(), `select data->>'email', data->>'phone', data->>'name' from customers where tenant_id = 'ten-lari'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var email, phone, name string
		if err := rows.Scan(&email, &phone, &name); err != nil {
			t.Fatal(err)
		}
		if email != "" && strings.Contains(prompt, email) {
			t.Fatalf("the prompt holds a customer email")
		}
		if phone != "" && strings.Contains(prompt, phone) {
			t.Fatalf("the prompt holds a customer phone")
		}
		if strings.Contains(name, " ") && strings.Contains(prompt, name) {
			t.Fatalf("the prompt holds a customer's full name")
		}
	}
	if strings.Contains(prompt, "@") {
		t.Error("the prompt holds an email address")
	}
	f := facts(t, prompt)
	if f["currentRecord"] == nil || f["sales"] == nil || f["orderQueue"] == nil || f["segments"] == nil || f["lowStock"] == nil {
		t.Errorf("the facts miss a section: %v", f)
	}
}

func TestAssistantContextOfASalesUserHoldsOnlyTheirOrders(t *testing.T) {
	e, _, prompts := assistantEnv(t)
	own := e.ids(`select o.id from orders o where o.tenant_id = 'ten-lari' and ` + ownRule)
	ownToFulfil := e.ids(`select o.id from orders o where o.tenant_id = 'ten-lari' and o.status in ('paid', 'processing', 'packed') and ` + ownRule)
	fahmi := e.login("fahmi@lari.co.id")
	foreign := e.first(`select o.id from orders o where o.tenant_id = 'ten-lari' and not ` + ownRule + ` order by o.id limit 1`)
	e.assist(fahmi, ask("Which orders are late?", "/commerce/orders/"+foreign))
	// The page the person sent names the foreign order; the facts must not describe it.
	prompt := strings.ReplaceAll((*prompts)[0], `"page":"/commerce/orders/`+foreign+`"`, "")
	listed := regexp.MustCompile(`ord-[a-z0-9-]+`).FindAllString(prompt, -1)
	if len(ownToFulfil) > 0 && len(listed) == 0 {
		t.Fatal("the facts list none of the sales user's orders to fulfil")
	}
	for _, id := range listed {
		if !own[id] {
			t.Fatalf("a sales user's facts hold %s, which is another seller's order", id)
		}
	}
	f := facts(t, (*prompts)[0])
	queue := f["orderQueue"].(map[string]any)
	if int(queue["toFulfil"].(float64)) != len(ownToFulfil) {
		t.Errorf("toFulfil %v, want %d", queue["toFulfil"], len(ownToFulfil))
	}
	for _, key := range []string{"topProducts30d", "topSellers30d", "lowStock", "campaigns", "promotions", "currentRecord"} {
		if f[key] != nil {
			t.Errorf("a sales user's facts hold %s", key)
		}
	}
	if !strings.Contains(f["scope"].(string), "own") {
		t.Errorf("scope: %v", f["scope"])
	}
}

func TestAssistantRefusesOtherTenantsAndAPIKeys(t *testing.T) {
	e, _, prompts := assistantEnv(t)
	e.expect(403, "POST", "/ai/assistant?tenantId=ten-teknika", e.admin, ask("hi", "/"))
	e.expect(401, "POST", assistantPath, "", ask("hi", "/"))
	key := e.issue("orders:read").Secret
	e.expect(403, "POST", assistantPath, key, ask("hi", "/"))
	e.expect(422, "POST", assistantPath, e.admin, httpapi.AssistantInput{})
	e.expect(422, "POST", assistantPath, e.admin, ask(strings.Repeat("x", 1001), "/"))
	if len(*prompts) != 0 {
		t.Errorf("the model was called %d times", len(*prompts))
	}
}

func TestAssistantRateLimit(t *testing.T) {
	e, _, prompts := assistantEnv(t)
	limited := false
	for range 25 {
		if e.call("POST", assistantPath, e.admin, ask("hi", "/"), nil) == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Error("the limit never applied")
	}
	if len(*prompts) > 20 {
		t.Errorf("the model took %d calls past the limit", len(*prompts))
	}
	// The limit is per person: another member of the brand still gets an answer.
	e.expect(200, "POST", assistantPath, e.login("maya@lari.co.id"), ask("hi", "/"))
}

func TestAssistantOffWithoutAKey(t *testing.T) {
	e := setup(t)
	e.expect(503, "POST", assistantPath, e.admin, ask("hi", "/"))
}

func TestAssistantBadModelOutput(t *testing.T) {
	e, answer, _ := assistantEnv(t)
	*answer = "not json"
	e.expect(502, "POST", assistantPath, e.admin, ask("hi", "/"))
	*answer = `{"answer":""}`
	e.expect(502, "POST", assistantPath, e.admin, ask("hi", "/"))
	*answer = `{"answer":"` + strings.Repeat("a", 5000) + `"}`
	if out := e.assist(e.admin, ask("hi", "/")); len(out.Answer) != 1200 {
		t.Errorf("the answer was not capped: %d", len(out.Answer))
	}
}

// Each allowed action needs the permission its API route checks, so the console and the server agree.
func TestAssistantActionsMatchTheirRoutes(t *testing.T) {
	e := setup(t)
	var table struct {
		Routes []httpapi.Route `json:"routes"`
	}
	e.call("GET", "/routes", "", nil, &table)
	for _, action := range []string{"promotions/save", "promotions/setStatus", "campaigns/pause", "stock/receive", "orders/advance", "customers/note"} {
		want := aimodule.AssistantPermission(action)
		found := false
		for _, r := range table.Routes {
			if r.Action == action {
				found = true
				if r.Permission != want {
					t.Errorf("%s: route needs %s, the assistant checks %s", action, r.Permission, want)
				}
			}
		}
		if !found || want == "" {
			t.Errorf("%s is not an allowed action with a route", action)
		}
	}
}
