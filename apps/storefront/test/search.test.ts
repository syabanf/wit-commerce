import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ShopSearchFacets } from '@rc/api'
import { seedState } from '../../../packages/fixtures/src/data.ts'
import { chooseLanguage } from '../src/i18n'
import { buildCatalog } from '../src/lib/catalog'
import {
  activeFilters,
  facetsFrom,
  localSuggest,
  parsePrice,
  priceLabel,
  readSearch,
  searchRequest,
  selectedFrom,
  toggled,
  writeSearch,
} from '../src/lib/search'
import { canonicalOrigin, productJsonLd } from '../src/lib/seo'

test('a search page URL reads back into the same search', () => {
  const url = new URLSearchParams('q=sepatu+lari&cat=cat-1&sort=price_asc&attr.cushioning=Max&attr.cushioning=Low&price=100000-250000&stock=1')
  const s = readSearch(url)
  assert.deepEqual(s, {
    q: 'sepatu lari',
    cat: 'cat-1',
    sort: 'price_asc',
    attrs: { cushioning: ['Max', 'Low'] },
    price: { min: 100000, max: 250000 },
    inStock: true,
  })
  assert.deepEqual(readSearch(writeSearch(s)), s)
  assert.equal(activeFilters(s), 3)
  // Nonsense stays out of the search.
  const junk = readSearch(new URLSearchParams('sort=cheapest&price=9-3&stock=yes'))
  assert.equal(junk.sort, null)
  assert.equal(junk.price, null)
  assert.equal(junk.inStock, false)
})

test('the API request maps sorts and makes the price bucket inclusive', () => {
  const words = readSearch(new URLSearchParams('q=tee&price=100000-250000'))
  assert.deepEqual(searchRequest(words, 2, 24), {
    q: 'tee',
    category: undefined,
    attrs: {},
    priceMin: 100000,
    priceMax: 249999,
    inStock: false,
    sort: 'relevance',
    page: 2,
    pageSize: 24,
  })
  // Without words the default is best selling; "new" is the API's "newest".
  assert.equal(searchRequest(readSearch(new URLSearchParams('')), 1, 24).sort, 'best')
  assert.equal(searchRequest(readSearch(new URLSearchParams('sort=new')), 1, 24).sort, 'newest')
  assert.equal(searchRequest(readSearch(new URLSearchParams('price=5000000-')), 1, 24).priceMax, undefined)
})

test('price buckets read as ranges in both languages', () => {
  chooseLanguage('en')
  assert.equal(priceLabel({ min: 0, max: 100000 }), 'Under Rp 100.000')
  assert.equal(priceLabel({ min: 100000, max: 250000 }), 'Rp 100.000 to Rp 250.000')
  assert.equal(priceLabel({ min: 5000000, max: null }), 'Rp 5.000.000 and up')
  chooseLanguage('id')
  assert.equal(priceLabel({ min: 0, max: 100000 }), 'Di bawah Rp 100.000')
  assert.deepEqual(parsePrice('0-100000'), { min: 0, max: 100000 })
})

const facets: ShopSearchFacets = {
  categories: [],
  attributes: [
    {
      id: 'att-cushion',
      code: 'cushioning',
      name: 'Cushioning',
      type: 'select',
      unit: null,
      values: [
        { value: 'Max', count: 3 },
        { value: 'Low', count: 1 },
      ],
    },
    {
      id: 'att-plate',
      code: 'plate',
      name: 'Carbon plate',
      type: 'boolean',
      unit: null,
      values: [
        { value: 'yes', count: 2 },
        { value: 'no', count: 5 },
      ],
    },
  ],
  prices: [
    { min: 0, max: 100000, count: 4 },
    { min: 100000, max: 250000, count: 2 },
  ],
  inStock: 5,
}

