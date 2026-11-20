import type { ShopSearchFacets, ShopSearchParams, ShopSuggestResult } from '@rc/api'
import { fmtIdr } from '@rc/fixtures'
import type { AttributeDef } from '@rc/types'
import type { Facet } from '../features/listing'
import { t } from '../i18n'
import { formatAttribute } from '../i18n/format'
import { type Catalog, type SortKey, fromPrice, isSortKey, matchesQuery, sortProducts } from './catalog'

/** How many products and categories the search box suggests. */
const SUGGEST_LIMIT = 5

/** The storefront's sort keys as the search API names them. */
const SEARCH_SORT: Record<SortKey, NonNullable<ShopSearchParams['sort']>> = {
  featured: 'relevance',
  best: 'best',
  new: 'newest',
  price_asc: 'price_asc',
  price_desc: 'price_desc',
}

/** A price facet bucket: from min up to, not including, max. A null max has no top. */
export interface PriceRange {
  min: number
  max: number | null
}

/** What a search page URL holds: ?q=&cat=&sort=&attr.{code}=&price={min}-{max}&stock=1. */
export interface SearchState {
  q: string
  cat: string
  sort: SortKey | null
  /** Attribute code to the values any of which match. */
  attrs: Record<string, string[]>
  price: PriceRange | null
  inStock: boolean
}

export const priceValue = (r: PriceRange) => `${r.min}-${r.max ?? ''}`

export function parsePrice(value: string | null): PriceRange | null {
  const m = value?.match(/^(\d+)-(\d*)$/)
  if (!m) return null
  const min = Number(m[1])
  const max = m[2] ? Number(m[2]) : null
  return max !== null && max <= min ? null : { min, max }
}

/** "Under Rp 100.000", "Rp 100.000 to Rp 250.000", "From Rp 5.000.000". */
export function priceLabel(r: PriceRange): string {
  if (r.max === null) return t('catalog.filter.priceFrom', { min: fmtIdr(r.min) })
  if (r.min === 0) return t('catalog.filter.priceUnder', { max: fmtIdr(r.max) })
  return t('catalog.filter.priceRange', { min: fmtIdr(r.min), max: fmtIdr(r.max) })
}

export function readSearch(params: URLSearchParams): SearchState {
  const attrs: Record<string, string[]> = {}
  for (const [key, value] of params) {
    const code = key.startsWith('attr.') ? key.slice(5) : ''
    if (code && value) attrs[code] = [...(attrs[code] ?? []), value]
  }
  const sort = params.get('sort')
  return {
    q: params.get('q')?.trim() ?? '',
    cat: params.get('cat') ?? '',
    sort: isSortKey(sort) ? sort : null,
    attrs,
    price: parsePrice(params.get('price')),
    inStock: params.get('stock') === '1',
  }
}

export function writeSearch(state: SearchState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  if (state.cat) params.set('cat', state.cat)
  if (state.sort) params.set('sort', state.sort)
  for (const [code, values] of Object.entries(state.attrs)) for (const v of values) params.append(`attr.${code}`, v)
  if (state.price) params.set('price', priceValue(state.price))
  if (state.inStock) params.set('stock', '1')
  return params
}

/** The filters a shopper has picked, the words and category aside. */
export const activeFilters = (s: SearchState) =>
  Object.values(s.attrs).filter((v) => v.length).length + (s.price ? 1 : 0) + (s.inStock ? 1 : 0)

/** The API request for one page of a search. Words sort by relevance unless the shopper picked a sort. */
export function searchRequest(s: SearchState, page: number, pageSize: number): ShopSearchParams {
  return {
    q: s.q,
    category: s.cat || undefined,
    attrs: s.attrs,
    priceMin: s.price?.min || undefined,
    priceMax: s.price?.max ? s.price.max - 1 : undefined,
    inStock: s.inStock,
    sort: SEARCH_SORT[s.sort ?? (s.q ? 'featured' : 'best')],
    page,
    pageSize,
  }
}

/** Top-level categories of the results with their counts, for the chips above the grid. */
export const topCategoryCounts = (facets: ShopSearchFacets | null) =>
  new Map((facets?.categories ?? []).filter((c) => !c.parentId).map((c) => [c.id, c.count]))

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim()

