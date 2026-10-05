import { stockState } from '@rc/fixtures'
import { useMemo } from 'react'
import { useScoped } from '../state/scoped'
import type { BadgeKey } from './nav'

/** Counts behind the navigation badges. */
export function useNavCounts(): Record<BadgeKey, number> {
  const { orders, leads, tickets, products, stockByProduct } = useScoped()
  return useMemo(
    () => ({
      toFulfil: orders.filter(
        (o) => o.status === 'paid' || o.status === 'processing' || o.status === 'packed',
      ).length,
      newLeads: leads.filter((l) => l.stage === 'new').length,
      openTickets: tickets.filter((t) => t.status === 'open').length,
      lowStock: products.filter((p) => {
        if (p.status !== 'active') return false
        const s = stockByProduct.get(p.id)
        return !!s && (stockState(p, s) === 'low' || stockState(p, s) === 'out')
      }).length,
    }),
    [orders, leads, tickets, products, stockByProduct],
  )
}
