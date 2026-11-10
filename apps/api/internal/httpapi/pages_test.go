package httpapi_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// The store editor saves a live page with a button link, FAQ items and a hand-made order. The draft
// keeps them, publishing carries them into the page, and a template switch carries the content over
// and drops the order.
func TestPageEditorFields(t *testing.T) {
	e := setup(t)
	ctx := t.Context()
	page, err := store.Get[domain.Page](ctx, e.db.Pool, "pages", "page-lari-home")
	if err != nil {
		t.Fatal(err)
	}

	// Untouched sections serialise without the new keys, so stored pages and goldens stay the same.
	raw, _ := json.Marshal(page.Sections[0])
	for _, key := range []string{"ctaHref", "items", "order"} {
		if strings.Contains(string(raw), `"`+key+`"`) {
			t.Fatalf("a seed section carries %q: %s", key, raw)
		}
	}

	href := "/p/prd-lr-101"
	items := []domain.PageSectionItem{{Title: "Do you ship to Bali?", Body: "Yes, in three days."}}
	sections := append([]domain.PageSection(nil), page.Sections...)
	// Reverse everything but the footer and number it, as the editor does.
	for i, j := 0, len(sections)-2; i < j; i, j = i+1, j-1 {
		sections[i], sections[j] = sections[j], sections[i]
	}
	for i := range sections {
		order := i
		sections[i].Order = &order
		if sections[i].Kind == "hero" {
			sections[i].CtaHref = &href
			sections[i].Items = items
		}
	}
	if code := e.call("PUT", "/pages/page-lari-home", e.admin, map[string]any{
		"sections": sections, "seo": page.Seo, "note": "Edited in the store editor",
	}, nil); code != 200 {
		t.Fatalf("save: %d", code)
	}
	draft, err := store.Get[domain.PageDraft](ctx, e.db.Pool, "pageDrafts", "page-lari-home")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(draft.Sections, sections) {
		t.Fatalf("draft sections differ:\n%+v\n%+v", draft.Sections, sections)
	}
	if code := e.call("POST", "/pages/page-lari-home/publish", e.admin, nil, nil); code != 200 {
		t.Fatalf("publish: %d", code)
	}
	saved, _ := store.Get[domain.Page](ctx, e.db.Pool, "pages", "page-lari-home")
	if !reflect.DeepEqual(saved.Sections, sections) {
		t.Fatalf("published sections differ:\n%+v\n%+v", saved.Sections, sections)
	}
	if saved.Revisions[0].Note != "Published" || !reflect.DeepEqual(saved.Revisions[0].Sections, sections) {
		t.Fatalf("revision: %+v", saved.Revisions[0])
	}

	if code := e.call("POST", "/pages/page-lari-home/template", e.admin, map[string]string{"templateId": "tpl-editorial"}, nil); code != 200 {
		t.Fatalf("template: %d", code)
	}
	switched, _ := store.Get[domain.PageDraft](ctx, e.db.Pool, "pageDrafts", "page-lari-home")
	for _, s := range switched.Sections {
		if s.Order != nil {
			t.Fatalf("%s kept its order after a template switch", s.Kind)
		}
		if s.Kind == "hero" && (s.CtaHref == nil || *s.CtaHref != href || !reflect.DeepEqual(s.Items, items)) {
			t.Fatalf("hero lost its link or items: %+v", s)
		}
	}
}
