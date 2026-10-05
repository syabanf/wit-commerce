import type {
  CancelReason,
  Channel,
  Courier,
  Customer,
  CustomerEvent,
  LifecycleStage,
  Order,
  OrderEvent,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Product,
  Seller,
  StockLevel,
  StockMove,
  Tenant,
  TrafficDay,
} from '../../packages/types/src/index.ts'
import { ORDER_STATUS_FLOW } from '../../packages/types/src/index.ts'
import { DAY, HOUR, MINUTE, dayKey, startOfDay, toIso, toMs } from '../../packages/fixtures/src/dates.ts'
import { tierFor } from '../../packages/fixtures/src/derive.ts'
import { collections, popularity, products } from './catalog.ts'
import { CAMPAIGN_SPECS } from './growth-specs.ts'
import { AVATAR_COLORS, CITIES, FIRST_NAMES, LAST_NAMES, NOW, warehouses } from './master.ts'
import { rng } from './rng.ts'

interface TenantPlan {
  customers: number
  /** Days of history to generate. */
  history: number
  companyNames?: boolean
}

const PLAN: Record<string, TenantPlan> = {
  'ten-lari': { customers: 720, history: 200 },
  'ten-aruna': { customers: 420, history: 190 },
  'ten-teknika': { customers: 42, history: 58, companyNames: true },
}

const COMPANIES = [
  'PT Presisi Logam',
  'PT Sinar Teknik',
  'CV Mitra Mould',
  'PT Astra Komponen',
  'PT Karya Mesin',
  'PT Batam Precision',
  'PT Jaya Plastik',
  'CV Bengkel Maju',
  'PT Delta Fabrikasi',
  'PT Surya Otomotif',
  'PT Nusantara Die',
  'PT Prima Gear',
  'PT Cikarang Metal',
  'CV Tekno Abadi',
  'PT Garuda Press',
  'PT Indo Shaft',
  'PT Mega Bearing',
  'PT Kencana Tool',
  'PT Sentosa Cast',
  'CV Rekayasa Mandiri',
  'PT Global Fittings',
  'PT Mulia Valve',
  'PT Andalan Part',
  'PT Bintang Forging',
]

const COURIERS: [Courier, number][] = [
  ['jne', 30],
  ['jnt', 20],
  ['sicepat', 25],
  ['gojek', 10],
  ['grab', 8],
  ['pickup', 4],
  ['lalamove', 3],
]
const METHODS: [PaymentMethod, number][] = [
  ['qris', 26],
  ['va', 24],
  ['ewallet', 18],
  ['credit_card', 12],
  ['paylater', 8],
  ['cod', 8],
  ['bank_transfer', 4],
]

const pickCity = () => rng.weighted(CITIES)
const at = (ms: number) => toIso(ms)

function warehouseFor(tenantId: string, city: string) {
  const list = warehouses.filter((w) => w.tenantId === tenantId)
  const east = ['Surabaya', 'Denpasar', 'Makassar', 'Balikpapan', 'Semarang', 'Bandung']
  return (east.includes(city) ? list[1] : undefined) ?? list[0]!
}

function pickProduct(tenantId: string): Product {
  const list = products.filter((p) => p.tenantId === tenantId && (popularity.get(p.id) ?? 0) > 0)
  return rng.weighted(list.map((p) => [p, popularity.get(p.id)!] as const))
}

/** Status of an order placed `ageMs` ago. */
function statusForAge(ageMs: number, cod: boolean): { status: OrderStatus; cancel: CancelReason | null } {
  const days = ageMs / DAY
  if (days > 10) {
    const r = rng.next()
    if (r < 0.05)
      return {
        status: 'cancelled',
        cancel: rng.pick(['customer_request', 'payment_expired', 'out_of_stock', 'duplicate'] as const),
      }
    if (r < 0.08) return { status: 'refunded', cancel: null }
    if (r < 0.1) return { status: 'returned', cancel: null }
    return { status: 'completed', cancel: null }
  }
  if (days > 3)
    return {
      status: rng.weighted([
        ['completed', 50],
        ['delivered', 40],
        ['shipped', 10],
      ] as const),
      cancel: null,
    }
  if (days > 1)
    return {
      status: rng.weighted([
        ['shipped', 40],
        ['packed', 20],
        ['processing', 25],
        ['paid', 15],
      ] as const),
      cancel: null,
    }
  const early = rng.weighted([
    ['new', 35],
    ['confirmed', 20],
    ['paid', 30],
    ['processing', 15],
  ] as const)
  return { status: cod && early === 'paid' ? 'processing' : early, cancel: null }
}

