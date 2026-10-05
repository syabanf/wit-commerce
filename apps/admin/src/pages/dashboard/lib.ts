import { HOUR, nowMs, stockState, toMs } from '@rc/fixtures'
import type { Order } from '@rc/types'
import type { Scoped } from '../../state/scoped'

export const toFulfil = (o: Order) =>
  o.status === 'paid' || o.status === 'processing' || o.status === 'packed'
export const isLate = (o: Order, now = nowMs()) => toFulfil(o) && now - toMs(o.createdAt) > 48 * HOUR

export interface Queue {
  key: string
  label: string
  count: number
  to: string
  urgent: boolean
}

/** Work queues for the attention card, biggest first, empty ones left out. */
export function attentionQueues(s: Scoped, now: number): Queue[] {
  const lowStock = s.products.filter((p) => {
    const sum = s.stockByProduct.get(p.id)
    if (p.status !== 'active' || !sum) return false
    const st = stockState(p, sum)
    return st === 'low' || st === 'out'
  }).length
  const queues: Queue[] = [
    {
      key: 'late',
      label: 'Shipping late',
      count: s.orders.filter((o) => isLate(o, now)).length,
      to: '/commerce/orders?view=to-fulfil',
      urgent: true,
    },
    {
      key: 'sla',
      label: 'Tickets past SLA',
      count: s.tickets.filter((t) => t.status !== 'resolved' && toMs(t.slaDueAt) < now).length,
      to: '/customers/support',
      urgent: true,
    },
    {
      key: 'failing',
      label: 'Integrations failing',
      count: s.integrations.filter((i) => i.enabled && i.health === 'failing').length,
      to: '/integrations',
      urgent: true,
    },
    {
      key: 'ship',
      label: 'To pack and ship',
      count: s.orders.filter(toFulfil).length,
      to: '/commerce/orders?view=to-fulfil',
      urgent: false,
    },
    {
      key: 'unpaid',
      label: 'Awaiting payment',
      count: s.orders.filter(
        (o) => (o.status === 'new' || o.status === 'confirmed') && o.paymentStatus === 'pending',
      ).length,
      to: '/commerce/orders?view=unpaid',
      urgent: false,
    },
    {
      key: 'stock',
      label: 'Low or out of stock',
      count: lowStock,
      to: '/commerce/inventory?view=low',
      urgent: false,
    },
    {
      key: 'leads',
      label: 'New leads',
      count: s.leads.filter((l) => l.stage === 'new').length,
      to: '/customers/leads',
      urgent: false,
    },
    {
      key: 'carts',
      label: 'Abandoned carts',
      count: s.crm.abandoned.size,
      to: '/customers/segments',
      urgent: false,
    },
  ]
  return queues
    .filter((q) => q.count > 0)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.count - a.count)
}
