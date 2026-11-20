package service

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	// SearchPageSize is how many products one page of results holds.
	SearchPageSize = 24
	// searchMaxPageSize caps a page a caller asks for.
	searchMaxPageSize = 60
	// SuggestLimit is how many products and categories the search box suggests.
	SuggestLimit = 5
	// wordMatch is the word_similarity a query word needs against a product's text: low enough that
	// one typo in a six-letter word still finds it ("spatu" for "sepatu" scores 0.67), high enough
	// that a different word sharing half its trigrams does not ("shoes" in "shorts" scores 0.5).
	wordMatch = 0.55
)

// Sort orders a shopper may pick.
const (
	SortRelevance = "relevance"
	SortPriceAsc  = "price_asc"
	SortPriceDesc = "price_desc"
	SortNewest    = "newest"
	SortBest      = "best"
)

// priceEdges split prices into the buckets the price facet counts, in rupiah.
var priceEdges = []int{100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000}

// SearchQuery is GET /shop/{store}/search.
type SearchQuery struct {
	Q string
	// Category keeps products in this category or under it.
	Category string
	// Collection is a collection's slug or id.
	Collection string
	// Attrs keeps products whose attribute (by code or id) holds any of the values.
	Attrs    map[string][]string
	PriceMin *int
	PriceMax *int
	InStock  bool
	Sort     string
	Page     int
	PageSize int
}

// Filtered reports whether anything beyond the words narrows the results.
func (q SearchQuery) Filtered() bool {
	return q.Category != "" || q.Collection != "" || len(q.Attrs) > 0 || q.PriceMin != nil || q.PriceMax != nil || q.InStock
}

// SearchFacetValue is one attribute value and how many results hold it.
type SearchFacetValue struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

// SearchCategoryFacet counts results in a category, its sub-categories included.
type SearchCategoryFacet struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	ParentID *string `json:"parentId"`
	Count    int     `json:"count"`
}

// SearchAttributeFacet counts results per value of one filterable attribute.
type SearchAttributeFacet struct {
	ID     string             `json:"id"`
	Code   string             `json:"code"`
	Name   string             `json:"name"`
	Type   string             `json:"type"`
	Unit   *string            `json:"unit"`
	Values []SearchFacetValue `json:"values"`
}

// SearchPriceBucket counts results priced from Min up to, not including, Max. A nil Max has no top.
type SearchPriceBucket struct {
	Min   int  `json:"min"`
	Max   *int `json:"max"`
	Count int  `json:"count"`
}

// SearchFacets describe the results. Each facet ignores its own filter, so a shopper sees what
// picking another value would give.
type SearchFacets struct {
	Categories []SearchCategoryFacet  `json:"categories"`
	Attributes []SearchAttributeFacet `json:"attributes"`
	Prices     []SearchPriceBucket    `json:"prices"`
	InStock    int                    `json:"inStock"`
}

