// Guest checkout with cash on delivery, built the way the storefront builds it (apps/storefront/src/lib/
// checkout.ts): the storefront holds no orders or customers, so every guest proposes the first codes
// and the server assigns free ones. TERMS_VERSION is the store's current terms version, from
// scripts/perf-terms-version.ts. The server prices every order again and refuses one whose amounts
// differ, so setup prices each line with the store's promotions (POST /shop/{store}/price) and its
// free-shipping threshold.
import http from 'k6/http'
import { check, fail } from 'k6'
import { BASE, DURATION, STORE } from './lib.js'

export const options = {
  scenarios: {
    checkout: { executor: 'constant-vus', vus: 5, duration: DURATION },
  },
  thresholds: {
    'http_req_failed{name:POST /shop/orders}': ['rate==0'],
    'http_req_duration{name:POST /shop/orders}': ['p(95)<1500'],
  },
}

// The couriers of apps/storefront/src/lib/checkout.ts that charge a fee.
const COURIERS = [
  { id: 'jne', fee: 18000 },
  { id: 'sicepat', fee: 15000 },
]

export function setup() {
  const terms = __ENV.TERMS_VERSION
  if (!terms) fail('Set TERMS_VERSION (pnpm tsx scripts/perf-terms-version.ts <base url> <store>).')
  const res = http.get(`${BASE}/shop/${STORE}/state`)
  if (res.status !== 200) fail(`store state answered ${res.status}`)
  const { state } = res.json()
  const tenant = state.tenants[0]
  const cod = state.paymentTypes.find((p) => p.method === 'cod' && p.enabled)
  if (!cod) fail('the store has no cash on delivery')
  if (tenant.tax?.pkp && !tenant.tax.pricesIncludeTax)
    fail('the store adds PPN on top of its prices; run the profile against a store whose prices include it')
  const offered = tenant.shippingCouriers ?? []
  const courier = COURIERS.find((c) => !offered.length || offered.includes(c.id))
  if (!courier) fail('the store offers neither JNE nor SiCepat')
  const freeShippingMin = tenant.loyalty?.freeShippingMin ?? 0
  // Lines that can sell: a variant with free stock at a warehouse, priced from the catalogue. Each
  // carries the units it may use, so the run never sells a variant out.
  const products = new Map(state.products.filter((p) => p.status === 'active').map((p) => [p.id, p]))
  const picks = []
  for (const level of state.stock) {
    const product = products.get(level.productId)
    const variant = product?.variants?.find((v) => v.id === level.variantId)
    const free = level.onHand - level.reserved - (level.safety ?? 0)
    if (!variant || free < 5 || (product.modifierGroupIds ?? []).length) continue
    const price = variant.price
    if (!price || price + courier.fee > cod.maxAmount) continue
    picks.push({
      productId: product.id,
      categoryId: product.categoryId,
      variantId: variant.id,
      price,
      warehouseId: level.warehouseId,
    })
  }
  if (!picks.length) fail('no variant has free stock')
  // The store's own price of one unit paid by cash on delivery: automatic promotions and shipping.
  for (const pick of picks) {
    const quote = http.post(
      `${BASE}/shop/${STORE}/price`,
      JSON.stringify({
        lines: [{ productId: pick.productId, categoryId: pick.categoryId, qty: 1, unitPrice: pick.price }],
        paymentTypeId: cod.id,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
    if (quote.status !== 200) fail(`pricing answered ${quote.status}`)
    const { subtotal, discount, discounts, freeShipping } = quote.json()
    pick.subtotal = subtotal
    pick.discount = discount
    pick.discountLines = discounts
    pick.shipping = freeShipping || subtotal >= freeShippingMin ? 0 : courier.fee
  }
  const city = state.warehouses.find((w) => w.id === picks[0].warehouseId)?.city ?? 'Jakarta'
  return {
    terms,
    tenant: { id: tenant.id, code: tenant.code, pointsPer10k: tenant.loyalty?.pointsPer10k ?? 1 },
    cod,
    courier: courier.id,
    picks,
    city,
  }
}

export default function (data) {
  const { tenant, cod, picks, terms } = data
  const pick = picks[(__VU * 7919 + __ITER) % picks.length]
  const key = `${__VU}-${__ITER}-${Date.now().toString(36)}`
  const at = new Date().toISOString()
  const customerId = `cus-k6-${key}`
  const total = Math.max(0, pick.subtotal - pick.discount + pick.shipping)
  const order = {
    id: `ord-k6-${key}`,
    tenantId: tenant.id,
    code: `${tenant.code}-00001`,
    customerId,
    channel: 'web',
    sellerId: null,
    campaignId: null,
    status: 'confirmed',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    paymentTypeId: cod.id,
    courier: data.courier,
    trackingNo: null,
    warehouseId: pick.warehouseId,
    city: data.city,
    lines: [{ productId: pick.productId, variantId: pick.variantId, qty: 1, price: pick.price }],
    subtotal: pick.subtotal,
    discount: pick.discount,
    shipping: pick.shipping,
    total,
    voucherCode: null,
    discountLines: pick.discountLines,
    pointsEarned: Math.floor(total / 10000) * tenant.pointsPer10k,
    createdAt: at,
    cancelReason: null,
    refundedAmount: 0,
    events: [
      { id: `oev-k6-${key}`, at, by: 'storefront', status: 'new', note: 'Order placed on the storefront' },
    ],
    termsVersion: terms,
  }
  const customer = {
    id: customerId,
    tenantId: tenant.id,
    code: `${tenant.code}-C00001`,
    name: 'Load Test',
    email: `k6-${key}@example.com`,
    phone: '+62 811 0000 0000',
    city: data.city,
    source: 'web',
    stage: 'first_buyer',
    tier: 'member',
    points: 0,
    tags: [],
    interests: [],
    sellerId: null,
    createdAt: at,
    birthday: null,
    color: '#6a5a8c',
  }
  const res = http.post(`${BASE}/shop/${STORE}/orders`, JSON.stringify({ order, customer }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /shop/orders' },
  })
  check(res, { 'order placed': (r) => r.status === 200 })
  if (res.status !== 200 && __ITER < 3) console.error(`checkout ${res.status}: ${res.body}`)
}