/** The search box's suggestions from the bundled catalog, for the storefront without an API. */
export function localSuggest(catalog: Catalog, q: string): ShopSuggestResult {
  const words = fold(q)
  if (!words) return { products: [], categories: [] }
  const named = (name: string) => fold(name).startsWith(words) || fold(name).includes(` ${words}`)
  const products = sortProducts(
    catalog.products.filter((p) => matchesQuery(catalog, p, q)),
    'best',
  )
    .sort((a, b) => Number(named(b.name)) - Number(named(a.name)))
    .slice(0, SUGGEST_LIMIT)
    .map((p) => ({ id: p.id, name: p.name, price: fromPrice(p), imageUrl: p.imageUrl }))
  const categories = catalog.categories
    .filter((c) => fold(c.name).includes(words))
    .slice(0, SUGGEST_LIMIT)
    .map((c) => ({ id: c.id, name: c.name }))
  return { products, categories }
}

// Filters that are not attributes take ids no attribute can have.
const PRICE = '@price'
const STOCK = '@stock'
const MAX_NUMBER_VALUES = 6

const pseudoDef = (id: string, name: string, type: AttributeDef['type']): AttributeDef => ({
  id,
  tenantId: '',
  name,
  code: id,
  type,
  unit: null,
  options: [],
  filterable: true,
  required: false,
  categoryIds: [],
})

/** The API's facets as the listing's filter groups: attributes, then price, then availability. */
export function facetsFrom(facets: ShopSearchFacets | null, attributes: readonly AttributeDef[]): Facet[] {
  if (!facets) return []
  // A measurement with many distinct values (weight in grams) makes a long list nobody ticks.
  const listed = facets.attributes.filter((f) => f.type !== 'number' || f.values.length <= MAX_NUMBER_VALUES)
  const out: Facet[] = listed.map((f) => {
    const def = attributes.find((a) => a.id === f.id) ?? {
      ...pseudoDef(f.id, f.name, f.type as AttributeDef['type']),
      code: f.code,
      unit: f.unit,
    }
    return {
      def,
      kind: 'any',
      options: f.values
        .filter((v) => def.type !== 'boolean' || v.value === 'yes')
        .map((v) => ({
          value: v.value,
          label:
            def.type === 'boolean'
              ? t('catalog.filter.with', { name: def.name.toLowerCase() })
              : formatAttribute(def, v.value),
          count: v.count,
        })),
    }
  })
  if (facets.prices.length > 1)
    out.push({
      def: pseudoDef(PRICE, t('catalog.filter.price'), 'select'),
      kind: 'any',
      options: facets.prices.map((b) => ({ value: priceValue(b), label: priceLabel(b), count: b.count })),
    })
  if (facets.inStock > 0)
    out.push({
      def: pseudoDef(STOCK, t('catalog.filter.availability'), 'boolean'),
      kind: 'any',
      options: [{ value: 'yes', label: t('catalog.filter.inStock'), count: facets.inStock }],
    })
  return out.filter((f) => f.options.length > 0)
}

/** The listing's picked values per filter group, from the URL's search. */
export function selectedFrom(s: SearchState, facets: Facet[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of facets) if (s.attrs[f.def.code]) out[f.def.id] = s.attrs[f.def.code]
  if (s.price) out[PRICE] = [priceValue(s.price)]
  if (s.inStock) out[STOCK] = ['yes']
  return out
}

/** The search after a shopper ticks or unticks one value. Price is one range at a time. */
export function toggled(s: SearchState, def: Pick<AttributeDef, 'id' | 'code'>, value: string): SearchState {
  if (def.id === PRICE) {
    const next = parsePrice(value)
    return { ...s, price: s.price && next && priceValue(s.price) === value ? null : next }
  }
  if (def.id === STOCK) return { ...s, inStock: !s.inStock }
  const list = s.attrs[def.code] ?? []
  const values = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  const attrs = { ...s.attrs }
  if (values.length) attrs[def.code] = values
  else delete attrs[def.code]
  return { ...s, attrs }
}
