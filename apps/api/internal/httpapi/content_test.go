package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/media"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// uploadAs posts a PNG under a file name with the given query and returns the status and the answer.
func (e *mediaEnv) uploadAs(token, query, name string) (int, uploaded) {
	e.t.Helper()
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	part, _ := form.CreateFormFile("file", name)
	_, _ = part.Write(picture(e.t, "png", 6, 6))
	_ = form.Close()
	req, _ := http.NewRequest("POST", e.url+"/media?"+query, &buf)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var out uploaded
	if res.StatusCode == http.StatusCreated {
		_ = json.NewDecoder(res.Body).Decode(&out)
	}
	return res.StatusCode, out
}

func (e *mediaEnv) library(token, query string) (int, media.MediaList) {
	e.t.Helper()
	var list media.MediaList
	code := e.call("GET", "/media?"+query, token, nil, &list)
	return code, list
}

// useAsLogo saves url as the brand logo of a tenant through the API.
func (e *mediaEnv) useAsLogo(tenantID, url string) {
	e.t.Helper()
	tenant, err := store.Get[domain.Tenant](context.Background(), e.db.Pool, "tenants", tenantID)
	if err != nil {
		e.t.Fatal(err)
	}
	brand := tenant.Brand
	brand.LogoURL = &url
	if url == "" {
		brand.LogoURL = nil
	}
	e.expect(200, "PUT", "/tenants/"+tenantID+"/brand", e.admin, brand)
}

func TestMediaLibraryListsPerBrandWithUses(t *testing.T) {
	e := setupMedia(t)
	_, logo := e.uploadAs(e.admin, "tenantId=ten-lari", "lari-logo.png")
	_, spare := e.uploadAs(e.admin, "tenantId=ten-lari", "Spare shot.png")
	_, aruna := e.uploadAs(e.admin, "tenantId=ten-aruna", "aruna.png")
	e.useAsLogo("ten-lari", logo.URL)

	code, list := e.library(e.admin, "tenantId=ten-lari")
	if code != 200 || list.Total != 2 || len(list.Items) != 2 {
		t.Fatalf("lari library: %d %+v", code, list)
	}
	// Newest first, and the other brand's image never shows.
	if list.Items[0].ID != spare.ID || list.Items[1].ID != logo.ID {
		t.Errorf("order: %s, %s", list.Items[0].ID, list.Items[1].ID)
	}
	for _, it := range list.Items {
		if it.ID == aruna.ID {
			t.Error("lari lists an aruna image")
		}
	}
	if u := list.Items[1].Uses; len(u) != 1 || u[0].Kind != "brand" || u[0].ID != "ten-lari" {
		t.Errorf("logo uses: %+v", u)
	}
	if len(list.Items[0].Uses) != 0 || list.Items[0].Name != "Spare shot.png" {
		t.Errorf("spare: %+v", list.Items[0])
	}
	if _, found := e.library(e.admin, "tenantId=ten-lari&q=spare"); found.Total != 1 || found.Items[0].ID != spare.ID {
		t.Errorf("search by name: %+v", found)
	}
	if _, paged := e.library(e.admin, "tenantId=ten-lari&limit=1&offset=1"); paged.Total != 2 || len(paged.Items) != 1 || paged.Items[0].ID != logo.ID {
		t.Errorf("second page: %+v", paged)
	}
	// hendra manages only ten-teknika; service staff hold neither upload permission.
	if code, _ := e.library(e.login("hendra@teknika.co.id"), "tenantId=ten-lari"); code != http.StatusForbidden {
		t.Errorf("other brand's admin: %d", code)
	}
	if code, _ := e.library(e.login("sari@lari.co.id"), "tenantId=ten-lari"); code != http.StatusForbidden {
		t.Errorf("service role: %d", code)
	}
}

