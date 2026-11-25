package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// searchLogsPerClient caps the searches one client adds to a store's search terms per minute. More
// still get answers; they are not counted, so one script cannot flood the brand's term list.
const searchLogsPerClient = 30

var searchSorts = map[string]bool{
	service.SortRelevance: true, service.SortPriceAsc: true, service.SortPriceDesc: true,
	service.SortNewest: true, service.SortBest: true,
}

// searchQuery reads GET /shop/{store}/search's parameters: q, category, collection, attr.<code>
// (repeat for several values), priceMin, priceMax, inStock, sort, page and pageSize.
func searchQuery(r *http.Request) (service.SearchQuery, string) {
	v := r.URL.Query()
	q := service.SearchQuery{
		Q: v.Get("q"), Category: v.Get("category"), Collection: v.Get("collection"),
		Sort: v.Get("sort"), Attrs: map[string][]string{},
	}
	if q.Sort == "" {
		q.Sort = service.SortRelevance
	}
	if !searchSorts[q.Sort] {
		return q, "sort must be relevance, price_asc, price_desc, newest or best."
	}
	whole := func(name string, into **int) bool {
		raw := v.Get(name)
		if raw == "" {
			return true
		}
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return false
		}
		*into = &n
		return true
	}
	if !whole("priceMin", &q.PriceMin) || !whole("priceMax", &q.PriceMax) {
		return q, "priceMin and priceMax must be whole rupiah amounts of at least 0."
	}
	var page, size *int
	if !whole("page", &page) || !whole("pageSize", &size) {
		return q, "page and pageSize must be whole numbers."
	}
	if page != nil {
		q.Page = *page
	}
	if size != nil {
		q.PageSize = *size
	}
	switch v.Get("inStock") {
	case "", "0", "false":
	case "1", "true":
		q.InStock = true
	default:
		return q, "inStock must be 1 or 0."
	}
	for key, values := range v {
		if name, ok := strings.CutPrefix(key, "attr."); ok && name != "" {
			for _, value := range values {
				if value != "" {
					q.Attrs[name] = append(q.Attrs[name], value)
				}
			}
		}
	}
	return q, ""
}

// shopSearch is GET /shop/{store}/search: one page of the store's active products for the words
// and filters, with facets. A plain first-page search (words, no filters) counts in the brand's
// search terms with how many products it found.
func (s *Server) shopSearch(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	q, invalid := searchQuery(r)
	if invalid != "" {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", invalid)
		return
	}
	res, err := s.svc.SearchProducts(r.Context(), tenant.ID, q)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if res.Page == 1 && !q.Filtered() && s.searchLogs.hit(tenant.ID+" "+s.clientIP(r), time.Now()) <= searchLogsPerClient {
		d, err := s.svc.LogSearch(r.Context(), tenant.ID, service.FoldSearch(q.Q), q.Q, res.Matched)
		if err != nil {
			// The shopper still gets the answer; a missed count is not worth failing a search.
			s.Log.Warn("search term not counted", "tenant", tenant.ID, "err", err)
		} else if d != nil {
			s.publish(d)
		}
	}
	out, err := publicSearch(res)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// shopSuggest is GET /shop/{store}/suggest: the top products and categories for what a shopper has
// typed so far. Suggestions are not counted as searches.
func (s *Server) shopSuggest(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	res, err := s.svc.Suggest(r.Context(), tenant.ID, r.URL.Query().Get("q"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
