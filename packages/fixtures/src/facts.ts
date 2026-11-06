import type {
  CustomerEvent,
  CustomerMetricsRow,
  Order,
  ProductDay,
  SalesDay,
  SellerBuyer,
} from '@rc/types'
import { dayKey, monthKey, toIso, toMs } from './dates'
import { isSold } from './derive'

/**
 * The read models the API keeps (apps/api/internal/readmodel), derived here from orders and events
 * for the demo, which has no server. Both modes then run the same analytics over the same rows. The
 * API's parity test compares its projection with what these functions make from the seed.
 */
export interface Facts {
  customerMetrics: CustomerMetricsRow[]
  salesDays: SalesDay[]
  productDays: ProductDay[]
  sellerBuyers: SellerBuyer[]
}

const net = (o: Order) => o.total - o.refundedAmount

export function deriveFacts(orders: readonly Order[], events: readonly CustomerEvent[]): Facts {
  const sales = new Map<string, SalesDay>()
  const products = new Map<string, ProductDay>()
  const buyers = new Map<string, SellerBuyer>()
  const metrics = new Map<string, CustomerMetricsRow>()
  const metricOf = (tenantId: string, customerId: string) => {
    let m = metrics.get(customerId)
    if (!m) {
      m = {
        id: customerId,
        tenantId,
        customerId,
        orders: 0,
        spend: 0,
        firstAt: null,
        lastAt: null,
        productCounts: {},
        lastAbandonedAt: null,
        lastPurchaseEventAt: null,
        buyMonths: [],
      }
      metrics.set(customerId, m)
    }
    return m
  }
  const later = (a: string | null, b: string) => (a === null || toMs(b) > toMs(a) ? b : a)

  for (const o of orders) {
    if (!isSold(o)) continue
    const at = toMs(o.createdAt)
    const day = dayKey(at)
    const salesId = [o.tenantId, day, o.channel, o.sellerId ?? '', o.campaignId ?? ''].join(':')
    const s = sales.get(salesId) ?? {
      id: salesId,
      tenantId: o.tenantId,
      day,
      channel: o.channel,
      sellerId: o.sellerId,
      campaignId: o.campaignId,
      orders: 0,
      revenue: 0,
    }
    s.orders += 1
    s.revenue += net(o)
    sales.set(salesId, s)

    const seen = new Set<string>()
    for (const l of o.lines) {
      const id = [o.tenantId, day, l.productId].join(':')
      const p = products.get(id) ?? {
        id,
        tenantId: o.tenantId,
        day,
        productId: l.productId,
        units: 0,
        revenue: 0,
        orders: 0,
      }
      p.units += l.qty
      p.revenue += l.qty * l.price
      if (!seen.has(l.productId)) p.orders += 1
      seen.add(l.productId)
      products.set(id, p)
    }

    if (o.sellerId) {
      const id = [o.tenantId, o.sellerId, o.customerId, day].join(':')
      const b = buyers.get(id) ?? {
        id,
        tenantId: o.tenantId,
        sellerId: o.sellerId,
        customerId: o.customerId,
        day,
        orders: 0,
      }
      b.orders += 1
      buyers.set(id, b)
    }

    const m = metricOf(o.tenantId, o.customerId)
    m.orders += 1
    m.spend += net(o)
    m.firstAt = m.firstAt === null || at < toMs(m.firstAt) ? toIso(at) : m.firstAt
    m.lastAt = later(m.lastAt, toIso(at))
    for (const l of o.lines) m.productCounts[l.productId] = (m.productCounts[l.productId] ?? 0) + l.qty
    const month = monthKey(at)
    if (!m.buyMonths.includes(month)) m.buyMonths.push(month)
  }

  for (const e of events) {
    if (e.kind === 'checkout_abandoned') {
      const m = metricOf(e.tenantId, e.customerId)
      m.lastAbandonedAt = later(m.lastAbandonedAt, toIso(toMs(e.at)))
    }
  }
  for (const e of events) {
    const m = metrics.get(e.customerId)
    if (e.kind === 'purchase' && m) m.lastPurchaseEventAt = later(m.lastPurchaseEventAt, toIso(toMs(e.at)))
  }
  for (const m of metrics.values()) m.buyMonths.sort()

  return {
    customerMetrics: [...metrics.values()],
    salesDays: [...sales.values()],
    productDays: [...products.values()],
    sellerBuyers: [...buyers.values()],
  }
}
