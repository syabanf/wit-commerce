package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/storefront"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

func search(t *testing.T, e *env, store string, params url.Values) service.SearchResult {
	t.Helper()
	res, raw := get(t, e.url+"/shop/"+store+"/search?"+params.Encode())
	if res.StatusCode != 200 {
		t.Fatalf("search %s: %d %s", params.Encode(), res.StatusCode, raw)
	}
	var out service.SearchResult
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func ids(products []domain.Product) []string {
	out := make([]string, len(products))
	for i, p := range products {
		out[i] = p.ID
	}
	return out
}

func TestSearchRanksExactNamesFirstAndToleratesTypos(t *testing.T) {
	e := setup(t)
	exact := search(t, e, "lari", url.Values{"q": {"velocity trainer"}})
	if len(exact.Products) == 0 || exact.Products[0].ID != "prd-lr-102" {
		t.Fatalf("exact name: %v", ids(exact.Products))
	}
	// One letter missing still finds both Velocity shoes, and the prefix match ranks above fuzzier ones.
	typo := search(t, e, "lari", url.Values{"q": {"velocty"}})
	got := ids(typo.Products)
	if len(got) < 2 || !slices.Contains(got[:2], "prd-lr-101") || !slices.Contains(got[:2], "prd-lr-102") {
		t.Fatalf("typo: %v", got)
	}
	// Case and accents fold away.
	if got := ids(search(t, e, "lari", url.Values{"q": {"VÉLOCITY PRO"}}).Products); len(got) == 0 || got[0] != "prd-lr-101" {
		t.Fatalf("accents: %v", got)
	}
	// "sepatu" is Indonesian for shoes: it finds products in the shoe categories.
	sepatu := search(t, e, "lari", url.Values{"q": {"sepatu trail"}})
	if !slices.Contains(ids(sepatu.Products), "prd-lr-107") {
		t.Fatalf("sepatu trail: %v", ids(sepatu.Products))
	}
	// A SKU finds its product.
	p, err := store.Get[domain.Product](context.Background(), e.db.Pool, "products", "prd-lr-110")
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(search(t, e, "lari", url.Values{"q": {p.Variants[0].Sku}}).Products); len(got) == 0 || got[0] != "prd-lr-110" {
		t.Fatalf("sku %s: %v", p.Variants[0].Sku, got)
	}
}

func TestSearchShowsOnlyThisStoresActiveProducts(t *testing.T) {
	e := setup(t)
	// Summit Ultra is scheduled, not active.
	if got := ids(search(t, e, "lari", url.Values{"q": {"summit ultra"}}).Products); slices.Contains(got, "prd-lr-109") {
		t.Fatalf("a scheduled product showed: %v", got)
	}
	all := search(t, e, "lari", url.Values{"pageSize": {"60"}})
	for _, p := range all.Products {
		if p.TenantID != "ten-lari" || p.Status != "active" {
			t.Fatalf("%s of %s (%s) in lari's results", p.ID, p.TenantID, p.Status)
		}
	}
	var active int
	if err := e.db.Pool.QueryRow(context.Background(), `select count(*) from products where tenant_id = 'ten-lari' and status = 'active'`).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if all.Total != active {
		t.Fatalf("lari total %d, active products %d", all.Total, active)
	}
	// Another store never answers with lari's products, even for their exact name.
	for _, q := range []string{"velocity trainer", "prd-lr-102", ""} {
		for _, p := range search(t, e, "aruna", url.Values{"q": {q}, "pageSize": {"60"}}).Products {
			if p.TenantID != "ten-aruna" {
				t.Fatalf("aruna search %q returned %s of %s", q, p.ID, p.TenantID)
			}
		}
	}
	if res, _ := get(t, e.url+"/shop/nowhere/search?q=velocity"); res.StatusCode != 404 {
		t.Fatalf("unknown store: %d", res.StatusCode)
	}
}

func TestSearchFacetsCountWhatEachFilterGives(t *testing.T) {
	e := setup(t)
	base := url.Values{"category": {"cat-lari-shoes"}}
	res := search(t, e, "lari", base)
	if len(res.Facets.Attributes) == 0 || len(res.Facets.Prices) == 0 {
		t.Fatalf("facets: %+v", res.Facets)
	}
	with := func(extra url.Values) int {
		v := url.Values{}
		for k, vs := range base {
			v[k] = vs
		}
		for k, vs := range extra {
			v[k] = vs
		}
		return search(t, e, "lari", v).Total
	}
	for _, a := range res.Facets.Attributes {
		for _, v := range a.Values {
			if got := with(url.Values{"attr." + a.Code: {v.Value}}); got != v.Count {
				t.Errorf("%s=%s: facet says %d, filter gives %d", a.Code, v.Value, v.Count, got)
			}
		}
	}
	for _, b := range res.Facets.Prices {
		extra := url.Values{"priceMin": {fmt.Sprint(b.Min)}}
		if b.Max != nil {
			extra.Set("priceMax", fmt.Sprint(*b.Max-1))
		}
		if got := with(extra); got != b.Count {
			t.Errorf("price %d..%v: facet says %d, filter gives %d", b.Min, b.Max, b.Count, got)
		}
	}
	if got := with(url.Values{"inStock": {"1"}}); got != res.Facets.InStock {
		t.Errorf("in stock: facet says %d, filter gives %d", res.Facets.InStock, got)
	}
	// The category facet ignores the category filter, so the shopper sees the other categories too.
	all := search(t, e, "lari", url.Values{})
	for _, c := range res.Facets.Categories {
		if got := search(t, e, "lari", url.Values{"category": {c.ID}}).Total; got != c.Count {
			t.Errorf("category %s: facet says %d, filter gives %d", c.ID, c.Count, got)
		}
	}
	if len(res.Facets.Categories) != len(all.Facets.Categories) {
		t.Errorf("category facet narrowed by its own filter: %d of %d", len(res.Facets.Categories), len(all.Facets.Categories))
	}
	// A rule collection keeps its products; an unknown one keeps none.
	if got := search(t, e, "lari", url.Values{"collection": {"trail-season"}}); got.Total == 0 {
		t.Error("trail-season collection found nothing")
	}
	if got := search(t, e, "lari", url.Values{"collection": {"nope"}}); got.Total != 0 {
		t.Errorf("unknown collection: %d", got.Total)
	}
}

func TestSearchSortsAndPages(t *testing.T) {
	e := setup(t)
	asc := search(t, e, "lari", url.Values{"sort": {"price_asc"}, "pageSize": {"60"}})
	prices := []int{}
	for _, p := range asc.Products {
		if p.Assisted {
			continue
		}
		low := p.Price
		for i, v := range p.Variants {
			if i == 0 || v.Price < low {
				low = v.Price
			}
		}
		prices = append(prices, low)
	}
	if !slices.IsSorted(prices) {
		t.Fatalf("price_asc not sorted: %v", prices)
	}
	first := search(t, e, "lari", url.Values{"pageSize": {"5"}})
	second := search(t, e, "lari", url.Values{"pageSize": {"5"}, "page": {"2"}})
	if len(first.Products) != 5 || first.Pages < 2 || slices.Contains(ids(first.Products), second.Products[0].ID) {
		t.Fatalf("pages overlap: %v then %v", ids(first.Products), ids(second.Products))
	}
	if res, _ := get(t, e.url+"/shop/lari/search?sort=cheapest"); res.StatusCode != 422 {
		t.Fatalf("bad sort: %d", res.StatusCode)
	}
}

func TestSearchSuggestsACorrectionForNoResults(t *testing.T) {
	e := setup(t)
	res := search(t, e, "lari", url.Values{"q": {"stbaility"}})
	if res.Total != 0 {
		t.Fatalf("matched %d; the correction case needs a query with no results", res.Total)
	}
	if res.Suggestion == nil || *res.Suggestion != "stability" {
		t.Fatalf("suggestion: %v", *res.Suggestion)
	}
	if got := search(t, e, "lari", url.Values{"q": {*res.Suggestion}}); got.Total == 0 {
		t.Fatal("the suggestion finds nothing")
	}
	// A correction that would still find nothing is not offered.
	if res := search(t, e, "lari", url.Values{"q": {"stbaility qqqzzz"}}); res.Total != 0 || res.Suggestion != nil {
		t.Fatalf("hopeless query: %d results, suggestion %v", res.Total, res.Suggestion)
	}
}

func TestSuggestOffersProductsAndCategories(t *testing.T) {
	e := setup(t)
	res, raw := get(t, e.url+"/shop/lari/suggest?q=trail")
	if res.StatusCode != 200 {
		t.Fatalf("%d %s", res.StatusCode, raw)
	}
	var out service.SuggestResult
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Products) == 0 || len(out.Products) > service.SuggestLimit {
		t.Fatalf("products: %+v", out.Products)
	}
	if !slices.ContainsFunc(out.Categories, func(c service.SuggestCategory) bool { return c.ID == "cat-lari-trail" }) {
		t.Fatalf("categories: %+v", out.Categories)
	}
}

