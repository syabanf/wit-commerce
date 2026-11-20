package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

func TestSitemapSplitsIntoAnIndexPastTheLimit(t *testing.T) {
	at := time.Date(2026, 10, 1, 3, 0, 0, 0, time.UTC)
	urls := []service.SitemapURL{{Path: "/", LastMod: at}, {Path: "/p/1", LastMod: at}, {Path: "/p/2", LastMod: at.Add(time.Hour)}, {Path: "/p/3&x", LastMod: at}, {Path: "/p/4", LastMod: at}}
	origin := "https://lari.co.id"

	whole, ok := sitemapDoc(origin, urls, 0, 5)
	if !ok || !strings.Contains(string(whole), "<urlset") || strings.Count(string(whole), "<url>") != 5 {
		t.Fatalf("at the limit: %s", whole)
	}
	if !strings.Contains(string(whole), "<loc>https://lari.co.id/p/3&amp;x</loc>") {
		t.Errorf("URLs are not escaped: %s", whole)
	}
	if _, ok := sitemapDoc(origin, urls, 1, 5); ok {
		t.Error("a numbered part exists without an index")
	}

	index, ok := sitemapDoc(origin, urls, 0, 2)
	if !ok || !strings.Contains(string(index), "<sitemapindex") || strings.Count(string(index), "<sitemap>") != 3 {
		t.Fatalf("index: %s", index)
	}
	for _, want := range []string{"<loc>https://lari.co.id/sitemap/1.xml</loc>", "<loc>https://lari.co.id/sitemap/3.xml</loc>", "<lastmod>2026-10-01T04:00:00Z</lastmod>"} {
		if !strings.Contains(string(index), want) {
			t.Errorf("index lacks %s", want)
		}
	}
	last, ok := sitemapDoc(origin, urls, 3, 2)
	if !ok || strings.Count(string(last), "<url>") != 1 || !strings.Contains(string(last), "/p/4") {
		t.Fatalf("last part: %s", last)
	}
	if _, ok := sitemapDoc(origin, urls, 4, 2); ok {
		t.Error("a part past the end exists")
	}
}