test('API facets become filter groups, and ticking one changes the URL search', () => {
  chooseLanguage('en')
  const groups = facetsFrom(facets, [])
  assert.deepEqual(
    groups.map((g) => [g.def.name, g.options.map((o) => `${o.label}:${o.count}`)]),
    [
      ['Cushioning', ['Max:3', 'Low:1']],
      ['Carbon plate', ['With carbon plate:2']],
      ['Price', ['Under Rp 100.000:4', 'Rp 100.000 to Rp 250.000:2']],
      ['Availability', ['In stock only:5']],
    ],
  )
  const [cushion, , price, stock] = groups
  let s = readSearch(new URLSearchParams('q=shoe'))
  s = toggled(s, cushion.def, 'Max')
  s = toggled(s, price.def, price.options[1].value)
  s = toggled(s, stock.def, 'yes')
  assert.equal(writeSearch(s).toString(), 'q=shoe&attr.cushioning=Max&price=100000-250000&stock=1')
  assert.deepEqual(selectedFrom(s, groups), {
    'att-cushion': ['Max'],
    '@price': ['100000-250000'],
    '@stock': ['yes'],
  })
  // Price is one range at a time, and a second tick takes a value off.
  s = toggled(s, price.def, price.options[1].value)
  s = toggled(s, cushion.def, 'Max')
  assert.equal(writeSearch(s).toString(), 'q=shoe&stock=1')
})

test('the bundled catalog suggests products and categories while typing', () => {
  const state = seedState()
  const lari = state.tenants.find((t) => t.subdomain === 'lari')!
  const catalog = buildCatalog(state, lari)
  const trail = localSuggest(catalog, 'trail')
  assert.ok(trail.products.length > 0 && trail.products.length <= 5)
  assert.ok(trail.products.every((p) => catalog.productMap.get(p.id)?.status === 'active'))
  assert.ok(trail.categories.some((c) => c.id === 'cat-lari-trail'))
  assert.deepEqual(localSuggest(catalog, '  '), { products: [], categories: [] })
})

test('the canonical origin prefers a verified custom domain, then the store host, then the path', () => {
  const tenant = { subdomain: 'lari', domain: 'www.lari.co.id', domainVerified: true, domainVerifiedAt: undefined }
  const path = 'https://commerce.example/shop/lari'
  assert.equal(canonicalOrigin(tenant, 'commerce.reddie.id', path), 'https://lari.commerce.reddie.id')
  assert.equal(canonicalOrigin(tenant, null, path), path)
  assert.equal(
    canonicalOrigin({ ...tenant, domainVerifiedAt: '2026-10-01T10:00:00+07:00' }, 'commerce.reddie.id', path),
    'https://www.lari.co.id',
  )
  assert.equal(canonicalOrigin(tenant, 'localhost:5375', path), 'http://lari.localhost:5375')
})

test('product structured data offers rupiah prices and stock', () => {
  const base = {
    name: 'Velocity Pro 3',
    code: 'LR-101',
    description: 'Race shoe',
    price: 2_000_000,
    assisted: false,
    rating: 4.7,
    reviewCount: 12,
    variants: [
      { id: 'v1', sku: 'A', name: '42', optionValues: {}, price: 2_000_000, barcode: '' },
      { id: 'v2', sku: 'B', name: '43', optionValues: {}, price: 2_100_000, barcode: '' },
    ],
  }
  const ld = productJsonLd({ product: base, brand: 'Lari', url: 'https://lari.co.id/p/1', available: 0 })
  assert.equal(ld['@type'], 'Product')
  assert.deepEqual(ld.offers, {
    '@type': 'AggregateOffer',
    url: 'https://lari.co.id/p/1',
    priceCurrency: 'IDR',
    lowPrice: 2_000_000,
    highPrice: 2_100_000,
    offerCount: 2,
    availability: 'https://schema.org/OutOfStock',
  })
  assert.deepEqual(ld.aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 12 })
  const one = productJsonLd({ product: { ...base, variants: [base.variants[0]] }, brand: 'Lari', url: 'u', available: null })
  assert.deepEqual(one.offers, {
    '@type': 'Offer',
    url: 'u',
    priceCurrency: 'IDR',
    price: 2_000_000,
    availability: 'https://schema.org/InStock',
  })
  const sales = productJsonLd({ product: { ...base, assisted: true, reviewCount: 0 }, brand: 'Lari', url: 'u', available: 3 })
  assert.equal(sales.offers, undefined)
  assert.equal(sales.aggregateRating, undefined)
})