// SearchResult is one page of results with the facets of the whole result set.
type SearchResult struct {
	Query    string           `json:"query"`
	Total    int              `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
	Pages    int              `json:"pages"`
	Products []domain.Product `json:"products"`
	Facets   SearchFacets     `json:"facets"`
	// Suggestion is a corrected query when the words matched nothing ("Mungkin maksud Anda").
	Suggestion *string `json:"suggestion"`
	// Matched counts products the words alone find, before filters; the search term log keeps it.
	Matched int `json:"-"`
}

// SuggestProduct is one product the search box offers.
type SuggestProduct struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Price    int     `json:"price"`
	ImageURL *string `json:"imageUrl,omitempty"`
}

// SuggestCategory is one category the search box offers.
type SuggestCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// SuggestResult is what the search box shows as a shopper types.
type SuggestResult struct {
	Products   []SuggestProduct  `json:"products"`
	Categories []SuggestCategory `json:"categories"`
}

// candidate is one product that matched the words, with what the filters and ranking need.
type candidate struct {
	id, categoryID, parentID, productType, createdAt string
	attributes                                       map[string]string
	tags                                             []string
	price, views, available                          int
	assisted                                         bool
	// tier ranks how the whole query matched: 0 the exact name, 1 the start of the name, 2 the start
	// of a word in the name, 3 a run of whole words elsewhere in the text (a SKU or code), 4 otherwise.
	tier  int
	score float64
}

func (c candidate) inStock() bool {
	switch c.productType {
	case "digital", "service", "subscription":
		return true
	}
	return c.available > 0
}

// candidatesQuery lists a store's active products that match every query word, with what the
// filters and the ranking need. A word matches when any of its alternatives is word-similar to the
// product's search text (through the trigram index), starts a word there (for words under three
// letters, which trigrams cannot judge), or matches the name of the product's category or its parent.
// Matching runs per word and the sets intersect, so each step can use an index. The score is how well
// the words match the name, or a little less the category; the tier ranks exact and prefix name
// matches first, then the whole query typed in full elsewhere (a SKU, a code, a category name).
func candidatesQuery(tenantID string, words [][]string, phrases []string) (string, []any) {
	args := []any{tenantID, phrases}
	param := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	var b strings.Builder
	b.WriteString(`with cats as materialized (
  select c.id, concat_ws(' ', search_fold(c.data->>'name'), search_fold(pc.data->>'name')) as names
  from categories c left join categories pc on pc.id = c.data->>'parentId' and pc.tenant_id = $1
  where c.tenant_id = $1)`)
	scores := make([]string, len(words))
	threshold := ""
	if len(words) > 0 {
		threshold = param(wordMatch)
	}
	for i, alts := range words {
		var text, short, cat, name []string
		for _, a := range alts {
			p := param(a)
			if len(a) >= 3 {
				text = append(text, p+" <% search_text")
			} else {
				short = append(short, "strpos(' ' || search_text, ' ' || "+p+") > 0")
			}
			cat = append(cat, "word_similarity("+p+", c.names) >= "+threshold+" or strpos(' ' || c.names, ' ' || "+p+") > 0")
			name = append(name, "word_similarity("+p+", p.search_name), 0.9 * word_similarity("+p+", coalesce(cn.names, ''))")
		}
		fmt.Fprintf(&b, ",\nw%d as (\n", i)
		live := "tenant_id = $1 and status = 'active'"
		if len(text) > 0 {
			fmt.Fprintf(&b, "  select id from products where %s and (%s)\n  union\n", live, strings.Join(text, " or "))
		}
		if len(short) > 0 {
			fmt.Fprintf(&b, "  select id from products where %s and (%s)\n  union\n", live, strings.Join(short, " or "))
		}
		fmt.Fprintf(&b, "  select p.id from products p join cats c on c.id = p.category_id\n  where p.tenant_id = $1 and p.status = 'active' and (%s))", strings.Join(cat, " or "))
		scores[i] = "greatest(" + strings.Join(name, ", ") + ")"
	}
	matched := "select id from products where tenant_id = $1 and status = 'active'"
	score := "0::real"
	if len(words) > 0 {
		sets := make([]string, len(words))
		for i := range words {
			sets[i] = fmt.Sprintf("select id from w%d", i)
		}
		matched = strings.Join(sets, " intersect ")
		score = fmt.Sprintf("(%s) / %d", strings.Join(scores, " + "), len(words))
	}
	fmt.Fprintf(&b, `,
matched as materialized (%s),
stock_by_product as (
  select pid, sum(greatest(available, 0))::int as available from (
    select data->>'productId' as pid, variant_id,
      sum(coalesce((data->>'onHand')::int, 0) - coalesce((data->>'reserved')::int, 0)) as available
    from stock where tenant_id = $1 and data->>'productId' in (select id from matched) group by 1, 2) v
  group by pid)
select p.id, coalesce(p.category_id, ''), coalesce(cat.data->>'parentId', ''), coalesce(p.data->>'type', ''),
  coalesce(p.data->>'createdAt', ''), coalesce(p.data->'attributes', '{}'), coalesce(p.data->'tags', '[]'),
  p.from_price, coalesce((p.data->>'views30d')::int, 0), coalesce(s.available, 0),
  coalesce((p.data->>'assisted')::boolean, false),
  case
    when cardinality($2::text[]) = 0 then 4
    when p.search_name = any($2::text[]) then 0
    when exists (select 1 from unnest($2::text[]) a where p.search_name like a || '%%') then 1
    when exists (select 1 from unnest($2::text[]) a where ' ' || p.search_name like '%% ' || a || '%%') then 2
    when exists (select 1 from unnest($2::text[]) a
      where strpos(concat_ws(' ', '', p.search_text, cn.names, ''), ' ' || a || ' ') > 0) then 3
    else 4 end,
  %s
from matched m
join products p on p.id = m.id
left join categories cat on cat.id = p.category_id and cat.tenant_id = $1
left join cats cn on cn.id = p.category_id
left join stock_by_product s on s.pid = p.id`, matched, score)
	return b.String(), args
}

func (s *Service) searchCandidates(ctx context.Context, tenantID string, words [][]string, phrases []string) ([]candidate, error) {
	sql, args := candidatesQuery(tenantID, words, phrases)
	out := []candidate{}
	err := pgx.BeginTxFunc(ctx, s.DB.Pool, pgx.TxOptions{AccessMode: pgx.ReadOnly}, func(tx pgx.Tx) error {
		// The trigram index answers <% against this threshold.
		if _, err := tx.Exec(ctx, `select set_config('pg_trgm.word_similarity_threshold', $1, true)`, fmt.Sprint(wordMatch)); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, sql, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c candidate
			var attrs, tags []byte
			if err := rows.Scan(&c.id, &c.categoryID, &c.parentID, &c.productType, &c.createdAt, &attrs, &tags,
				&c.price, &c.views, &c.available, &c.assisted, &c.tier, &c.score); err != nil {
				return err
			}
			// Attributes hold strings in the reducer; anything else is skipped rather than failing a search.
			_ = json.Unmarshal(attrs, &c.attributes)
			_ = json.Unmarshal(tags, &c.tags)
			out = append(out, c)
		}
		return rows.Err()
	})
	return out, err
}

// searchPhrases is the whole query, then the query with one word at a time swapped for each of its
// synonyms (at most 8 in all), for the name tiers: "sepatu lari" also ranks "Shoes Lari..." first.
func searchPhrases(folded string, words [][]string) []string {
	if folded == "" {
		return []string{}
	}
	out := []string{folded}
	for i, alts := range words {
		for _, alt := range alts[1:] {
			parts := make([]string, len(words))
			for j, w := range words {
				parts[j] = w[0]
			}
			parts[i] = alt
			if p := strings.Join(parts, " "); !slices.Contains(out, p) && len(out) < 8 {
				out = append(out, p)
			}
		}
	}
	return out
}

// searchFilters are a query's filters resolved against the store's data.
type searchFilters struct {
	category   string
	collection func(candidate) bool
	attrs      map[string][]string // attribute id → any of these values
	min, max   *int
	inStock    bool
}

// pass reports whether c passes every filter except the one named by skip ("category", "price",
// "stock", or an attribute id).
func (f searchFilters) pass(c candidate, skip string) bool {
	if skip != "category" && f.category != "" && c.categoryID != f.category && c.parentID != f.category {
		return false
	}
	if f.collection != nil && !f.collection(c) {
		return false
	}
	for id, values := range f.attrs {
		if id != skip && !slices.Contains(values, c.attributes[id]) {
			return false
		}
	}
	if skip != "price" && (f.min != nil || f.max != nil) {
		if c.assisted || (f.min != nil && c.price < *f.min) || (f.max != nil && c.price > *f.max) {
			return false
		}
	}
	if skip != "stock" && f.inStock && !c.inStock() {
		return false
	}
	return true
}

func collectionFilter(col domain.Collection) func(candidate) bool {
	if col.Mode == "manual" {
		return func(c candidate) bool { return slices.Contains(col.ProductIDs, c.id) }
	}
	return func(c candidate) bool {
		if slices.Contains(col.RuleCategoryIDs, c.categoryID) || (c.parentID != "" && slices.Contains(col.RuleCategoryIDs, c.parentID)) {
			return true
		}
		return slices.ContainsFunc(c.tags, func(t string) bool { return slices.Contains(col.RuleTags, t) })
	}
}

// SearchProducts runs a storefront search over one store's active products.
func (s *Service) SearchProducts(ctx context.Context, tenantID string, q SearchQuery) (SearchResult, error) {
	folded := FoldSearch(q.Q)
	words := searchWords(folded)
	all, err := s.searchCandidates(ctx, tenantID, words, searchPhrases(folded, words))
	if err != nil {
		return SearchResult{}, err
	}
	categories, err := store.ListTenant[domain.Category](ctx, s.DB.Pool, "categories", tenantID)
	if err != nil {
		return SearchResult{}, err
	}
	attributes, err := store.ListTenant[domain.AttributeDef](ctx, s.DB.Pool, "attributes", tenantID)
	if err != nil {
		return SearchResult{}, err
	}
	f := searchFilters{category: q.Category, attrs: map[string][]string{}, min: q.PriceMin, max: q.PriceMax, inStock: q.InStock}
	if q.Collection != "" {
		cols, err := store.List[domain.Collection](ctx, s.DB.Pool, "collections",
			"tenant_id = $1 and (id = $2 or data->>'slug' = $2)", tenantID, q.Collection)
		if err != nil {
			return SearchResult{}, err
		}
		if len(cols) == 0 {
			f.collection = func(candidate) bool { return false }
		} else {
			f.collection = collectionFilter(cols[0])
		}
	}
	for key, values := range q.Attrs {
		i := slices.IndexFunc(attributes, func(a domain.AttributeDef) bool { return a.Code == key || a.ID == key })
		if i < 0 {
			// An attribute the store does not have matches nothing, as an unknown category does.
			f.attrs["?"+key] = values
			continue
		}
		f.attrs[attributes[i].ID] = append(f.attrs[attributes[i].ID], values...)
	}

	results := []candidate{}
	for _, c := range all {
		if f.pass(c, "") {
			results = append(results, c)
		}
	}
	sortCandidates(results, q.Sort, folded != "")

	size := q.PageSize
	if size <= 0 {
		size = SearchPageSize
	}
	size = min(size, searchMaxPageSize)
	page := max(q.Page, 1)
	out := SearchResult{
		Query: q.Q, Total: len(results), Page: page, PageSize: size, Pages: (len(results) + size - 1) / size,
		Products: []domain.Product{}, Matched: len(all),
		Facets: searchFacets(all, f, categories, attributes),
	}
	if start := (page - 1) * size; start < len(results) {
		ids := make([]string, 0, size)
		for _, c := range results[start:min(start+size, len(results))] {
			ids = append(ids, c.id)
		}
		if out.Products, err = s.productsInOrder(ctx, tenantID, ids); err != nil {
			return SearchResult{}, err
		}
	}
	if folded != "" && len(all) == 0 {
		vocabulary, err := s.searchVocabulary(ctx, tenantID)
		if err != nil {
			return SearchResult{}, err
		}
		plain := make([]string, len(words))
		for i, w := range words {
			plain[i] = w[0]
		}
		// Offer the correction only when it finds something.
		if fix := didYouMean(plain, vocabulary); fix != "" {
			fixWords := searchWords(fix)
			found, err := s.searchCandidates(ctx, tenantID, fixWords, []string{})
			if err != nil {
				return SearchResult{}, err
			}
			if len(found) > 0 {
				out.Suggestion = &fix
			}
		}
	}
	return out, nil
}

func sortCandidates(list []candidate, sort string, hasQuery bool) {
	byPopularity := func(a, b candidate) int {
		return cmp.Or(cmp.Compare(b.views, a.views), strings.Compare(b.createdAt, a.createdAt), strings.Compare(a.id, b.id))
	}
	// Talk-to-sales products have no price, so the price sorts put them last.
	price := func(c candidate, dir int) int {
		if c.assisted {
			return 1 << 62
		}
		return dir * c.price
	}
	slices.SortStableFunc(list, func(a, b candidate) int {
		switch sort {
		case SortPriceAsc:
			return cmp.Or(cmp.Compare(price(a, 1), price(b, 1)), byPopularity(a, b))
		case SortPriceDesc:
			return cmp.Or(cmp.Compare(price(a, -1), price(b, -1)), byPopularity(a, b))
		case SortNewest:
			return cmp.Or(strings.Compare(b.createdAt, a.createdAt), strings.Compare(a.id, b.id))
		case SortBest:
			return byPopularity(a, b)
		}
		if !hasQuery {
			return byPopularity(a, b)
		}
		return cmp.Or(cmp.Compare(a.tier, b.tier), cmp.Compare(b.score, a.score), byPopularity(a, b))
	})
}

func searchFacets(all []candidate, f searchFilters, categories []domain.Category, attributes []domain.AttributeDef) SearchFacets {
	out := SearchFacets{Categories: []SearchCategoryFacet{}, Attributes: []SearchAttributeFacet{}, Prices: []SearchPriceBucket{}}
	perCategory := map[string]int{}
	values := map[string]map[string]int{}
	buckets := make([]int, len(priceEdges)+1)
	for _, c := range all {
		if f.pass(c, "category") {
			perCategory[c.categoryID]++
			if c.parentID != "" {
				perCategory[c.parentID]++
			}
		}
		for _, a := range attributes {
			if v := c.attributes[a.ID]; a.Filterable && v != "" && f.pass(c, a.ID) {
				if values[a.ID] == nil {
					values[a.ID] = map[string]int{}
				}
				values[a.ID][v]++
			}
		}
		if !c.assisted && f.pass(c, "price") {
			i, _ := slices.BinarySearch(priceEdges, c.price+1)
			buckets[i]++
		}
		if c.inStock() && f.pass(c, "stock") {
			out.InStock++
		}
	}
	for _, cat := range categories {
		if n := perCategory[cat.ID]; n > 0 {
			out.Categories = append(out.Categories, SearchCategoryFacet{ID: cat.ID, Name: cat.Name, ParentID: cat.ParentID, Count: n})
		}
	}
	for _, a := range attributes {
		if len(values[a.ID]) == 0 {
			continue
		}
		facet := SearchAttributeFacet{ID: a.ID, Code: a.Code, Name: a.Name, Type: a.Type, Unit: a.Unit, Values: []SearchFacetValue{}}
		for v, n := range values[a.ID] {
			facet.Values = append(facet.Values, SearchFacetValue{Value: v, Count: n})
		}
		// Choices keep the order the brand gave them; other values sort as numbers or text.
		slices.SortFunc(facet.Values, func(x, y SearchFacetValue) int {
			if a.Type == "select" {
				return cmp.Compare(slices.Index(a.Options, x.Value), slices.Index(a.Options, y.Value))
			}
			return compareValues(x.Value, y.Value)
		})
		out.Attributes = append(out.Attributes, facet)
	}
	for i, n := range buckets {
		if n == 0 {
			continue
		}
		b := SearchPriceBucket{Count: n}
		if i > 0 {
			b.Min = priceEdges[i-1]
		}
		if i < len(priceEdges) {
			b.Max = &priceEdges[i]
		}
		out.Prices = append(out.Prices, b)
	}
	return out
}

// compareValues orders numbers by value and everything else as text.
func compareValues(a, b string) int {
	x, errX := strconv.ParseFloat(a, 64)
	y, errY := strconv.ParseFloat(b, 64)
	if errX == nil && errY == nil {
		return cmp.Compare(x, y)
	}
	return strings.Compare(a, b)
}

// productsInOrder loads products by id, in the order given.
func (s *Service) productsInOrder(ctx context.Context, tenantID string, ids []string) ([]domain.Product, error) {
	list, err := store.List[domain.Product](ctx, s.DB.Pool, "products", "tenant_id = $1 and id = any($2)", tenantID, ids)
	if err != nil {
		return nil, err
	}
	slices.SortFunc(list, func(a, b domain.Product) int {
		return cmp.Compare(slices.Index(ids, a.ID), slices.Index(ids, b.ID))
	})
	return list, nil
}

// searchVocabulary is every word of the store's active products' search text and its category
// names, without numbers and codes, for "did you mean".
func (s *Service) searchVocabulary(ctx context.Context, tenantID string) ([]string, error) {
	rows, err := s.DB.Pool.Query(ctx, `
		select distinct w from (
		  select unnest(string_to_array(search_text, ' ')) as w from products where tenant_id = $1 and status = 'active'
		  union all
		  select unnest(string_to_array(search_fold(data->>'name'), ' ')) from categories where tenant_id = $1) words
		where length(w) > 2 and w !~ '[0-9]'
		order by w`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var w string
		if err := rows.Scan(&w); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// Suggest is what the search box offers while a shopper types: the best few products and the
// categories whose names match.
func (s *Service) Suggest(ctx context.Context, tenantID, q string) (SuggestResult, error) {
	out := SuggestResult{Products: []SuggestProduct{}, Categories: []SuggestCategory{}}
	folded := FoldSearch(q)
	if folded == "" {
		return out, nil
	}
	res, err := s.SearchProducts(ctx, tenantID, SearchQuery{Q: q, Sort: SortRelevance, PageSize: SuggestLimit})
	if err != nil {
		return out, err
	}
	for _, p := range res.Products {
		price := p.Price
		for i, v := range p.Variants {
			if i == 0 || v.Price < price {
				price = v.Price
			}
		}
		out.Products = append(out.Products, SuggestProduct{ID: p.ID, Name: p.Name, Price: price, ImageURL: p.ImageURL})
	}
	rows, err := s.DB.Pool.Query(ctx, `
		select id, data->>'name' from categories
		where tenant_id = $1 and (word_similarity($2, search_fold(data->>'name')) >= $3
		  or search_fold(data->>'name') like $2 || '%' or search_fold(data->>'name') like '% ' || $2 || '%')
		order by search_fold(data->>'name') like $2 || '%' desc, word_similarity($2, search_fold(data->>'name')) desc, id
		limit $4`, tenantID, folded, wordMatch, SuggestLimit)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var c SuggestCategory
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return out, err
		}
		out.Categories = append(out.Categories, c)
	}
	return out, rows.Err()
}
