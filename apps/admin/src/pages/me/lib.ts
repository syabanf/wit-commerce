import { toMs } from '@rc/fixtures'
import { OPEN_LEAD_STAGES, type Order, type OrderEvent, type OrderStatus } from '@rc/types'
import type { Scoped } from '../../state/scoped'

/** Orders still moving: a seller keeps an eye on these until they reach the buyer. */
const UNDER_WAY: OrderStatus[] = ['new', 'confirmed', 'paid', 'processing', 'packed', 'shipped']

const RECENT_SHOWN = 6

/** What waits for the signed-in person at the current brand, from the loaded records. */
export function myWork(s: Scoped) {
  const tickets = s.tickets
    .filter((ticket) => ticket.assigneeId === s.user.id)
    // Open first, then the nearest deadline.
    .sort(
      (a, b) =>
        Number(a.status === 'resolved') - Number(b.status === 'resolved') ||
        toMs(a.slaDueAt) - toMs(b.slaDueAt),
    )
  const sellerIds = new Set(s.sellers.filter((seller) => seller.userId === s.user.id).map((x) => x.id))
  const mine = (sellerId: string | null) => !!sellerId && sellerIds.has(sellerId)
  const recent: { order: Order; event: OrderEvent }[] = s.orders
    .flatMap((order) => order.events.filter((e) => e.by === s.user.id).map((event) => ({ order, event })))
    .sort((a, b) => toMs(b.event.at) - toMs(a.event.at))
    .slice(0, RECENT_SHOWN)
  return {
    tickets,
    openTickets: tickets.filter((ticket) => ticket.status !== 'resolved'),
    /** True when the person has a seller profile at this brand. */
    seller: sellerIds.size > 0,
    leads: s.leads
      .filter((lead) => mine(lead.sellerId) && OPEN_LEAD_STAGES.includes(lead.stage))
      .sort((a, b) => toMs(a.updatedAt) - toMs(b.updatedAt)),
    orders: s.orders.filter((order) => mine(order.sellerId) && UNDER_WAY.includes(order.status)),
    recent,
  }
}
