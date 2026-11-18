import { DAY, fmtDate, fmtWeekday, isSameDay, startOfDay, toMs } from '@rc/fixtures'
import type { CustomerEvent, CustomerEventKind } from '@rc/types'
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
  ShieldCheck,
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
  privacy: ShieldCheck,
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
