import { DAY, fmtDate, fmtWeekday, isSameDay, nextCode, startOfDay, toMs } from '@rc/fixtures'
import type { Customer, CustomerEvent, CustomerEventKind, Tenant } from '@rc/types'
import type { LucideIcon } from 'lucide-react'
import {
  Award,
  CircleSlash,
  Coins,
  CreditCard,
  Eye,
  Heart,
  LayoutGrid,
  LifeBuoy,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  UserPlus,
} from 'lucide-react'

export const CUSTOMER_EVENT_ICON: Record<CustomerEventKind, LucideIcon> = {
  registered: UserPlus,
  product_viewed: Eye,
  search: Search,
  collection_viewed: LayoutGrid,
  wishlist: Heart,
  add_to_cart: ShoppingCart,
  checkout_started: CreditCard,
  checkout_abandoned: CircleSlash,
  purchase: ShoppingBag,
  campaign_opened: MailOpen,
  campaign_click: MousePointerClick,
  review: Star,
  support: LifeBuoy,
  tier_upgraded: Award,
  points_earned: Coins,
  note: MessageSquare,
}

/** Next customer code of a tenant: LARI-C10001 → LARI-C10002. */
export function nextCustomerCode(customers: readonly Customer[], tenant: Pick<Tenant, 'code'>): string {
  return nextCode(
    customers.map((c) => c.code),
    `${tenant.code}-C`,
    5,
  )
}

/** Avatar colour for a new customer, taken in turn from the colours already in use. */
export function nextCustomerColor(customers: readonly Customer[], fallback: string): string {
  const palette = [...new Set(customers.map((c) => c.color))]
  return palette[customers.length % Math.max(1, palette.length)] ?? fallback
}

/** Distinct customer cities, most common first. */
export function customerCities(customers: readonly Customer[]): string[] {
  const counts = new Map<string, number>()
  for (const c of customers) if (c.city) counts.set(c.city, (counts.get(c.city) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([city]) => city)
}

export interface DayGroup {
  key: string
  label: string
  events: CustomerEvent[]
}

/** Events newest first, grouped under "Today", "Yesterday" or the date. */
export function groupByDay(events: readonly CustomerEvent[], now: number): DayGroup[] {
  const groups: DayGroup[] = []
  for (const e of events) {
    const at = toMs(e.at)
    const key = String(startOfDay(at))
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      const label = isSameDay(at, now)
        ? 'Today'
        : isSameDay(at, now - DAY)
          ? 'Yesterday'
          : `${fmtWeekday(at)} ${fmtDate(at)}`
      group = { key, label, events: [] }
      groups.push(group)
    }
    group.events.push(e)
  }
  return groups
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
