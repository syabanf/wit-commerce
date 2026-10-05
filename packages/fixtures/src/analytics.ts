import type { Channel, Lead, Order, Product, Seller, TrafficDay } from '@rc/types'
import { nowMs } from './clock'
import { DAY, addMonths, dayKey, monthKey, startOfDay, startOfMonth, toMs } from './dates'
import { isSold } from './derive'
import { fmtDateShort, fmtMonthShort } from './format'

export interface DayPoint {
  day: string
  label: string
  revenue: number
  orders: number
}

/** Sold revenue and order count per day for the last `days` days, today included. */
export function dailyRevenue(orders: readonly Order[], days: number, now = nowMs()): DayPoint[] {
  const start = startOfDay(now) - (days - 1) * DAY
  const points: DayPoint[] = Array.from({ length: days }, (_, i) => {
    const ms = start + i * DAY
    return { day: dayKey(ms), label: fmtDateShort(ms), revenue: 0, orders: 0 }
  })
  const index = new Map(points.map((p, i) => [p.day, i]))
  for (const o of orders) {
    if (!isSold(o)) continue
    const i = index.get(dayKey(toMs(o.createdAt)))
    if (i === undefined) continue
    points[i]!.revenue += o.total - o.refundedAmount
    points[i]!.orders += 1
  }
  return points
}

export interface PeriodKpis {
  revenue: number
  orders: number
  aov: number
  visitors: number
  conversion: number
  newCustomers: number
  returningCustomers: number
  prev: { revenue: number; orders: number; conversion: number }
}

function inWindow(ms: number, from: number, to: number) {
  return ms >= from && ms < to
}

/** Revenue, orders, AOV and conversion for the last `days` days, with the window before it. */
export function periodKpis(
  orders: readonly Order[],
  traffic: readonly TrafficDay[],
  days: number,
  now = nowMs(),
): PeriodKpis {
  const end = startOfDay(now) + DAY
  const from = end - days * DAY
  const prevFrom = from - days * DAY
  const sold = orders.filter(isSold)
  const firstOrder = new Map<string, number>()
  for (const o of sold) {
    const at = toMs(o.createdAt)
    const prev = firstOrder.get(o.customerId)
    if (prev === undefined || at < prev) firstOrder.set(o.customerId, at)
  }
  const sum = (a: number, b: number) => {
    let revenue = 0
    let count = 0
    for (const o of sold) {
      if (!inWindow(toMs(o.createdAt), a, b)) continue
      revenue += o.total - o.refundedAmount
      count += 1
    }
    return { revenue, count }
  }
  const visitorsIn = (a: number, b: number) =>
    traffic.reduce(
      (n, t) => (t.sellerId === null && inWindow(toMs(`${t.day}T12:00:00+07:00`), a, b) ? n + t.visitors : n),
      0,
    )
  const cur = sum(from, end)
  const prev = sum(prevFrom, from)
  const visitors = visitorsIn(from, end)
  const prevVisitors = visitorsIn(prevFrom, from)
  const buyers = new Set(sold.filter((o) => inWindow(toMs(o.createdAt), from, end)).map((o) => o.customerId))
  let newCustomers = 0
  for (const id of buyers) if ((firstOrder.get(id) ?? 0) >= from) newCustomers += 1
  return {
    revenue: cur.revenue,
    orders: cur.count,
    aov: cur.count ? cur.revenue / cur.count : 0,
    visitors,
    conversion: visitors ? cur.count / visitors : 0,
    newCustomers,
    returningCustomers: buyers.size - newCustomers,
    prev: {
      revenue: prev.revenue,
      orders: prev.count,
      conversion: prevVisitors ? prev.count / prevVisitors : 0,
    },
  }
}

/** Relative change, or null when there is no base to compare with. */
export const change = (cur: number, prev: number) => (prev ? (cur - prev) / prev : null)

export interface CohortRow {
  key: string
  label: string
  size: number
  /** Share of the cohort that bought again in month 1, 2, … after the first purchase. */
  retention: (number | null)[]
}

/** Monthly purchase cohorts: customers grouped by first-purchase month, with repeat rates after it. */
export function cohorts(
  orders: readonly Order[],
  months: number,
  horizon: number,
  now = nowMs(),
): CohortRow[] {
  const sold = orders.filter(isSold)
  const first = new Map<string, number>()
  const buyMonths = new Map<string, Set<string>>()
  for (const o of sold) {
    const at = toMs(o.createdAt)
    first.set(o.customerId, Math.min(first.get(o.customerId) ?? Infinity, at))
    const set = buyMonths.get(o.customerId) ?? new Set<string>()
    set.add(monthKey(at))
    buyMonths.set(o.customerId, set)
  }
  const current = startOfMonth(now)
  const rows: CohortRow[] = []
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = addMonths(current, -i)
    const key = monthKey(monthStart)
    const members = [...first].filter(([, at]) => monthKey(at) === key).map(([id]) => id)
    const retention = Array.from({ length: horizon }, (_, k) => {
      const target = addMonths(monthStart, k + 1)
      if (target > current) return null
      const tKey = monthKey(target)
      if (!members.length) return 0
      return members.filter((id) => buyMonths.get(id)?.has(tKey)).length / members.length
    })
    rows.push({ key, label: fmtMonthShort(monthStart), size: members.length, retention })
  }
  return rows
}

export interface MonthPoint {
  key: string
  label: string
  revenue: number
  orders: number
}

