import type { Campaign, Integration, IsoDate, Lead, Order, Product, StockLevel, Ticket } from '@rc/types'
import { OPEN_LEAD_STAGES } from '@rc/types'
import { nowMs } from './clock'
import { DAY, HOUR, toIso, toMs } from './dates'
import { stockByProduct, stockState } from './derive'
import { fmtAgo } from './format'
import { PAYMENT_WINDOW_HOURS } from './store'

export type NotificationKind =
  | 'low_stock'
  | 'payment_expiring'
  | 'ship_late'
  | 'ticket_sla'
  | 'integration'
  | 'lead_stale'
  | 'campaign_ending'

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  low_stock: 'Stock',
  payment_expiring: 'Payment',
  ship_late: 'Fulfilment',
  ticket_sla: 'Support',
  integration: 'Integration',
  lead_stale: 'Leads',
  campaign_ending: 'Campaign',
}

export interface NotificationItem {
  id: string
  kind: NotificationKind
  tone: 'danger' | 'warning' | 'info'
  title: string
  body: string
  at: IsoDate
  target: { kind: 'product' | 'order' | 'ticket' | 'integration' | 'lead' | 'campaign'; id: string }
}

export interface NotificationInput {
  products: readonly Product[]
  stock: readonly StockLevel[]
  orders: readonly Order[]
  tickets: readonly Ticket[]
  integrations: readonly Integration[]
  leads: readonly Lead[]
  campaigns: readonly Campaign[]
}

/** Alerts derived from the current state, newest first. They clear themselves when the condition ends. */
export function deriveNotifications(input: NotificationInput, now = nowMs()): NotificationItem[] {
  const items: NotificationItem[] = []
  const stock = stockByProduct(input.stock)
  for (const p of input.products) {
    if (p.status !== 'active') continue
    const summary = stock.get(p.id)
    if (!summary) continue
    const state = stockState(p, summary)
    if (state !== 'low' && state !== 'out') continue
    items.push({
      id: `stock-${p.id}-${state}`,
      kind: 'low_stock',
      tone: state === 'out' ? 'danger' : 'warning',
      title: state === 'out' ? `${p.name} is out of stock` : `${p.name} is running low`,
      body: `${summary.available} available against a safety stock of ${summary.safety}.`,
      at: toIso(now - HOUR),
      target: { kind: 'product', id: p.id },
    })
  }
  for (const o of input.orders) {
    const age = now - toMs(o.createdAt)
    if (
      (o.status === 'new' || o.status === 'confirmed') &&
      o.paymentStatus === 'pending' &&
      o.paymentMethod !== 'cod' &&
      age > 18 * HOUR
    ) {
      items.push({
        id: `pay-${o.id}`,
        kind: 'payment_expiring',
        tone: 'warning',
        title: `${o.code} expires soon`,
        body: `No payment yet. The order cancels ${fmtAgo(toMs(o.createdAt) + PAYMENT_WINDOW_HOURS * HOUR, now)}.`,
        at: o.createdAt,
        target: { kind: 'order', id: o.id },
      })
    }
    if ((o.status === 'paid' || o.status === 'processing') && age > 2 * DAY) {
      items.push({
        id: `ship-${o.id}`,
        kind: 'ship_late',
        tone: 'danger',
        title: `${o.code} has not shipped`,
        body: `Paid ${fmtAgo(o.createdAt, now)} and still in the warehouse.`,
        at: o.createdAt,
        target: { kind: 'order', id: o.id },
      })
    }
  }
  for (const t of input.tickets) {
    if (t.status === 'resolved' || toMs(t.slaDueAt) > now) continue
    items.push({
      id: `sla-${t.id}`,
      kind: 'ticket_sla',
      tone: 'danger',
      title: `${t.code} is past its SLA`,
      body: t.subject,
      at: t.slaDueAt,
      target: { kind: 'ticket', id: t.id },
    })
  }
  for (const i of input.integrations) {
    if (!i.enabled || (i.health !== 'failing' && i.health !== 'degraded')) continue
    items.push({
      id: `int-${i.id}-${i.health}`,
      kind: 'integration',
      tone: i.health === 'failing' ? 'danger' : 'warning',
      title: `${i.provider} is ${i.health}`,
      body: i.note || `${i.errors24h} errors in the last 24 hours.`,
      at: i.lastSyncAt ?? toIso(now),
      target: { kind: 'integration', id: i.id },
    })
  }
  for (const l of input.leads) {
    if (!OPEN_LEAD_STAGES.includes(l.stage) || now - toMs(l.updatedAt) < 7 * DAY) continue
    items.push({
      id: `lead-${l.id}`,
      kind: 'lead_stale',
      tone: 'info',
      title: `${l.name} has waited a week`,
      body: `${l.company || 'Lead'} · last touched ${fmtAgo(l.updatedAt, now)}.`,
      at: l.updatedAt,
      target: { kind: 'lead', id: l.id },
    })
  }
  for (const c of input.campaigns) {
    const left = toMs(c.endAt) - now
    if (c.status !== 'running' || left < 0 || left > 2 * DAY) continue
    items.push({
      id: `camp-${c.id}`,
      kind: 'campaign_ending',
      tone: 'info',
      title: `${c.name} ends ${fmtAgo(c.endAt, now)}`,
      body: 'Extend it or plan the follow-up now.',
      at: c.endAt,
      target: { kind: 'campaign', id: c.id },
    })
  }
  return items.sort((a, b) => toMs(b.at) - toMs(a.at))
}
