package httpapi_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// stream opens an event stream and sends each data line on the channel until the test ends.
func stream(t *testing.T, url, token string) <-chan string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	lines := bufio.NewScanner(res.Body)
	lines.Buffer(make([]byte, 1<<20), 1<<22)
	lines.Scan() // event: hello
	lines.Scan()
	out := make(chan string, 16)
	go func() {
		for lines.Scan() {
			if line := lines.Text(); strings.HasPrefix(line, "data: ") {
				out <- line
			}
		}
	}()
	return out
}

// waitFor returns the first line that contains want, failing the test when a line contains never.
func waitFor(t *testing.T, lines <-chan string, want, never string) string {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		select {
		case line := <-lines:
			if never != "" && strings.Contains(line, never) {
				t.Fatalf("the stream carried %q: %s", never, line)
			}
			if strings.Contains(line, want) {
				return line
			}
		case <-deadline:
			t.Fatalf("no line with %q", want)
		}
	}
}

func homeWithHeadline(t *testing.T, e *env, headline string) []domain.PageSection {
	t.Helper()
	page, err := store.Get[domain.Page](t.Context(), e.db.Pool, "pages", "page-lari-home")
	if err != nil {
		t.Fatal(err)
	}
	sections := append([]domain.PageSection(nil), page.Sections...)
	for i := range sections {
		if sections[i].Kind == "hero" {
			sections[i].Headline = headline
		}
	}
	return sections
}

// Saving a live page keeps the change in a draft that staff see and shoppers never get: not in the
// store's dataset, not on its event stream. Publishing sends shoppers the page itself.
func TestShoppersNeverReceivePageDrafts(t *testing.T) {
	e := setup(t)
	staff := stream(t, e.url+"/events", e.admin)
	shop := stream(t, e.url+"/shop/lari/events", "")

	const headline = "Unpublished headline"
	if code := e.call("PUT", "/pages/page-lari-home", e.admin, map[string]any{
		"sections": homeWithHeadline(t, e, headline), "note": "Edited in the store editor",
	}, nil); code != 200 {
		t.Fatalf("save: %d", code)
	}
	waitFor(t, staff, `"pageDrafts"`, "")

	res, raw := get(t, e.url+"/shop/lari/state")
	if res.StatusCode != 200 {
		t.Fatalf("shop state: %d", res.StatusCode)
	}
	var body struct {
		State map[string]json.RawMessage `json:"state"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if _, ok := body.State["pageDrafts"]; ok {
		t.Fatal("the shop dataset carries pageDrafts")
	}
	if strings.Contains(string(raw), headline) {
		t.Fatal("the shop dataset shows the unpublished headline")
	}

	if code := e.call("POST", "/pages/page-lari-home/publish", e.admin, nil, nil); code != 200 {
		t.Fatalf("publish: %d", code)
	}
	// The publish delta removes the draft; the shop stream gets the page and nothing of the draft.
	waitFor(t, shop, headline, "pageDrafts")
	if _, err := store.Get[domain.PageDraft](t.Context(), e.db.Pool, "pageDrafts", "page-lari-home"); err == nil {
		t.Fatal("the draft outlived the publish")
	}
}

// Staff state carries the drafts, so the editor can show them after a reload.
func TestStaffStateCarriesPageDrafts(t *testing.T) {
	e := setup(t)
	if code := e.call("PUT", "/pages/page-lari-home", e.admin, map[string]any{
		"sections": homeWithHeadline(t, e, "Staff only"), "note": "Edited in the store editor",
	}, nil); code != 200 {
		t.Fatalf("save: %d", code)
	}
	var out struct {
		State struct {
			PageDrafts []domain.PageDraft `json:"pageDrafts"`
		} `json:"state"`
	}
	if code := e.call("GET", "/state", e.admin, nil, &out); code != 200 {
		t.Fatalf("state: %d", code)
	}
	if len(out.State.PageDrafts) != 1 || out.State.PageDrafts[0].ID != "page-lari-home" {
		t.Fatalf("pageDrafts: %+v", out.State.PageDrafts)
	}
}

// Discarding a draft needs the same store access as saving one.
func TestDiscardDraftNeedsStoreAccess(t *testing.T) {
	e := setup(t)
	if code := e.call("PUT", "/pages/page-lari-home", e.admin, map[string]any{
		"sections": homeWithHeadline(t, e, "To be discarded"), "note": "Edited in the store editor",
	}, nil); code != 200 {
		t.Fatalf("save: %d", code)
	}
	service := e.login("sari@lari.co.id")
	e.expect(403, "POST", "/pages/page-lari-home/discard-draft", service, nil)
	if _, err := store.Get[domain.PageDraft](t.Context(), e.db.Pool, "pageDrafts", "page-lari-home"); err != nil {
		t.Fatalf("a refused discard removed the draft: %v", err)
	}
	e.expect(200, "POST", "/pages/page-lari-home/discard-draft", e.login("maya@lari.co.id"), nil)
	if _, err := store.Get[domain.PageDraft](t.Context(), e.db.Pool, "pageDrafts", "page-lari-home"); err == nil {
		t.Fatal("the draft survived the discard")
	}
}
