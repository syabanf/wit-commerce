import { DAY, dayKey, fmtDateShort, startOfDay } from '@rc/fixtures'
import type { Seller, SellerKind, Tenant, TrafficDay } from '@rc/types'
import { storeAddress } from '../../lib/storefront'

/** Code prefix per seller kind, as the seeded sellers use it: S-001, A-011, R-021. */
export const SELLER_CODE_PREFIX: Record<SellerKind, string> = {
  sales: 'S-',
  agent: 'A-',
  reseller: 'R-',
  affiliate: 'A-',
}

/** "lari.commerce.reddie.id/fahmi" */
export const storeUrl = (tenant: Pick<Tenant, 'subdomain'>, seller: Pick<Seller, 'slug'>) =>
  `${storeAddress(tenant)}/${seller.slug}`

/** A slug no other seller of the tenant uses: "fahmi-rahman", then "fahmi-rahman-2". */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || 'seller'
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root}-${n}`)) n += 1
  return `${root}-${n}`
}

export interface DayCount {
  day: string
  label: string
  value: number
}

/** Visitors per day for one seller's store over the last `days` days, today included. */
export function dailyVisitors(
  traffic: readonly TrafficDay[],
  sellerId: string,
  days: number,
  now: number,
): DayCount[] {
  const start = startOfDay(now) - (days - 1) * DAY
  const byDay = new Map<string, number>()
  for (const t of traffic) if (t.sellerId === sellerId) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.visitors)
  return Array.from({ length: days }, (_, i) => {
    const ms = start + i * DAY
    const day = dayKey(ms)
    return { day, label: fmtDateShort(ms), value: byDay.get(day) ?? 0 }
  })
}