func TestSearchCountsTermsForTheBrand(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	term := func(q string) (domain.SearchTerm, bool) {
		st, err := store.Get[domain.SearchTerm](ctx, e.db.Pool, "searchTerms", storefront.SearchTermID("ten-lari", service.FoldSearch(q)))
		return st, err == nil
	}
	found := search(t, e, "lari", url.Values{"q": {"Velocity"}})
	search(t, e, "lari", url.Values{"q": {"velocity"}})
	st, ok := term("velocity")
	if !ok || st.Count30d != 2 || st.Results != found.Total || st.LastSearchedAt == "" {
		t.Fatalf("velocity: %+v (found %d)", st, found.Total)
	}
	search(t, e, "lari", url.Values{"q": {"zzqx kayak"}})
	if st, ok := term("zzqx kayak"); !ok || st.Results != 0 {
		t.Fatalf("zero-result term: %+v %v", st, ok)
	}
	// Filtered searches, later pages, suggestions and personal-looking terms are not counted.
	search(t, e, "lari", url.Values{"q": {"tempo"}, "inStock": {"1"}})
	search(t, e, "lari", url.Values{"q": {"stability"}, "page": {"2"}})
	get(t, e.url+"/shop/lari/suggest?q=cloudstep")
	search(t, e, "lari", url.Values{"q": {"budi@example.com"}})
	search(t, e, "lari", url.Values{"q": {"0812 3456 7890"}})
	for _, q := range []string{"tempo", "stability", "cloudstep", "budi@example.com", "0812 3456 7890"} {
		if _, ok := term(q); ok {
			t.Errorf("%q was counted", q)
		}
	}
	// A seeded term keeps its old total when it is next searched.
	var seeded domain.SearchTerm
	if err := json.Unmarshal(mustRaw(t, e, "srch-1"), &seeded); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Pool.Exec(ctx, `update search_terms set id = $1, data = jsonb_set(data, '{id}', to_jsonb($1::text)) where id = 'srch-1'`,
		storefront.SearchTermID("ten-lari", service.FoldSearch(seeded.Term))); err != nil {
		t.Fatal(err)
	}
	search(t, e, "lari", url.Values{"q": {seeded.Term}})
	if st, _ := term(seeded.Term); st.Count30d != seeded.Count30d+1 {
		t.Fatalf("seeded %q: %d, want %d", seeded.Term, st.Count30d, seeded.Count30d+1)
	}
}

