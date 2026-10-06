import type {
  AttributeDef,
  Category,
  Customer,
  CustomerEvent,
  LoyaltyConfig,
  LoyaltyTier,
  Order,
  OrderStatus,
  Product,
  Segment,
  SegmentRule,
  StockLevel,
  StockState,
} from '@rc/types'
import { ORDER_STATUS_FLOW, SOLD_ORDER_STATUSES } from '@rc/types'
import { nowMs } from './clock'
import { DAY, toMs } from './dates'

const SOLD = new Set<OrderStatus>(SOLD_ORDER_STATUSES)

/** True once an order counts as revenue. */
export const isSold = (o: Order) => SOLD.has(o.status)

/** A category and every child category beneath it. */
export function categoryTreeIds(categories: readonly Category[], categoryId: string): Set<string> {
  const ids = new Set([categoryId])
  for (let changed = true; changed;) {
    changed = false
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id)
        changed = true
      }
    }
  }
  return ids
}

// --- stock ---

export interface StockSummary {
  onHand: number
  reserved: number
  available: number
  safety: number
}

export function sumStock(
  levels: readonly Pick<StockLevel, 'onHand' | 'reserved' | 'safety'>[],
): StockSummary {
  let onHand = 0
  let reserved = 0
  let safety = 0
  for (const l of levels) {
    onHand += l.onHand
    reserved += l.reserved
    safety += l.safety
  }
  return { onHand, reserved, available: onHand - reserved, safety }
}

export function stockState(product: Pick<Product, 'type'>, summary: StockSummary): StockState {
  if (product.type === 'digital' || product.type === 'service' || product.type === 'subscription')
    return 'untracked'
  if (summary.available <= 0) return 'out'
  if (summary.available <= summary.safety) return 'low'
  return 'in_stock'
}

/** Stock per product id, for list pages. */
export function stockByProduct(stock: readonly StockLevel[]): Map<string, StockSummary> {
  const groups = new Map<string, StockLevel[]>()
  for (const l of stock) {
    const list = groups.get(l.productId)
    if (list) list.push(l)
    else groups.set(l.productId, [l])
  }
  return new Map([...groups].map(([id, levels]) => [id, sumStock(levels)]))
}

/** Total units needed for each modifier option across all lines of an order. */
export function modifierDemand(order: Order): Map<string, number> {
  const demand = new Map<string, number>()
  for (const line of order.lines) {
    for (const option of line.modifiers ?? []) {
      demand.set(option.optionId, (demand.get(option.optionId) ?? 0) + line.qty)
    }
  }
  return demand
}

export function variantDemand(order: Order): Map<string, number> {
  const demand = new Map<string, number>()
  for (const line of order.lines) {
    demand.set(line.variantId, (demand.get(line.variantId) ?? 0) + line.qty)
  }
  return demand
}

// --- orders ---

export const lineTotal = (lines: Order['lines']) => lines.reduce((sum, l) => sum + l.qty * l.price, 0)
export const unitCount = (lines: Order['lines']) => lines.reduce((sum, l) => sum + l.qty, 0)

/** The status an order moves to next. Cash on delivery skips the paid step until delivery. */
export function nextOrderStatus(order: Pick<Order, 'status' | 'paymentMethod'>): OrderStatus | null {
  const i = ORDER_STATUS_FLOW.indexOf(order.status)
  if (i < 0 || i === ORDER_STATUS_FLOW.length - 1) return null
  const next = ORDER_STATUS_FLOW[i + 1]!
  if (next === 'paid' && order.paymentMethod === 'cod') return 'processing'
  return next
}

/** Verb on the button that moves an order to `status`. */
export const ORDER_ADVANCE_VERB: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Confirm order',
  paid: 'Record payment',
  processing: 'Start processing',
  packed: 'Mark packed',
  shipped: 'Ship order',
  delivered: 'Mark delivered',
  completed: 'Complete order',
}

// --- customers ---

export interface CustomerMetrics {
  orders: number
  spend: number
  aov: number
  firstAt: number | null
  lastAt: number | null
  daysSinceLast: number | null
  categoryCounts: Map<string, number>
}

const emptyMetrics = (): CustomerMetrics => ({
  orders: 0,
  spend: 0,
  aov: 0,
  firstAt: null,
  lastAt: null,
  daysSinceLast: null,
  categoryCounts: new Map(),
})

/** Order count, spend and recency per customer, from sold orders. */
export function customerMetrics(
  orders: readonly Order[],
  categoryOf: (productId: string) => string | undefined,
  now = nowMs(),
): Map<string, CustomerMetrics> {
  const map = new Map<string, CustomerMetrics>()
  for (const o of orders) {
    if (!isSold(o)) continue
    const m = map.get(o.customerId) ?? emptyMetrics()
    const at = toMs(o.createdAt)
    m.orders += 1
    m.spend += o.total - o.refundedAmount
    m.firstAt = m.firstAt === null ? at : Math.min(m.firstAt, at)
    m.lastAt = m.lastAt === null ? at : Math.max(m.lastAt, at)
    for (const l of o.lines) {
      const cat = categoryOf(l.productId)
      if (cat) m.categoryCounts.set(cat, (m.categoryCounts.get(cat) ?? 0) + l.qty)
    }
    map.set(o.customerId, m)
  }
  for (const m of map.values()) {
    m.aov = m.orders ? m.spend / m.orders : 0
    m.daysSinceLast = m.lastAt === null ? null : Math.floor((now - m.lastAt) / DAY)
  }
  return map
}

export const metricsFor = (map: Map<string, CustomerMetrics>, id: string) => map.get(id) ?? emptyMetrics()

/** The most bought category id of a customer. */
export function favouriteCategory(m: CustomerMetrics): string | null {
  let best: string | null = null
  let count = 0
  for (const [id, n] of m.categoryCounts) {
    if (n > count) {
      best = id
      count = n
    }
  }
  return best
}

