import type { Customer, CustomerMetricsRow, Product, Segment } from '@rc/types'
import { nowMs } from './clock'
import { DAY, dayKey, monthKey, toMs } from './dates'
import { inSegment, segmentContextFromRows, segmentMembers } from './derive'
import { nextCode } from './ids'

/** First buyers of one WIB month: how many, and how many of them bought in each month. */
export interface Cohort {
  size: number
  bought: Record<string, number>
}

/**
 * A brand's customer metrics summed into what the analytics read. The API sums them in SQL
 * (readmodel.Buyers), so the console needs no metrics row per customer; the demo sums its rows here.
 */
export interface BuyerFigures {
  /** Customers with a sold order, and those with two or more. */
  buyers: number
  repeatBuyers: number
  /** What the buyers spent, net of refunds. */
  spend: number
  /** Buyers by the WIB day of their first and of their last sold order. */
  firstDays: Record<string, number>
  lastDays: Record<string, number>
  /** Buyers grouped by the WIB month of their first order. */
  cohorts: Record<string, Cohort>
}

export const NO_BUYERS: BuyerFigures = {
  buyers: 0,
  repeatBuyers: 0,
  spend: 0,
  firstDays: {},
  lastDays: {},
  cohorts: {},
}

const bump = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1
}

export function buyerFigures(rows: readonly CustomerMetricsRow[]): BuyerFigures {
  const out: BuyerFigures = { buyers: 0, repeatBuyers: 0, spend: 0, firstDays: {}, lastDays: {}, cohorts: {} }
  for (const r of rows) {
    if (!r.orders || !r.firstAt || !r.lastAt) continue
    out.buyers += 1
    if (r.orders > 1) out.repeatBuyers += 1
    out.spend += r.spend
    const first = toMs(r.firstAt)
    bump(out.firstDays, dayKey(first))
    bump(out.lastDays, dayKey(toMs(r.lastAt)))
    const month = monthKey(first)
    const cohort = (out.cohorts[month] ??= { size: 0, bought: {} })
    cohort.size += 1
    for (const m of r.buyMonths) bump(cohort.bought, m)
  }
  return out
}

/** Buyers whose first, or last, sold order falls on `fromDay` or later (WIB day keys). */
export function buyersSince(days: Record<string, number>, fromDay: string): number {
  let n = 0
  for (const [day, count] of Object.entries(days)) if (day >= fromDay) n += count
  return n
}

/**
 * Every figure the console sums over all of a brand's customers. GET /views/customer-summary answers
 * the same shape; the demo, which holds every customer, makes it here.
 */
export interface CustomerSummary {
  total: number
  /** Joined in the last 30 days. */
  newIn30: number
  byTier: Partial<Record<Customer['tier'], number>>
  byStage: Partial<Record<Customer['stage'], number>>
  bySeller: Record<string, number>
  points: number
  /** The customers with the most points, most first. */
  top: Customer[]
  /** Customers holding at least each reward's points, in the order asked. */
  redeemable: number[]
  /** Customers with a checkout left in the last seven days and no purchase since. */
  abandoned: number
  /** Members per segment id. */
  segments: Record<string, number>
  /** Customers in at least one segment the brand made itself. */
  inCustomSegments: number
  buyers: BuyerFigures
  /** Cities most common first; tags and colours in use, for the customer form. */
  cities: string[]
  tags: string[]
  colors: string[]
  /** The code the next new customer takes. */
  nextCode: string
}

export const SUMMARY_TOP = 8

export function customerSummary(input: {
  customers: readonly Customer[]
  metrics: readonly CustomerMetricsRow[]
  segments: readonly Pick<Segment, 'id' | 'rules' | 'match' | 'builtIn'>[]
  products: readonly Pick<Product, 'id' | 'categoryId'>[]
  tenantCode: string
  rewards: readonly number[]
  now?: number
}): CustomerSummary {
  const { customers, metrics, segments, products, tenantCode, rewards, now = nowMs() } = input
  const since = now - 30 * DAY
  const byTier: CustomerSummary['byTier'] = {}
  const byStage: CustomerSummary['byStage'] = {}
  const bySeller: Record<string, number> = {}
  const cities = new Map<string, number>()
  let points = 0
  let newIn30 = 0
  for (const c of customers) {
    byTier[c.tier] = (byTier[c.tier] ?? 0) + 1
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1
    if (c.sellerId) bump(bySeller, c.sellerId)
    if (c.city) cities.set(c.city, (cities.get(c.city) ?? 0) + 1)
    points += c.points
    if (toMs(c.createdAt) >= since) newIn30 += 1
  }
  const ctx = segmentContextFromRows(metrics, products, now)
  const custom = segments.filter((s) => !s.builtIn)
  return {
    total: customers.length,
    newIn30,
    byTier,
    byStage,
    bySeller,
    points,
    top: [...customers].sort((a, b) => b.points - a.points).slice(0, SUMMARY_TOP),
    redeemable: rewards.map((min) => customers.filter((c) => c.points >= min).length),
    abandoned: ctx.abandoned.size,
    segments: Object.fromEntries(segments.map((s) => [s.id, segmentMembers(s, customers, ctx).length])),
    inCustomSegments: customers.filter((c) => custom.some((s) => inSegment(s, c, ctx))).length,
    buyers: buyerFigures(metrics),
    cities: [...cities].sort((a, b) => b[1] - a[1]).map(([city]) => city),
    tags: [...new Set(customers.flatMap((c) => c.tags))].sort(),
    colors: [...new Set(customers.map((c) => c.color))],
    nextCode: nextCode(
      customers.map((c) => c.code),
      `${tenantCode}-C`,
      5,
    ),
  }
}

/** Avatar colour for a new customer, taken in turn from the colours already in use. */
export const nextCustomerColor = (summary: Pick<CustomerSummary, 'colors' | 'total'>, fallback: string) =>
  summary.colors[summary.total % Math.max(1, summary.colors.length)] ?? fallback