function paymentFor(status: OrderStatus, method: PaymentMethod): PaymentStatus {
  if (status === 'refunded') return 'refunded'
  if (status === 'cancelled') return 'failed'
  if (status === 'returned') return 'refunded'
  if (method === 'cod') return status === 'delivered' || status === 'completed' ? 'paid' : 'pending'
  return status === 'new' || status === 'confirmed' ? 'pending' : 'paid'
}

function orderEvents(
  createdMs: number,
  status: OrderStatus,
  method: PaymentMethod,
  trackingNo: string | null,
  cancel: CancelReason | null,
): OrderEvent[] {
  const events: OrderEvent[] = []
  const push = (ms: number, s: OrderStatus | null, note: string, by = 'system') =>
    events.push({ id: `oev-${createdMs.toString(36)}-${events.length}`, at: at(ms), by, status: s, note })
  const terminal = status === 'cancelled' || status === 'refunded' || status === 'returned'
  const reached = terminal ? (cancel ? 'confirmed' : 'completed') : status
  let t = createdMs
  const steps: [OrderStatus, number, string][] = [
    ['new', 0, 'Order placed'],
    ['confirmed', rng.int(2, 25) * MINUTE, 'Order confirmed'],
    ['paid', rng.int(5, 90) * MINUTE, 'Payment received'],
    ['processing', rng.int(1, 6) * HOUR, 'Picking started'],
    ['packed', rng.int(1, 5) * HOUR, 'Packed'],
    ['shipped', rng.int(2, 12) * HOUR, 'Handed to courier'],
    ['delivered', rng.int(20, 70) * HOUR, 'Delivered'],
    ['completed', rng.int(2, 4) * DAY, 'Completed after the return window'],
  ]
  const stopAt = ORDER_STATUS_FLOW.indexOf(reached)
  for (const [s, gap, note] of steps) {
    if (ORDER_STATUS_FLOW.indexOf(s) > stopAt) break
    if (s === 'paid' && method === 'cod') continue
    t += gap
    if (t > NOW) break
    push(
      t,
      s,
      s === 'shipped' && trackingNo ? `Handed to courier · ${trackingNo}` : note,
      s === 'packed' || s === 'shipped' ? 'usr-budi' : 'system',
    )
  }
  if (status === 'cancelled')
    push(
      t + rng.int(1, 20) * HOUR,
      'cancelled',
      cancel === 'payment_expired' ? 'No payment within 24 hours' : 'Cancelled',
      cancel === 'payment_expired' ? 'system' : 'usr-sari',
    )
  if (status === 'refunded')
    push(t + rng.int(1, 3) * DAY, 'refunded', 'Refunded after a complaint', 'usr-sari')
  if (status === 'returned') push(t + rng.int(2, 5) * DAY, 'returned', 'Returned: wrong size', 'usr-sari')
  return events.reverse()
}

/** Orders older than 45 days keep only their first and last event, which keeps the seed small. */
function compactHistory(events: OrderEvent[], createdMs: number): OrderEvent[] {
  return NOW - createdMs > 45 * DAY && events.length > 2 ? [events[0]!, events[events.length - 1]!] : events
}

export interface CommerceSeed {
  customers: Customer[]
  orders: Order[]
  events: CustomerEvent[]
  stock: StockLevel[]
  stockMoves: StockMove[]
  traffic: TrafficDay[]
}