func TestMediaDeleteRefusedInUseAndRemovesTheFile(t *testing.T) {
	e := setupMedia(t)
	_, logo := e.uploadAs(e.admin, "tenantId=ten-lari", "logo.png")
	e.useAsLogo("ten-lari", logo.URL)
	path := filepath.Join(e.dir, "ten-lari", logo.ID+".png")

	var problem struct {
		Code string      `json:"code"`
		Uses []media.Use `json:"uses"`
	}
	req, _ := http.NewRequest("DELETE", e.url+"/media/"+logo.ID+"?tenantId=ten-lari", nil)
	req.Header.Set("Authorization", "Bearer "+e.admin)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = json.NewDecoder(res.Body).Decode(&problem)
	res.Body.Close()
	if res.StatusCode != http.StatusConflict || problem.Code != "IN_USE" || len(problem.Uses) != 1 || problem.Uses[0].Kind != "brand" {
		t.Fatalf("delete in use: %d %+v", res.StatusCode, problem)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("a refused delete removed the file: %v", err)
	}
	// Another brand cannot delete it, even by id.
	e.expect(http.StatusForbidden, "DELETE", "/media/"+logo.ID+"?tenantId=ten-teknika", e.admin, nil)
	e.expect(http.StatusNotFound, "DELETE", "/media/"+logo.ID+"?tenantId=ten-aruna", e.admin, nil)
	e.expect(http.StatusForbidden, "DELETE", "/media/"+logo.ID+"?tenantId=ten-lari", e.login("sari@lari.co.id"), nil)

	e.useAsLogo("ten-lari", "")
	e.expect(200, "DELETE", "/media/"+logo.ID+"?tenantId=ten-lari", e.admin, nil)
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("file still on disk: %v", err)
	}
	if _, list := e.library(e.admin, "tenantId=ten-lari"); list.Total != 0 {
		t.Errorf("row left: %+v", list)
	}
}