export function tierFor(spend: number, loyalty: LoyaltyConfig): LoyaltyTier {
  if (spend >= loyalty.thresholds.platinum) return 'platinum'
  if (spend >= loyalty.thresholds.gold) return 'gold'
  if (spend >= loyalty.thresholds.silver) return 'silver'
  return 'member'
}

/** Spend still needed to reach the next tier, or null at the top. */
export function nextTierGap(
  spend: number,
  loyalty: LoyaltyConfig,
): { tier: LoyaltyTier; gap: number } | null {
  const steps: [LoyaltyTier, number][] = [
    ['silver', loyalty.thresholds.silver],
    ['gold', loyalty.thresholds.gold],
    ['platinum', loyalty.thresholds.platinum],
  ]
  const next = steps.find(([, min]) => spend < min)
  return next ? { tier: next[0], gap: next[1] - spend } : null
}

// --- segments ---

export interface SegmentContext {
  metrics: Map<string, CustomerMetrics>
  /** Customers with a checkout abandoned in the last 7 days. */
  abandoned: Set<string>
}

/** Customers whose checkout was abandoned in the last 7 days without a later purchase. */
export function abandonedCheckouts(events: readonly CustomerEvent[], now = nowMs()): Set<string> {
  const last = new Map<string, { abandoned: number; purchased: number }>()
  for (const e of events) {
    if (e.kind !== 'checkout_abandoned' && e.kind !== 'purchase') continue
    const at = toMs(e.at)
    const row = last.get(e.customerId) ?? { abandoned: 0, purchased: 0 }
    if (e.kind === 'checkout_abandoned') row.abandoned = Math.max(row.abandoned, at)
    else row.purchased = Math.max(row.purchased, at)
    last.set(e.customerId, row)
  }
  const out = new Set<string>()
  for (const [id, row] of last) {
    if (row.abandoned > row.purchased && now - row.abandoned <= 7 * DAY) out.add(id)
  }
  return out
}

function compare(actual: number, op: SegmentRule['op'], value: number) {
  if (op === 'gt') return actual > value
  if (op === 'lt') return actual < value
  return actual === value
}

export function ruleMatches(rule: SegmentRule, c: Customer, ctx: SegmentContext): boolean {
  const m = metricsFor(ctx.metrics, c.id)
  const n = Number(rule.value)
  switch (rule.field) {
    case 'orders':
      return compare(m.orders, rule.op, n)
    case 'spend':
      return compare(m.spend, rule.op, n)
    case 'days_since_purchase':
      return m.daysSinceLast !== null && compare(m.daysSinceLast, rule.op, n)
    case 'tier':
      return c.tier === rule.value
    case 'stage':
      return c.stage === rule.value
    case 'interest':
      return c.interests.includes(rule.value)
    case 'city':
      return c.city === rule.value
    case 'abandoned_cart':
      return ctx.abandoned.has(c.id) === (rule.value === 'yes')
  }
}

export function inSegment(
  segment: Pick<Segment, 'rules' | 'match'>,
  c: Customer,
  ctx: SegmentContext,
): boolean {
  if (!segment.rules.length) return false
  return segment.match === 'all'
    ? segment.rules.every((r) => ruleMatches(r, c, ctx))
    : segment.rules.some((r) => ruleMatches(r, c, ctx))
}

export function segmentMembers(
  segment: Pick<Segment, 'rules' | 'match'>,
  customers: readonly Customer[],
  ctx: SegmentContext,
) {
  return customers.filter((c) => inSegment(segment, c, ctx))
}

/** Metrics and cart state that segment rules read. */
export function segmentContext(
  orders: readonly Order[],
  products: readonly Pick<Product, 'id' | 'categoryId'>[],
  events: readonly CustomerEvent[],
  now = nowMs(),
): SegmentContext {
  const category = new Map(products.map((p) => [p.id, p.categoryId]))
  return {
    metrics: customerMetrics(orders, (id) => category.get(id), now),
    abandoned: abandonedCheckouts(events, now),
  }
}

// --- catalog setup ---

/** Attributes that apply to a product: global ones plus those set on its category or the category's parent. */
export function attributesFor(
  categoryId: string,
  defs: readonly AttributeDef[],
  categories: readonly Category[],
): AttributeDef[] {
  const parent = categories.find((c) => c.id === categoryId)?.parentId
  return defs.filter(
    (d) =>
      !d.categoryIds.length ||
      d.categoryIds.includes(categoryId) ||
      (!!parent && d.categoryIds.includes(parent)),
  )
}

/** The instruction to show when a value does not fit its attribute, or null. */
export function attributeValueError(def: AttributeDef, value: string): string | null {
  const v = value.trim()
  if (!v) return def.required ? `Enter ${def.name.toLowerCase()}.` : null
  if (def.type === 'number' && !Number.isFinite(Number(v)))
    return `${def.name} takes a number${def.unit ? ` in ${def.unit}` : ''}.`
  if (def.type === 'select' && !def.options.includes(v))
    return `Choose one of the ${def.name.toLowerCase()} options.`
  if (def.type === 'boolean' && v !== 'yes' && v !== 'no') return 'Choose yes or no.'
  return null
}

/** "8 mm", "Road", "Yes". */
export function formatAttribute(def: AttributeDef, value: string | undefined): string {
  if (!value) return 'Not set'
  if (def.type === 'boolean') return value === 'yes' ? 'Yes' : 'No'
  return def.unit ? `${value} ${def.unit}` : value
}

// --- misc ---

/** "fahmi" from "Fahmi Rahman". */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const margin = (price: number, cost: number) => (price > 0 ? (price - cost) / price : 0)
