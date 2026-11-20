package httpapi

import (
	"bytes"
	"encoding/xml"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// sitemapMaxURLs is the sitemap protocol's limit per file; a store with more gets a sitemap index.
const sitemapMaxURLs = 50_000

// seoStore is the store a sitemap or robots request is for, and where the request reached it.
type seoStore struct {
	tenant domain.Tenant
	live   bool
	// base is the path the storefront sits under on this host: "" on a store host or custom domain,
	// "/shop/{store}" in path mode.
	base string
}

// tenantBySubdomain finds a store by subdomain, live or not. ok is false for no such store.
func (s *Server) tenantBySubdomain(r *http.Request, subdomain string) (domain.Tenant, bool, bool, error) {
	rows, err := store.List[domain.Tenant](r.Context(), s.DB.Pool, "tenants", "subdomain = $1", subdomain)
	if err != nil || len(rows) == 0 {
		return domain.Tenant{}, false, false, err
	}
	pages, err := store.List[domain.Page](r.Context(), s.DB.Pool, "pages", "tenant_id = $1 and data->>'kind' = 'home'", rows[0].ID)
	if err != nil {
		return domain.Tenant{}, false, false, err
	}
	return rows[0], storeLive(rows[0], pages), true, nil
}

// seoStoreOf resolves the store from the path (/shop/{store}/...) or, on the host routes, from the
// Host header: {store}.{STORE_ROOT_DOMAIN}, or a verified custom domain.
func (s *Server) seoStoreOf(r *http.Request) (seoStore, bool, error) {
	if sub := r.PathValue("store"); sub != "" {
		t, live, ok, err := s.tenantBySubdomain(r, sub)
		return seoStore{tenant: t, live: live, base: "/shop/" + sub}, ok, err
	}
	host := strings.ToLower(r.Host)
	if h, _, found := strings.Cut(host, ":"); found {
		host = h
	}
	if root, _, _ := strings.Cut(strings.ToLower(s.StoreRootDomain), ":"); root != "" {
		if label, ok := strings.CutSuffix(host, "."+root); ok {
			if label == "" || label == "www" || strings.Contains(label, ".") {
				return seoStore{}, false, nil
			}
			t, live, ok, err := s.tenantBySubdomain(r, label)
			return seoStore{tenant: t, live: live}, ok, err
		}
	}
	sub, ok, err := s.svc.StoreByDomain(r.Context(), host)
	if err != nil || !ok {
		return seoStore{}, false, err
	}
	t, live, ok, err := s.tenantBySubdomain(r, sub)
	return seoStore{tenant: t, live: live}, ok, err
}

// canonicalOrigin is where search engines should index the store: its verified custom domain, else
// its own host under STORE_ROOT_DOMAIN, else the path under PUBLIC_URL (or this request's origin).
func (s *Server) canonicalOrigin(r *http.Request, t domain.Tenant) string {
	public := strings.TrimRight(s.PublicURL, "/")
	if public == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		if p := r.Header.Get("X-Forwarded-Proto"); s.TrustProxy && (p == "http" || p == "https") {
			scheme = p
		}
		public = scheme + "://" + r.Host
	}
	return domain.StoreLink(t, s.StoreRootDomain, public)
}

// robots is GET /shop/{store}/robots.txt and, by Host, GET /seo/robots.txt. A live store lets every
// crawler in but keeps it out of the cart, checkout, account, orders, wishlist, previews and search
// results with a query, and names the sitemap. A store that is not open yet (coming soon) or not
// known here is closed to crawlers.
func (s *Server) robots(w http.ResponseWriter, r *http.Request) {
	st, ok, err := s.seoStoreOf(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var b strings.Builder
	b.WriteString("User-agent: *\n")
	if !ok || !st.live {
		b.WriteString("Disallow: " + st.base + "/\n")
	} else {
		b.WriteString("Allow: " + st.base + "/\n")
		for _, p := range []string{"/cart", "/checkout", "/account", "/order/", "/wishlist", "/preview/", "/search?"} {
			b.WriteString("Disallow: " + st.base + p + "\n")
		}
		b.WriteString("\nSitemap: " + s.canonicalOrigin(r, st.tenant) + "/sitemap.xml\n")
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write([]byte(b.String()))
}

// sitemap is GET /shop/{store}/sitemap.xml and, by Host, GET /seo/sitemap.xml; the {part} routes
// serve the files a sitemap index lists ("2.xml").
func (s *Server) sitemap(w http.ResponseWriter, r *http.Request) {
	st, ok, err := s.seoStoreOf(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !ok || !st.live {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "No store at this address.")
		return
	}
	part := 0
	if raw := r.PathValue("part"); raw != "" {
		n, err := strconv.Atoi(strings.TrimSuffix(raw, ".xml"))
		if err != nil || n < 1 || !strings.HasSuffix(raw, ".xml") {
			writeProblem(w, http.StatusNotFound, "NOT_FOUND", "No such sitemap.")
			return
		}
		part = n
	}
	urls, err := s.svc.SitemapURLs(r.Context(), st.tenant.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	doc, found := sitemapDoc(s.canonicalOrigin(r, st.tenant), urls, part, sitemapMaxURLs)
	if !found {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "No such sitemap.")
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(doc)
}

type sitemapURLSet struct {
	XMLName xml.Name       `xml:"urlset"`
	NS      string         `xml:"xmlns,attr"`
	URLs    []sitemapEntry `xml:"url"`
}

type sitemapIndex struct {
	XMLName  xml.Name       `xml:"sitemapindex"`
	NS       string         `xml:"xmlns,attr"`
	Sitemaps []sitemapEntry `xml:"sitemap"`
}

type sitemapEntry struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

const sitemapNS = "http://www.sitemaps.org/schemas/sitemap/0.9"

// sitemapDoc renders part 0 (sitemap.xml) or one numbered part. Up to limit URLs, part 0 is the whole
// urlset and no numbered part exists; above it, part 0 is an index of parts 1..n of limit URLs each.
func sitemapDoc(origin string, urls []service.SitemapURL, part, limit int) ([]byte, bool) {
	var doc any
	switch parts := (len(urls) + limit - 1) / limit; {
	case part == 0 && len(urls) <= limit:
		doc = urlSet(origin, urls)
	case part == 0:
		index := sitemapIndex{NS: sitemapNS}
		for i := range parts {
			chunk := urls[i*limit : min((i+1)*limit, len(urls))]
			index.Sitemaps = append(index.Sitemaps, sitemapEntry{
				Loc: origin + "/sitemap/" + strconv.Itoa(i+1) + ".xml", LastMod: lastMod(latest(chunk)),
			})
		}
		doc = index
	case part <= parts && len(urls) > limit:
		doc = urlSet(origin, urls[(part-1)*limit:min(part*limit, len(urls))])
	default:
		return nil, false
	}
	var b bytes.Buffer
	b.WriteString(xml.Header)
	if err := xml.NewEncoder(&b).Encode(doc); err != nil {
		return nil, false
	}
	b.WriteByte('\n')
	return b.Bytes(), true
}

func urlSet(origin string, urls []service.SitemapURL) sitemapURLSet {
	set := sitemapURLSet{NS: sitemapNS, URLs: make([]sitemapEntry, 0, len(urls))}
	for _, u := range urls {
		set.URLs = append(set.URLs, sitemapEntry{Loc: origin + u.Path, LastMod: lastMod(u.LastMod)})
	}
	return set
}

func latest(urls []service.SitemapURL) time.Time {
	var t time.Time
	for _, u := range urls {
		if u.LastMod.After(t) {
			t = u.LastMod
		}
	}
	return t
}

func lastMod(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
