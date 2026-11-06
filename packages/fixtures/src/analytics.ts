import type {
  Channel,
  CustomerMetricsRow,
  Lead,
  Product,
  ProductDay,
  SalesDay,
  Seller,
  SellerBuyer,
  TrafficDay,
} from '@rc/types'
import { nowMs } from './clock'
import { DAY, addMonths, dayKey, monthKey, startOfDay, startOfMonth, toMs } from './dates'
import { fmtDateShort, fmtMonthShort } from './format'

export interface DayPoint {
  day: string
  label: string
  revenue: number
  orders: number
}

/** Sold revenue and order count per day for the last `days` days, today included. */
export function dailyRevenue(sales: readonly SalesDay[], days: number, now = nowMs()): DayPoint[] {
  const start = startOfDay(now) - (days - 1) * DAY
  const points: DayPoint[] = Array.from({ length: days }, (_, i) => {
    const ms = start + i * DAY
    return { day: dayKey(ms), label: fmtDateShort(ms), revenue: 0, orders: 0 }
  })
  const index = new Map(points.map((p, i) => [p.day, i]))
  for (const s of sales) {
    const i = index.get(s.day)
    if (i === undefined) continue
    points[i]!.revenue += s.revenue
    points[i]!.orders += s.orders
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

/** The WIB days from `from` up to, not including, `to`, as day keys compare. */
const dayIn = (day: string, from: number, to: number) => day >= dayKey(from) && day < dayKey(to)

/** Revenue, orders, AOV and conversion for the last `days` days, with the window before it. */
export function periodKpis(
  sales: readonly SalesDay[],
  customers: readonly CustomerMetricsRow[],
  traffic: readonly TrafficDay[],
  days: number,
  now = nowMs(),
): PeriodKpis {
  const end = startOfDay(now) + DAY
  const from = end - days * DAY
  const prevFrom = from - days * DAY
  const sum = (a: number, b: number) => {
    let revenue = 0
    let count = 0
    for (const s of sales) {
      if (!dayIn(s.day, a, b)) continue
      revenue += s.revenue
      count += s.orders
    }
    return { revenue, count }
  }
  const visitorsIn = (a: number, b: number) =>
    traffic.reduce((n, t) => (t.sellerId === null && dayIn(t.day, a, b) ? n + t.visitors : n), 0)
  const cur = sum(from, end)
  const prev = sum(prevFrom, from)
  const visitors = visitorsIn(from, end)
  const prevVisitors = visitorsIn(prevFrom, from)
  // A customer bought in the window when their last sold order falls in it; no order is later than today.
  let buyers = 0
  let newCustomers = 0
  for (const c of customers) {
    if (!c.orders || !c.lastAt || toMs(c.lastAt) < from) continue
    buyers += 1
    if (c.firstAt && toMs(c.firstAt) >= from) newCustomers += 1
  }
  return {
    revenue: cur.revenue,
    orders: cur.count,
    aov: cur.count ? cur.revenue / cur.count : 0,
    visitors,
    conversion: visitors ? cur.count / visitors : 0,
    newCustomers,
    returningCustomers: buyers - newCustomers,
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
  customers: readonly CustomerMetricsRow[],
  months: number,
  horizon: number,
  now = nowMs(),
): CohortRow[] {
  const buyers = customers.filter((c) => c.orders > 0 && c.firstAt)
  const current = startOfMonth(now)
  const rows: CohortRow[] = []
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = addMonths(current, -i)
    const key = monthKey(monthStart)
    const members = buyers.filter((c) => monthKey(toMs(c.firstAt!)) === key)
    const retention = Array.from({ length: horizon }, (_, k) => {
      const target = addMonths(monthStart, k + 1)
      if (target > current) return null
      const tKey = monthKey(target)
      if (!members.length) return 0
      return members.filter((c) => c.buyMonths.includes(tKey)).length / members.length
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

export function monthlyRevenue(sales: readonly SalesDay[], months: number, now = nowMs()): MonthPoint[] {
  const current = startOfMonth(now)
  const points = Array.from({ length: months }, (_, i) => {
    const ms = addMonths(current, i - months + 1)
    return { key: monthKey(ms), label: fmtMonthShort(ms), revenue: 0, orders: 0 }
  })
  const index = new Map(points.map((p, i) => [p.key, i]))
  for (const s of sales) {
    const i = index.get(s.day.slice(0, 7))
    if (i === undefined) continue
    points[i]!.revenue += s.revenue
    points[i]!.orders += s.orders
  }
  return points
}

/** Net revenue per channel, from the WIB day of `from` on, or over all time. */
export function channelMix(sales: readonly SalesDay[], from?: number): Record<Channel, number> {
  const mix: Record<Channel, number> = { web: 0, personal_store: 0, whatsapp: 0, marketplace: 0, pos: 0, agent: 0 }
  const first = from === undefined ? '' : dayKey(from)
  for (const s of sales) if (s.day >= first) mix[s.channel] += s.revenue
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
  sales: readonly SalesDay[],
  buyers: readonly SellerBuyer[],
  traffic: readonly TrafficDay[],
  leads: readonly Lead[],
  days: number,
  now = nowMs(),
): Map<string, SellerStats> {
  const from = startOfDay(now) + DAY - days * DAY
  const first = dayKey(from)
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
    if (!t.sellerId || t.day < first) continue
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
  for (const s of sales) {
    if (!s.sellerId || s.day < first) continue
    const row = map.get(s.sellerId)
    if (!row) continue
    row.orders += s.orders
    row.revenue += s.revenue
  }
  const counts = new Map<string, Map<string, number>>()
  for (const b of buyers) {
    if (b.day < first) continue
    const perCustomer = counts.get(b.sellerId) ?? new Map<string, number>()
    perCustomer.set(b.customerId, (perCustomer.get(b.customerId) ?? 0) + b.orders)
    counts.set(b.sellerId, perCustomer)
  }
  for (const s of sellers) {
    const row = map.get(s.id)!
    row.conversion = row.visitors ? row.orders / row.visitors : 0
    row.aov = row.orders ? row.revenue / row.orders : 0
    row.repeatCustomers = [...(counts.get(s.id)?.values() ?? [])].filter((n) => n > 1).length
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
  productDays: readonly ProductDay[],
  days: number,
  now = nowMs(),
): Map<string, ProductStats> {
  const first = dayKey(startOfDay(now) + DAY - days * DAY)
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
  for (const d of productDays) {
    if (d.day < first) continue
    const row = map.get(d.productId)
    if (!row) continue
    row.units += d.units
    row.revenue += d.revenue
    row.orders += d.orders
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
export function repeatRate(customers: readonly CustomerMetricsRow[]): number {
  const buyers = customers.filter((c) => c.orders > 0)
  if (!buyers.length) return 0
  return buyers.filter((c) => c.orders > 1).length / buyers.length
}