// The daily sweep deletes images older than a day that nothing uses, and keeps used and young ones.
// A product photo, a page section, a page's history and a seller photo each count as a use.
func TestMediaSweepKeepsUsedAndYoungImages(t *testing.T) {
	e := setupMedia(t)
	ctx := context.Background()
	name := map[string]string{}
	up := func(label string) uploaded {
		_, u := e.uploadAs(e.admin, "tenantId=ten-lari", label+".png")
		name[u.ID] = label
		return u
	}
	product, section, history, seller, orphan, young := up("product"), up("section"), up("history"), up("seller"), up("orphan"), up("young")

	p, err := store.Get[domain.Product](ctx, e.db.Pool, "products", firstID(t, e, "products"))
	if err != nil {
		t.Fatal(err)
	}
	p.ImageURL = &product.URL
	e.expect(200, "PUT", "/products/"+p.ID, e.admin, p)

	page, err := store.Get[domain.Page](ctx, e.db.Pool, "pages", "page-lari-faq")
	if err != nil {
		t.Fatal(err)
	}
	page.Sections[0].ImageURL = &section.URL
	e.expect(200, "PUT", "/pages/"+page.ID, e.admin, map[string]any{"sections": page.Sections, "note": "photo"})
	// A later save replaces the section image; the version before keeps it in the page's history.
	page.Sections[0].ImageURL = &history.URL
	e.expect(200, "PUT", "/pages/"+page.ID, e.admin, map[string]any{"sections": page.Sections, "note": "photo 2"})
	page.Sections[0].ImageURL = nil
	e.expect(200, "PUT", "/pages/"+page.ID, e.admin, map[string]any{"sections": page.Sections, "note": "no photo"})

	e.expect(200, "PUT", "/sellers/sel-nadia/profile", e.admin, map[string]string{"headline": "Hi", "bio": "", "photoUrl": seller.URL})

	if _, err := e.db.Pool.Exec(ctx, `update media set created_at = now() - interval '2 days' where id <> $1`, young.ID); err != nil {
		t.Fatal(err)
	}
	svc := service.New(kernel.Runtime{DB: e.db, Clock: clock.New(clock.MustParse(clock.FixtureNow))})
	m := &media.Media{Runtime: svc.Runtime, Storage: media.Disk{Dir: e.dir, PublicURL: "/media"}, Uses: svc}
	removed, err := m.Sweep(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// The section image is gone from the page now, but its first save is still in the history.
	if removed != 1 {
		t.Errorf("removed %d, want 1 (the orphan)", removed)
	}
	_, list := e.library(e.admin, "tenantId=ten-lari")
	kept := map[string]bool{}
	for _, it := range list.Items {
		kept[name[it.ID]] = true
	}
	for _, label := range []string{"product", "section", "history", "seller", "young"} {
		if !kept[label] {
			t.Errorf("sweep removed the %s image", label)
		}
	}
	if kept["orphan"] {
		t.Error("sweep kept the orphan")
	}
	if _, err := os.Stat(filepath.Join(e.dir, "ten-lari", orphan.ID+".png")); !os.IsNotExist(err) {
		t.Errorf("orphan file left: %v", err)
	}
}

// refusal sends body and returns the status and the problem's sentence.
func (e *env) refusal(method, path, token string, body any) (int, string) {
	e.t.Helper()
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, e.url+path, bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	var p struct {
		Detail string `json:"detail"`
	}
	_ = json.NewDecoder(res.Body).Decode(&p)
	return res.StatusCode, p.Detail
}

func firstID(t *testing.T, e *mediaEnv, table string) string {
	t.Helper()
	var id string
	if err := e.db.Pool.QueryRow(context.Background(), `select id from `+table+` where tenant_id = 'ten-lari' order by id limit 1`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// A sales user uploads only their own seller photo; other uploads stay closed to them.
func TestSellerPhotoUploadIsNarrow(t *testing.T) {
	e := setupMedia(t)
	fahmi := e.login("fahmi@lari.co.id")
	if code, _ := e.uploadAs(fahmi, "tenantId=ten-lari&purpose=seller-photo", "me.png"); code != http.StatusCreated {
		t.Errorf("own seller photo: %d", code)
	}
	if code, _ := e.uploadAs(fahmi, "tenantId=ten-lari", "me.png"); code != http.StatusForbidden {
		t.Errorf("upload without purpose: %d", code)
	}
	// fahmi has no seller profile in aruna, and service staff have none at all.
	if code, _ := e.uploadAs(fahmi, "tenantId=ten-aruna&purpose=seller-photo", "me.png"); code != http.StatusForbidden {
		t.Errorf("another brand: %d", code)
	}
	if code, _ := e.uploadAs(e.login("sari@lari.co.id"), "tenantId=ten-lari&purpose=seller-photo", "me.png"); code != http.StatusForbidden {
		t.Errorf("service role: %d", code)
	}
	if code, _ := e.library(fahmi, "tenantId=ten-lari"); code != http.StatusForbidden {
		t.Errorf("sales reads the library: %d", code)
	}
}

func TestSellerEditsOwnProfile(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	fahmi := e.login("fahmi@lari.co.id")
	profile := map[string]string{"headline": "  Race-day shoes, fitted.  ", "bio": "Ask me about carbon plates.", "photoUrl": ""}
	e.expect(200, "PUT", "/sellers/sel-fahmi/profile", fahmi, profile)
	seller, _ := store.Get[domain.Seller](ctx, e.db.Pool, "sellers", "sel-fahmi")
	if seller.Headline != "Race-day shoes, fitted." || seller.Bio != "Ask me about carbon plates." {
		t.Errorf("seller: %q %q", seller.Headline, seller.Bio)
	}

	// The storefront's public dataset carries the new copy in the page's hero.
	var shop struct {
		State struct {
			Pages []domain.Page `json:"pages"`
		} `json:"state"`
	}
	if code := e.call("GET", "/shop/lari/state", "", nil, &shop); code != 200 {
		t.Fatalf("shop state: %d", code)
	}
	found := false
	for _, p := range shop.State.Pages {
		if p.ID != "page-sel-fahmi" {
			continue
		}
		for _, s := range p.Sections {
			if s.Kind == "hero" {
				found = s.Headline == "Race-day shoes, fitted." && s.Body == "Ask me about carbon plates."
			}
		}
	}
	if !found {
		t.Error("the storefront page does not show the new copy")
	}

	// Another seller's profile is closed to fahmi, and so is a profile in a brand he has none in.
	e.expect(http.StatusForbidden, "PUT", "/sellers/sel-sherlyn/profile", fahmi, profile)
	e.expect(http.StatusForbidden, "PUT", "/sellers/sel-intan/profile", fahmi, profile)
	// Lari locks the hero image, so the seller cannot change their photo, but an admin can.
	photo := map[string]string{"headline": profile["headline"], "bio": profile["bio"], "photoUrl": "/media/ten-lari/med-x1.png"}
	if code, why := e.refusal("PUT", "/sellers/sel-fahmi/profile", fahmi, photo); code != http.StatusConflict || !strings.Contains(why, "locked the photo") {
		t.Errorf("locked photo: %d %s", code, why)
	}
	e.expect(200, "PUT", "/sellers/sel-fahmi/profile", e.admin, photo)
	// Locking the headline keeps the copy as it is.
	e.expect(200, "POST", "/tenants/ten-lari/brand/locks/headline/toggle", e.admin, nil)
	if code, why := e.refusal("PUT", "/sellers/sel-fahmi/profile", fahmi, map[string]string{"headline": "New", "bio": "", "photoUrl": photo["photoUrl"]}); code != http.StatusConflict || !strings.Contains(why, "headline and bio") {
		t.Errorf("locked headline: %d %s", code, why)
	}
	e.expect(http.StatusUnprocessableEntity, "PUT", "/sellers/sel-fahmi/profile", e.admin, "not an object")
	e.expect(http.StatusConflict, "PUT", "/sellers/sel-fahmi/profile", e.admin, map[string]string{"headline": strings.Repeat("x", 81)})
}

func TestStoreMenus(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	maya := e.login("maya@lari.co.id")
	menus := map[string]any{
		"header": []map[string]any{
			{"label": " About ", "target": map[string]any{"kind": "page", "id": "page-lari-about", "url": "ignored"}},
			{"label": "All", "target": map[string]any{"kind": "catalog"}},
		},
		"footer": []map[string]any{{"label": "Strava", "target": map[string]any{"kind": "url", "url": "https://strava.com/clubs/lari"}}},
	}
	e.expect(200, "PUT", "/tenants/ten-lari/menus", maya, menus)
	tenant, _ := store.Get[domain.Tenant](ctx, e.db.Pool, "tenants", "ten-lari")
	if tenant.Menus == nil || len(tenant.Menus.Header) != 2 || tenant.Menus.Header[0].Label != "About" ||
		tenant.Menus.Header[0].Target != (domain.MenuTarget{Kind: "page", ID: "page-lari-about"}) || tenant.Menus.Footer[0].Target.URL != "https://strava.com/clubs/lari" {
		t.Fatalf("menus: %+v", tenant.Menus)
	}
	for _, bad := range []string{"javascript:alert(1)", "//evil.example", "ftp://x", "about"} {
		body := map[string]any{"header": []map[string]any{{"label": "Bad", "target": map[string]any{"kind": "url", "url": bad}}}, "footer": []any{}}
		e.expect(http.StatusUnprocessableEntity, "PUT", "/tenants/ten-lari/menus", maya, body)
	}
	e.expect(http.StatusUnprocessableEntity, "PUT", "/tenants/ten-lari/menus", maya,
		map[string]any{"header": []map[string]any{{"label": "", "target": map[string]any{"kind": "catalog"}}}, "footer": []any{}})
	e.expect(http.StatusForbidden, "PUT", "/tenants/ten-lari/menus", e.login("fahmi@lari.co.id"), menus)
	e.expect(http.StatusForbidden, "PUT", "/tenants/ten-teknika/menus", maya, menus)

	e.expect(200, "PUT", "/tenants/ten-lari/menus", maya, map[string]any{"header": []any{}, "footer": []any{}})
	tenant, _ = store.Get[domain.Tenant](ctx, e.db.Pool, "tenants", "ten-lari")
	if tenant.Menus != nil {
		t.Errorf("cleared menus stayed: %+v", tenant.Menus)
	}
}