export function buildCommerce(tenants: Tenant[], sellers: Seller[]): CommerceSeed {
  const customers: Customer[] = []
  const orders: Order[] = []
  const events: CustomerEvent[] = []

  for (const tenant of tenants) {
    const plan = PLAN[tenant.id]!
    const tenantSellers = sellers.filter((s) => s.tenantId === tenant.id && s.status !== 'invited')
    const tenantOrders: Order[] = []
    for (let i = 0; i < plan.customers; i++) {
      const first = rng.pick(FIRST_NAMES)
      const last = rng.pick(LAST_NAMES)
      const company = plan.companyNames
        ? COMPANIES[i % COMPANIES.length]! +
          (i >= COMPANIES.length ? ` ${Math.floor(i / COMPANIES.length) + 1}` : '')
        : null
      const name = company ?? `${first} ${last}`
      // Sign-ups grow over time, so recent weeks hold more new customers than the first ones.
      const createdMs =
        NOW -
        Math.max(1, Math.floor(plan.history * (1 - Math.sqrt(rng.next())))) * DAY -
        rng.int(0, 20) * HOUR
      const persona = rng.weighted([
        ['browser', 26],
        ['once', 36],
        ['repeat', 26],
        ['loyal', 12],
      ] as const)
      const churned = persona !== 'browser' && rng.chance(0.22)
      const seller =
        tenantSellers.length && rng.chance(tenant.id === 'ten-teknika' ? 0.8 : 0.24)
          ? rng.weighted(tenantSellers.map((s, k) => [s, k === 0 ? 5 : 2] as const))
          : null
      const city = plan.companyNames
        ? rng.pick(['Bekasi', 'Karawang', 'Tangerang', 'Surabaya', 'Batam', 'Semarang'])
        : pickCity()
      const id = `cus-${tenant.code.toLowerCase()}-${String(i + 1).padStart(4, '0')}`
      const customer: Customer = {
        id,
        tenantId: tenant.id,
        code: `${tenant.code}-C${String(10001 + i)}`,
        name,
        email: company
          ? `procurement@${company
              .toLowerCase()
              .replace(/^(pt|cv) /, '')
              .replace(/[^a-z]+/g, '')}.co.id`
          : `${first}.${last}${i}`.toLowerCase() + '@mail.id',
        phone: `+62 8${rng.int(11, 59)} ${rng.int(1000, 9999)} ${rng.int(1000, 9999)}`,
        city,
        source: seller
          ? 'personal_store'
          : rng.weighted([
              ['web', 60],
              ['marketplace', 15],
              ['whatsapp', 15],
              ['pos', 10],
            ] as const),
        stage: 'registered',
        tier: 'member',
        points: 0,
        tags: [],
        interests: [],
        sellerId: seller?.id ?? null,
        createdAt: at(createdMs),
        birthday: plan.companyNames
          ? null
          : `${rng.int(1975, 2004)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
        color: rng.pick(AVATAR_COLORS),
      }
      customers.push(customer)
      events.push({
        id: `ev-reg-${id}`,
        tenantId: tenant.id,
        customerId: id,
        kind: 'registered',
        at: customer.createdAt,
        label: 'Created an account',
        productId: null,
        orderId: null,
        campaignId: null,
        by: null,
      })
      if (persona === 'browser') continue

      const maxOrders = persona === 'once' ? 1 : persona === 'repeat' ? rng.int(2, 4) : rng.int(5, 11)
      const gapDays = persona === 'loyal' ? [10, 30] : [18, 55]
      let t = createdMs + rng.int(0, 6) * DAY + rng.int(1, 10) * HOUR
      const stopMs = churned ? createdMs + rng.int(20, 60) * DAY : NOW
      for (let n = 0; n < maxOrders && t < Math.min(stopMs, NOW - 30 * MINUTE); n++) {
        const method = plan.companyNames
          ? rng.weighted([
              ['bank_transfer', 6],
              ['va', 4],
            ] as const)
          : rng.weighted(METHODS)
        const { status, cancel } = statusForAge(NOW - t, method === 'cod')
        const lineCount = plan.companyNames
          ? rng.int(1, 3)
          : rng.weighted([
              [1, 60],
              [2, 30],
              [3, 10],
            ] as const)
        const lines: OrderLine[] = []
        for (let k = 0; k < lineCount; k++) {
          const product = pickProduct(tenant.id)
          if (lines.some((l) => l.productId === product.id)) continue
          const variant = rng.pick(product.variants)
          const qty = plan.companyNames
            ? product.price > 10_000_000
              ? 1
              : rng.int(2, 8)
            : product.price < 300_000 && rng.chance(0.3)
              ? 2
              : 1
          lines.push({ productId: product.id, variantId: variant.id, qty, price: variant.price })
        }
        const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0)
        const campaign = CAMPAIGN_SPECS.find(
          (c) =>
            c.tenantId === tenant.id &&
            c.status !== 'draft' &&
            t >= NOW - c.start * DAY &&
            t <= NOW - c.end * DAY,
        )
        const fromCampaign = campaign && rng.chance(0.35) ? campaign : null
        const voucher = fromCampaign?.promotionId ? rng.chance(0.7) : rng.chance(0.08)
        const discount = voucher ? Math.min(Math.round((subtotal * 0.1) / 1000) * 1000, 150_000) : 0
        const shipping =
          subtotal - discount >= tenant.loyalty.freeShippingMin
            ? 0
            : plan.companyNames
              ? 350_000
              : rng.pick([15_000, 18_000, 22_000, 25_000, 32_000])
        const total = subtotal - discount + shipping
        const viaSeller = seller && rng.chance(0.75) ? seller : null
        const channel: Channel = viaSeller
          ? rng.weighted([
              ['personal_store', 70],
              ['whatsapp', 30],
            ] as const)
          : customer.source === 'personal_store'
            ? 'web'
            : rng.weighted([
                ['web', 70],
                ['marketplace', 14],
                ['whatsapp', 8],
                ['pos', 8],
              ] as const)
        const courier = channel === 'pos' ? 'pickup' : plan.companyNames ? 'lalamove' : rng.weighted(COURIERS)
        const reachedShip = ['shipped', 'delivered', 'completed', 'returned'].includes(status)
        const trackingNo =
          reachedShip && courier !== 'pickup'
            ? `${courier.toUpperCase()}${rng.int(10000000, 99999999)}`
            : null
        const createdAt = at(t)
        const order: Order = {
          id: `ord-${tenant.code.toLowerCase()}-${t.toString(36)}${k36(i)}`,
          tenantId: tenant.id,
          code: '',
          customerId: id,
          channel,
          sellerId: viaSeller?.id ?? null,
          campaignId: fromCampaign?.id ?? null,
          status,
          paymentStatus: paymentFor(status, method),
          paymentMethod: method,
          courier,
          trackingNo,
          warehouseId: warehouseFor(tenant.id, city).id,
          city,
          lines,
          subtotal,
          discount,
          shipping,
          total,
          voucherCode: voucher
            ? fromCampaign?.promotionId
              ? promoCode(fromCampaign.promotionId)
              : 'WELCOME10'
            : null,
          pointsEarned: Math.floor(total / 10_000) * tenant.loyalty.pointsPer10k,
          createdAt,
          cancelReason: cancel,
          refundedAmount: status === 'refunded' || status === 'returned' ? total : 0,
          events: compactHistory(orderEvents(t, status, method, trackingNo, cancel), t),
        }
        tenantOrders.push(order)
        t += rng.int(gapDays[0]!, gapDays[1]!) * DAY + rng.int(-8, 8) * HOUR
      }
    }

    // A few orders that need attention today, so the queues on the dashboard have work in them.
    const recent = tenantOrders.filter((o) => o.status === 'paid' || o.status === 'processing')
    for (const o of recent.slice(0, tenant.id === 'ten-lari' ? 3 : 1)) {
      const moved = NOW - rng.int(50, 80) * HOUR
      o.createdAt = at(moved)
      o.events = o.events.map((e, idx) => ({ ...e, at: at(moved + (o.events.length - idx) * 20 * MINUTE) }))
    }
    const pending = tenantOrders.filter((o) => o.status === 'new' && o.paymentMethod !== 'cod')
    for (const o of pending.slice(0, 2)) {
      const moved = NOW - rng.int(19, 22) * HOUR
      o.createdAt = at(moved)
      o.events = [{ id: `${o.id}-placed`, at: at(moved), by: 'system', status: 'new', note: 'Order placed' }]
    }

    tenantOrders.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))
    tenantOrders.forEach((o, n) => (o.code = `${tenant.code}-${String(10001 + n)}`))
    orders.push(...tenantOrders)
  }

  finishCustomers(tenants, customers, orders, events)
  const stock = buildStock(orders)
  const stockMoves = buildStockMoves(stock)
  const traffic = buildTraffic(tenants, sellers, orders)
  return { customers, orders, events, stock, stockMoves, traffic }
}

const k36 = (i: number) => i.toString(36)

function promoCode(promotionId: string) {
  const map: Record<string, string> = {
    'promo-lari-runmonth': 'RUNMONTH15',
    'promo-lari-payday': 'PAYDAY100',
    'promo-lari-welcomeback': 'COMEBACK20',
    'promo-aruna-glow': 'GLOWWEEK',
  }
  return map[promotionId] ?? 'WELCOME10'
}

const SOLD: OrderStatus[] = ['paid', 'processing', 'packed', 'shipped', 'delivered', 'completed']

function finishCustomers(tenants: Tenant[], customers: Customer[], orders: Order[], events: CustomerEvent[]) {
  const byCustomer = new Map<string, Order[]>()
  for (const o of orders) {
    const list = byCustomer.get(o.customerId) ?? []
    list.push(o)
    byCustomer.set(o.customerId, list)
  }
  const categoryOf = new Map(products.map((p) => [p.id, p.categoryId]))
  const productName = new Map(products.map((p) => [p.id, p.name]))
  for (const c of customers) {
    const tenant = tenants.find((t) => t.id === c.tenantId)!
    const list = (byCustomer.get(c.id) ?? []).filter((o) => SOLD.includes(o.status))
    const spend = list.reduce((s, o) => s + o.total - o.refundedAmount, 0)
    const last = list.length ? Math.max(...list.map((o) => toMs(o.createdAt))) : null
    const days = last === null ? null : (NOW - last) / DAY
    const counts = new Map<string, number>()
    for (const o of list)
      for (const l of o.lines)
        counts.set(categoryOf.get(l.productId)!, (counts.get(categoryOf.get(l.productId)!) ?? 0) + l.qty)
    c.interests = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id)
    c.tier = tierFor(spend, tenant.loyalty)
    let stage: LifecycleStage
    if (!list.length)
      stage = rng.weighted([
        ['registered', 60],
        ['lead', 25],
        ['visitor', 15],
      ] as const)
    else if (days! > 150) stage = 'dormant'
    else if (days! > 90) stage = 'at_risk'
    else if (c.tier === 'platinum' || (c.tier === 'gold' && list.length >= 6)) stage = 'vip'
    else if (list.length >= 4) stage = 'loyal'
    else if (list.length >= 2) stage = 'repeat_buyer'
    else stage = 'first_buyer'
    c.stage = stage
    const earned = list.reduce((s, o) => s + o.pointsEarned, 0)
    c.points = Math.max(0, earned - (rng.chance(0.3) ? Math.floor(earned * rng.float(0.2, 0.7)) : 0))
    if (c.tenantId === 'ten-lari' && counts.has('cat-lari-trail')) c.tags.push('trail')
    if (c.tenantId === 'ten-lari' && spend > 8_000_000) c.tags.push('marathoner')
    if (c.tenantId === 'ten-aruna' && counts.has('cat-aruna-sets')) c.tags.push('gift buyer')
    if (c.tenantId === 'ten-teknika') c.tags.push('b2b')
    if (rng.chance(0.35)) c.tags.push('newsletter')
    if (!list.length && c.interests.length === 0) {
      const cats = [...new Set(products.filter((p) => p.tenantId === c.tenantId).map((p) => p.categoryId))]
      c.interests = [rng.pick(cats)]
    }

    // Purchases, reviews and tier moves on the timeline.
    let running = 0
    let tier = tierFor(0, tenant.loyalty)
    for (const o of [...list].sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))) {
      const ms = toMs(o.createdAt)
      events.push({
        id: `ev-buy-${o.id}`,
        tenantId: c.tenantId,
        customerId: c.id,
        kind: 'purchase',
        at: at(ms + 40 * MINUTE),
        label: `Order ${o.code} · ${o.lines.length} ${o.lines.length === 1 ? 'item' : 'items'}`,
        productId: o.lines[0]!.productId,
        orderId: o.id,
        campaignId: o.campaignId,
        by: null,
      })
      running += o.total
      const next = tierFor(running, tenant.loyalty)
      if (next !== tier) {
        events.push({
          id: `ev-tier-${o.id}`,
          tenantId: c.tenantId,
          customerId: c.id,
          kind: 'tier_upgraded',
          at: at(ms + HOUR),
          label: `Moved up to ${next[0]!.toUpperCase()}${next.slice(1)}`,
          productId: null,
          orderId: null,
          campaignId: null,
          by: null,
        })
        tier = next
      }
      if ((o.status === 'completed' || o.status === 'delivered') && rng.chance(0.18)) {
        events.push({
          id: `ev-rev-${o.id}`,
          tenantId: c.tenantId,
          customerId: c.id,
          kind: 'review',
          at: at(Math.min(ms + rng.int(4, 9) * DAY, NOW - rng.int(1, 6) * HOUR)),
          label: `Rated ${productName.get(o.lines[0]!.productId)} ${rng.int(4, 5)} stars`,
          productId: o.lines[0]!.productId,
          orderId: o.id,
          campaignId: null,
          by: null,
        })
      }
    }

    // Recent browsing for active shoppers.
    if (rng.chance(c.stage === 'dormant' ? 0.05 : 0.38)) {
      const n = rng.int(2, 6)
      const tenantProducts = products.filter((p) => p.tenantId === c.tenantId && p.status === 'active')
      for (let k = 0; k < n; k++) {
        const ms = NOW - rng.int(0, 13) * DAY - rng.int(1, 20) * HOUR
        const p = rng.pick(tenantProducts)
        const daysAgo = Math.floor((NOW - ms) / DAY)
        // Campaign mail only exists for a campaign of this tenant that was running on that day.
        const campaign = CAMPAIGN_SPECS.find(
          (x) => x.tenantId === c.tenantId && x.status === 'running' && x.start >= daysAgo,
        )
        const tenantCollections = collections.filter((x) => x.tenantId === c.tenantId)
        const picked = rng.weighted([
          ['product_viewed', 50],
          ['search', 12],
          ['add_to_cart', 16],
          ['wishlist', 8],
          ['campaign_opened', 8],
          ['collection_viewed', 6],
        ] as const)
        const kind = picked === 'campaign_opened' && !campaign ? 'product_viewed' : picked
        const collection = rng.pick(tenantCollections)
        const label =
          kind === 'search'
            ? `Searched "${rng.pick(SEARCHES[c.tenantId] ?? ['gift'])}"`
            : kind === 'campaign_opened'
              ? `Opened ${campaign!.name} email`
              : kind === 'collection_viewed'
                ? `Viewed ${collection.name}`
                : productName.get(p.id)!
        events.push({
          id: `ev-b-${c.id}-${k}`,
          tenantId: c.tenantId,
          customerId: c.id,
          kind,
          at: at(ms),
          label,
          productId:
            kind === 'search' || kind === 'campaign_opened' || kind === 'collection_viewed' ? null : p.id,
          orderId: null,
          campaignId: kind === 'campaign_opened' ? campaign!.id : null,
          by: null,
        })
      }
    }
    // Abandoned checkouts that a cart automation can pick up.
    if (c.tenantId !== 'ten-teknika' && rng.chance(0.06)) {
      const ms = NOW - rng.int(2, 120) * HOUR
      const p = rng.pick(
        products.filter((x) => x.tenantId === c.tenantId && x.status === 'active' && x.price > 0),
      )
      events.push({
        id: `ev-cart-${c.id}`,
        tenantId: c.tenantId,
        customerId: c.id,
        kind: 'add_to_cart',
        at: at(ms - 15 * MINUTE),
        label: p.name,
        productId: p.id,
        orderId: null,
        campaignId: null,
        by: null,
      })
      events.push({
        id: `ev-ab-${c.id}`,
        tenantId: c.tenantId,
        customerId: c.id,
        kind: 'checkout_abandoned',
        at: at(ms),
        label: `Left ${p.name} at payment`,
        productId: p.id,
        orderId: null,
        campaignId: null,
        by: null,
      })
    }
  }
}

const SEARCHES: Record<string, string[]> = {
  'ten-lari': ['sepatu lari 10k', 'carbon plate', 'trail', 'kaos kaki', 'gel', 'wide fit', 'jam gps'],
  'ten-aruna': ['serum sensitif', 'sunscreen', 'lip matte', 'parfum', 'jerawat'],
}

function buildStock(orders: Order[]): StockLevel[] {
  const open = orders.filter((o) => ['new', 'confirmed', 'paid', 'processing', 'packed'].includes(o.status))
  const reserved = new Map<string, number>()
  for (const o of open)
    for (const l of o.lines)
      reserved.set(
        `${l.variantId}@${o.warehouseId}`,
        (reserved.get(`${l.variantId}@${o.warehouseId}`) ?? 0) + l.qty,
      )
  const stock: StockLevel[] = []
  for (const p of products) {
    if (p.type === 'digital' || p.type === 'service' || p.type === 'subscription' || p.assisted) continue
    const whs = warehouses.filter((w) => w.tenantId === p.tenantId)
    const pop = popularity.get(p.id) ?? 0
    for (const v of p.variants) {
      for (const [w, wh] of whs.entries()) {
        const res = reserved.get(`${v.id}@${wh.id}`) ?? 0
        const safety = p.variants.length > 2 ? 3 : p.price > 10_000_000 ? 1 : 8
        let onHand = Math.round((pop + 2) * rng.float(0.8, 3.2) * (w === 0 ? 1 : 0.45))
        const roll = rng.next()
        if (p.status === 'draft' || p.type === 'preorder') onHand = 0
        else if (roll < 0.05) onHand = res
        else if (roll < 0.14) onHand = res + rng.int(1, safety)
        onHand = Math.max(onHand, res)
        stock.push({
          id: `stk-${v.id}-${wh.code.toLowerCase()}`,
          tenantId: p.tenantId,
          productId: p.id,
          variantId: v.id,
          warehouseId: wh.id,
          onHand,
          reserved: res,
          safety,
        })
      }
    }
  }
  // One processing order that cannot be packed yet: the stock count found fewer pairs than the system held.
  const short = orders.find(
    (o) =>
      o.tenantId === 'ten-lari' &&
      o.status === 'processing' &&
      o.lines.some((l) => stock.some((s) => s.variantId === l.variantId && s.warehouseId === o.warehouseId)),
  )
  if (short) {
    const line = short.lines.find((l) =>
      stock.some((s) => s.variantId === l.variantId && s.warehouseId === short.warehouseId),
    )!
    const level = stock.find((s) => s.variantId === line.variantId && s.warehouseId === short.warehouseId)!
    level.onHand = Math.max(0, line.qty - 1)
  }
  return stock
}

function buildStockMoves(stock: StockLevel[]): StockMove[] {
  const moves: StockMove[] = []
  for (const s of stock.filter((x) => x.onHand > 0).slice(0, 400)) {
    if (!rng.chance(0.25)) continue
    const ms = NOW - rng.int(1, 40) * DAY - rng.int(1, 10) * HOUR
    moves.push({
      id: `mv-r-${s.id}`,
      tenantId: s.tenantId,
      variantId: s.variantId,
      warehouseId: s.warehouseId,
      kind: 'receipt',
      qty: rng.int(6, 30),
      at: at(ms),
      by: 'usr-budi',
      note: `PO-${rng.int(2400, 2600)}`,
    })
    if (rng.chance(0.2)) {
      moves.push({
        id: `mv-a-${s.id}`,
        tenantId: s.tenantId,
        variantId: s.variantId,
        warehouseId: s.warehouseId,
        kind: 'adjustment',
        qty: -rng.int(1, 2),
        at: at(ms + 3 * DAY),
        by: 'usr-budi',
        note: 'Stock count difference',
      })
    }
  }
  return moves.sort((a, b) => toMs(b.at) - toMs(a.at))
}

function buildTraffic(tenants: Tenant[], sellers: Seller[], orders: Order[]): TrafficDay[] {
  const traffic: TrafficDay[] = []
  const perDay = new Map<string, number>()
  for (const o of orders) {
    const key = `${o.tenantId}|${dayKey(toMs(o.createdAt))}`
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  const today = startOfDay(NOW)
  for (const t of tenants) {
    const span = PLAN[t.id]!.history
    for (let d = span; d >= 0; d--) {
      const ms = today - d * DAY
      const day = dayKey(ms)
      const count = perDay.get(`${t.id}|${day}`) ?? 0
      const rate = t.id === 'ten-teknika' ? 0.004 : rng.float(0.016, 0.026)
      const visitors = Math.round((count + rng.float(0.5, 2)) / rate)
      const carts = Math.round(visitors * rng.float(0.06, 0.1))
      traffic.push({
        id: `trf-${t.code.toLowerCase()}-${day}`,
        tenantId: t.id,
        sellerId: null,
        day,
        visitors,
        pageViews: Math.round(visitors * rng.float(2.4, 3.6)),
        carts,
        checkouts: Math.round(carts * rng.float(0.4, 0.55)),
      })
    }
  }
  for (const s of sellers) {
    if (s.status !== 'active') continue
    const weight = s.kind === 'affiliate' ? 3 : s.userId ? 2 : 1
    for (let d = 89; d >= 0; d--) {
      const ms = today - d * DAY
      const visitors = Math.round(rng.float(8, 30) * weight)
      traffic.push({
        id: `trf-${s.id}-${dayKey(ms)}`,
        tenantId: s.tenantId,
        sellerId: s.id,
        day: dayKey(ms),
        visitors,
        pageViews: Math.round(visitors * rng.float(1.5, 2.4)),
        carts: Math.round(visitors * 0.07),
        checkouts: Math.round(visitors * 0.035),
      })
    }
  }
  return traffic
}
