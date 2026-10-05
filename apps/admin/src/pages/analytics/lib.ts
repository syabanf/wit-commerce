import {
  type CustomerMetrics,
  type ProductStats,
  DAY,
  change,
  dayKey,
  fmtDateShort,
  fmtPercent,
  isSold,
  startOfDay,
  toMs,
} from '@rc/fixtures'
import type { Campaign, Order, Product, TrafficDay } from '@rc/types'
import type { Tone } from '@rc/ui'

export const WINDOWS = [7, 30, 90] as const
export type WindowDays = (typeof WINDOWS)[number]

export type AnalyticsTab = 'commerce' | 'customer' | 'product' | 'campaign' | 'sales'
export const TABS: { value: AnalyticsTab; label: string }[] = [
  { value: 'commerce', label: 'Commerce' },
  { value: 'customer', label: 'Customer' },
  { value: 'product', label: 'Product' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'sales', label: 'Sales' },
]
export const isTab = (value: string | null): value is AnalyticsTab => TABS.some((t) => t.value === value)

/** First millisecond of a window of `days` days that ends today, as the fixtures count it. */
export const windowStart = (days: number, now: number) => startOfDay(now) + DAY - days * DAY

/** "+12% vs previous 30 days", toned by direction. */
export function changeHint(cur: number, prev: number, days: number): { hint: string; tone: Tone } {
  const ratio = change(cur, prev)
  if (ratio === null) return { hint: `Nothing in the previous ${days} days`, tone: 'default' }
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : ''
  const tone: Tone = ratio > 0 ? 'success' : ratio < 0 ? 'danger' : 'default'
  return { hint: `${sign}${fmtPercent(Math.abs(ratio))} vs previous ${days} days`, tone }
}

/** Storefront visitors per day (main store only); a day without a record stays a gap. */
export function visitorsPerDay(traffic: readonly TrafficDay[], days: number, now: number) {
  const byDay = new Map<string, number>()
  for (const t of traffic) if (t.sellerId === null) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.visitors)
  const start = windowStart(days, now)
  return Array.from({ length: days }, (_, i) => {
    const ms = start + i * DAY
    return { label: fmtDateShort(ms), value: byDay.get(dayKey(ms)) ?? null }
  })
}

export const soldInWindow = (orders: readonly Order[], from: number) =>
  orders.filter((o) => isSold(o) && toMs(o.createdAt) >= from)

/** Line revenue per category in the window. */
export function revenueByCategory(
  orders: readonly Order[],
  categoryOf: (productId: string) => string | undefined,
) {
  const map = new Map<string, number>()
  for (const o of orders) {
    for (const l of o.lines) {
      const cat = categoryOf(l.productId)
      if (cat) map.set(cat, (map.get(cat) ?? 0) + l.qty * l.price)
    }
  }
  return [...map].sort((a, b) => b[1] - a[1])
}

/** Average net spend per customer who has bought at least once. */
export function lifetimeValue(metrics: Map<string, CustomerMetrics>) {
  let spend = 0
  let buyers = 0
  for (const m of metrics.values()) {
    if (!m.orders) continue
    spend += m.spend
    buyers += 1
  }
  return { value: buyers ? spend / buyers : 0, buyers }
}

// Heat steps for retention cells, light to dark. White text only where ink text loses contrast.
const HEAT: { min: number; className: string }[] = [
  { min: 0.4, className: 'bg-ink/60 text-white' },
  { min: 0.3, className: 'bg-ink/50' },
  { min: 0.2, className: 'bg-ink/40' },
  { min: 0.1, className: 'bg-ink/30' },
  { min: 0.05, className: 'bg-ink/20' },
  { min: 0, className: 'bg-ink/10' },
]
export const HEAT_LEGEND = [...HEAT].reverse()
export const heatClass = (value: number) => HEAT.find((h) => value >= h.min)!.className

/** Products with many views and a conversion under half the store average. */
export function viewsWithoutSales(products: readonly Product[], stats: Map<string, ProductStats>) {
  const rows = products.flatMap((p) => {
    const r = stats.get(p.id)
    return p.status === 'active' && r && r.views > 0 ? [r] : []
  })
  const views = rows.reduce((n, r) => n + r.views, 0)
  const orders = rows.reduce((n, r) => n + r.orders, 0)
  const average = views ? orders / views : 0
  if (!average) return { average, rows: [] }
  const sorted = rows.map((r) => r.views).sort((a, b) => a - b)
  const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0
  return {
    average,
    rows: rows
      .filter((r) => r.views >= p75 && r.conversion < average / 2)
      .sort((a, b) => b.views - a.views)
      .slice(0, 4),
  }
}

/** Campaigns that ran at any point in the window. */
export const campaignsInWindow = (campaigns: readonly Campaign[], from: number, now: number) =>
  campaigns.filter((c) => c.status !== 'draft' && toMs(c.startAt) <= now && toMs(c.endAt) >= from)

export const roi = (c: Pick<Campaign, 'revenue' | 'budget'>) =>
  c.budget ? (c.revenue - c.budget) / c.budget : null

export const fmtSignedPercent = (ratio: number) =>
  `${ratio > 0 ? '+' : ratio < 0 ? '−' : ''}${fmtPercent(Math.abs(ratio))}`