export function monthlyRevenue(orders: readonly Order[], months: number, now = nowMs()): MonthPoint[] {
  const current = startOfMonth(now)
  const points = Array.from({ length: months }, (_, i) => {
    const ms = addMonths(current, i - months + 1)
    return { key: monthKey(ms), label: fmtMonthShort(ms), revenue: 0, orders: 0 }
  })
  const index = new Map(points.map((p, i) => [p.key, i]))
  for (const o of orders) {
    if (!isSold(o)) continue
    const i = index.get(monthKey(toMs(o.createdAt)))
    if (i === undefined) continue
    points[i]!.revenue += o.total - o.refundedAmount
    points[i]!.orders += 1
  }
  return points
}

export function channelMix(orders: readonly Order[]): Record<Channel, number> {
  const mix: Record<Channel, number> = { web: 0, personal_store: 0, whatsapp: 0, marketplace: 0, pos: 0 }
  for (const o of orders) if (isSold(o)) mix[o.channel] += o.total - o.refundedAmount
  return mix
}

export interface SellerStats {
  sellerId: string
  pageViews: number
  visitors: number
  leads: number
  orders: number
  revenue: number
  conversion: number
  aov: number
  repeatCustomers: number
  commission: number
}

/** Personal-store performance per seller over the last `days` days. */
export function sellerPerformance(
  sellers: readonly Seller[],
  orders: readonly Order[],
  traffic: readonly TrafficDay[],
  leads: readonly Lead[],
  days: number,
  now = nowMs(),
): Map<string, SellerStats> {
  const from = startOfDay(now) + DAY - days * DAY
  const map = new Map<string, SellerStats>()
  for (const s of sellers) {
    map.set(s.id, {
      sellerId: s.id,
      pageViews: 0,
      visitors: 0,
      leads: 0,
      orders: 0,
      revenue: 0,
      conversion: 0,
      aov: 0,
      repeatCustomers: 0,
      commission: 0,
    })
  }
  for (const t of traffic) {
    if (!t.sellerId || toMs(`${t.day}T12:00:00+07:00`) < from) continue
    const row = map.get(t.sellerId)
    if (!row) continue
    row.pageViews += t.pageViews
    row.visitors += t.visitors
  }
  for (const l of leads) {
    if (!l.sellerId || toMs(l.createdAt) < from) continue
    const row = map.get(l.sellerId)
    if (row) row.leads += 1
  }
  const buyers = new Map<string, Map<string, number>>()
  for (const o of orders) {
    if (!o.sellerId || !isSold(o) || toMs(o.createdAt) < from) continue
    const row = map.get(o.sellerId)
    if (!row) continue
    row.orders += 1
    row.revenue += o.total - o.refundedAmount
    const counts = buyers.get(o.sellerId) ?? new Map<string, number>()
    counts.set(o.customerId, (counts.get(o.customerId) ?? 0) + 1)
    buyers.set(o.sellerId, counts)
  }
  for (const s of sellers) {
    const row = map.get(s.id)!
    row.conversion = row.visitors ? row.orders / row.visitors : 0
    row.aov = row.orders ? row.revenue / row.orders : 0
    row.repeatCustomers = [...(buyers.get(s.id)?.values() ?? [])].filter((n) => n > 1).length
    row.commission = row.revenue * s.commissionRate
  }
  return map
}

export interface ProductStats {
  productId: string
  units: number
  revenue: number
  orders: number
  views: number
  conversion: number
}

/** Units, revenue and view-to-order conversion per product for the last `days` days. */
export function productPerformance(
  products: readonly Product[],
  orders: readonly Order[],
  days: number,
  now = nowMs(),
): Map<string, ProductStats> {
  const from = startOfDay(now) + DAY - days * DAY
  const map = new Map<string, ProductStats>(
    products.map((p) => [
      p.id,
      {
        productId: p.id,
        units: 0,
        revenue: 0,
        orders: 0,
        views: Math.round((p.views30d * days) / 30),
        conversion: 0,
      },
    ]),
  )
  for (const o of orders) {
    if (!isSold(o) || toMs(o.createdAt) < from) continue
    const seen = new Set<string>()
    for (const l of o.lines) {
      const row = map.get(l.productId)
      if (!row) continue
      row.units += l.qty
      row.revenue += l.qty * l.price
      if (!seen.has(l.productId)) row.orders += 1
      seen.add(l.productId)
    }
  }
  for (const row of map.values()) row.conversion = row.views ? row.orders / row.views : 0
  return map
}

/** Share of checkouts that did not end in an order, from storefront traffic. */
export function cartAbandonment(traffic: readonly TrafficDay[], days: number, now = nowMs()): number {
  const from = startOfDay(now) + DAY - days * DAY
  let carts = 0
  let checkouts = 0
  for (const t of traffic) {
    if (t.sellerId !== null || toMs(`${t.day}T12:00:00+07:00`) < from) continue
    carts += t.carts
    checkouts += t.checkouts
  }
  return carts ? 1 - checkouts / carts : 0
}

/** Repeat purchase rate: share of buyers with two or more sold orders. */
export function repeatRate(orders: readonly Order[]): number {
  const counts = new Map<string, number>()
  for (const o of orders) if (isSold(o)) counts.set(o.customerId, (counts.get(o.customerId) ?? 0) + 1)
  if (!counts.size) return 0
  return [...counts.values()].filter((n) => n > 1).length / counts.size
}