func mustRaw(t *testing.T, e *env, id string) []byte {
	t.Helper()
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from search_terms where id = $1`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	return raw
}

// seoServer is the API on e's database with the given host settings.
func seoServer(t *testing.T, e *env, root, public string) string {
	t.Helper()
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: e.db, Clock: clock.New(time.Now()), Hub: events.New(), StoreRootDomain: root, PublicURL: public,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func getHost(t *testing.T, base, path, host string) (int, string, string) {
	t.Helper()
	req, err := http.NewRequest("GET", base+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Host = host
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	return res.StatusCode, res.Header.Get("Content-Type"), string(raw)
}

func TestSitemapUsesTheCanonicalOriginOnEveryHost(t *testing.T) {
	e := setup(t)
	ctx := context.Background()

	// Path mode: no store root, so URLs sit under PUBLIC_URL/shop/{store}.
	path := seoServer(t, e, "", "https://commerce.example")
	code, ctype, body := getHost(t, path, "/api/v1/shop/lari/sitemap.xml", "commerce.example")
	if code != 200 || !strings.HasPrefix(ctype, "application/xml") {
		t.Fatalf("path mode: %d %s", code, ctype)
	}
	for _, want := range []string{
		"<loc>https://commerce.example/shop/lari/</loc>",
		"<loc>https://commerce.example/shop/lari/p/prd-lr-101</loc>",
		"<loc>https://commerce.example/shop/lari/c/cat-lari-shoes</loc>",
		"<loc>https://commerce.example/shop/lari/collections/race-day</loc>",
		"<lastmod>",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("path mode sitemap lacks %s", want)
		}
	}
	for _, unwanted := range []string{"prd-lr-109", "prd-ar-", "/cart", "cat-aruna"} {
		if strings.Contains(body, unwanted) {
			t.Errorf("path mode sitemap holds %s", unwanted)
		}
	}

	// Store host: {store}.{root} by Host, URLs on that host.
	hosts := seoServer(t, e, "shop.test", "https://commerce.example")
	code, _, body = getHost(t, hosts, "/api/v1/seo/sitemap.xml", "lari.shop.test")
	if code != 200 || !strings.Contains(body, "<loc>https://lari.shop.test/p/prd-lr-101</loc>") {
		t.Fatalf("store host: %d %.300s", code, body)
	}
	if code, _, _ := getHost(t, hosts, "/api/v1/seo/sitemap.xml", "nope.shop.test"); code != 404 {
		t.Errorf("unknown store host: %d", code)
	}
	if code, _, _ := getHost(t, hosts, "/api/v1/seo/sitemap.xml", "unknown.example"); code != 404 {
		t.Errorf("unknown custom domain: %d", code)
	}

	// A verified custom domain becomes the canonical origin on every host, the path included.
	if _, err := e.db.Pool.Exec(ctx, `update tenants set data = data || '{"domainVerifiedAt": "2026-10-01T10:00:00+07:00"}' where id = 'ten-lari'`); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ base, path, host string }{
		{hosts, "/api/v1/seo/sitemap.xml", "www.lari.co.id"},
		{hosts, "/api/v1/seo/sitemap.xml", "lari.shop.test"},
		{path, "/api/v1/shop/lari/sitemap.xml", "commerce.example"},
	} {
		code, _, body := getHost(t, c.base, c.path, c.host)
		if code != 200 || !strings.Contains(body, "<loc>https://www.lari.co.id/p/prd-lr-101</loc>") {
			t.Errorf("custom domain via %s: %d %.200s", c.host, code, body)
		}
	}
}

func TestRobotsFollowsTheStoresState(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	hosts := seoServer(t, e, "shop.test", "https://commerce.example")
	code, ctype, body := getHost(t, hosts, "/api/v1/seo/robots.txt", "lari.shop.test")
	if code != 200 || !strings.HasPrefix(ctype, "text/plain") {
		t.Fatalf("robots: %d %s", code, ctype)
	}
	for _, want := range []string{"User-agent: *", "Allow: /\n", "Disallow: /cart\n", "Disallow: /checkout\n",
		"Disallow: /account\n", "Disallow: /search?\n", "Sitemap: https://lari.shop.test/sitemap.xml"} {
		if !strings.Contains(body, want) {
			t.Errorf("live store robots lacks %q:\n%s", want, body)
		}
	}
	path := seoServer(t, e, "", "https://commerce.example")
	if _, _, body := getHost(t, path, "/api/v1/shop/lari/robots.txt", "commerce.example"); !strings.Contains(body, "Disallow: /shop/lari/cart\n") ||
		!strings.Contains(body, "Sitemap: https://commerce.example/shop/lari/sitemap.xml") {
		t.Errorf("path mode robots:\n%s", body)
	}

	// Coming soon: the homepage is not published, so crawlers stay out and there is no sitemap.
	if _, err := e.db.Pool.Exec(ctx, `update pages set data = data || '{"status": "draft"}' where tenant_id = 'ten-lari' and data->>'kind' = 'home'`); err != nil {
		t.Fatal(err)
	}
	_, _, body = getHost(t, hosts, "/api/v1/seo/robots.txt", "lari.shop.test")
	if body != "User-agent: *\nDisallow: /\n" {
		t.Errorf("coming soon robots:\n%s", body)
	}
	if code, _, _ := getHost(t, hosts, "/api/v1/seo/sitemap.xml", "lari.shop.test"); code != 404 {
		t.Errorf("coming soon sitemap: %d", code)
	}
	if _, _, body := getHost(t, hosts, "/api/v1/seo/robots.txt", "unknown.example"); body != "User-agent: *\nDisallow: /\n" {
		t.Errorf("unknown host robots:\n%s", body)
	}
}
