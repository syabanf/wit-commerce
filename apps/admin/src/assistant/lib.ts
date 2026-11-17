import type { AssistantAction } from '@rc/api'
import { type AppAction, type Permission, fmtDateShort, fmtIdr, fromInput, newId, toIso } from '@rc/fixtures'
import {
  CAMPAIGN_STATUS_LABEL,
  CANCEL_REASON_LABEL,
  LEAD_STAGE_LABEL,
  LIFECYCLE_STAGE_LABEL,
  LOYALTY_TIER_LABEL,
  ORDER_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  PROMOTION_STATUS_LABEL,
  SEGMENT_FIELD_LABEL,
  SEGMENT_OP_LABEL,
  TICKET_STATUS_LABEL,
  type CampaignStatus,
  type CancelReason,
  type LeadStage,
  type LifecycleStage,
  type LoyaltyTier,
  type OrderStatus,
  type ProductStatus,
  type Promotion,
  type PromotionKind,
  type PromotionStatus,
  type SegmentRule,
  type TicketStatus,
} from '@rc/types'
import { autoCode, onStatus } from '../pages/promotions/lib'

/** The permission each proposed action needs; the same as its API route (TestAssistantActionsMatchTheirRoutes). */
export const ACTION_PERMISSION: Record<AssistantAction['type'], Permission> = {
  'promotions/save': 'promotion.manage',
  'promotions/setStatus': 'promotion.manage',
  'campaigns/pause': 'campaign.manage',
  'campaigns/launch': 'campaign.manage',
  'stock/receive': 'inventory.manage',
  'stock/adjust': 'inventory.manage',
  'orders/advance': 'order.fulfil',
  'orders/cancel': 'order.fulfil',
  'orders/note': 'order.fulfil',
  'customers/note': 'customer.manage',
  'tickets/assign': 'ticket.manage',
  'tickets/resolve': 'ticket.manage',
  'leads/move': 'lead.manage',
  'products/setStatus': 'product.manage',
  'segments/save': 'segment.manage',
}

const str = (a: AssistantAction, key: string) => String(a.params[key] ?? '')
const num = (a: AssistantAction, key: string) => Number(a.params[key] ?? 0)
const day = (value: string) => fmtDateShort(fromInput(`${value}T12:00`))
const rules = (a: AssistantAction) => (Array.isArray(a.params.rules) ? (a.params.rules as SegmentRule[]) : [])

const orderLabel = (s: string) => ORDER_STATUS_LABEL[s as OrderStatus] ?? s
const productLabel = (s: string) => PRODUCT_STATUS_LABEL[s as ProductStatus] ?? s
const campaignLabel = (s: string) => CAMPAIGN_STATUS_LABEL[s as CampaignStatus] ?? s

/** One segment rule in words: "Lifetime spend more than Rp 5.000.000". */
function ruleText(r: SegmentRule): string {
  const field = SEGMENT_FIELD_LABEL[r.field] ?? r.field
  switch (r.field) {
    case 'spend':
      return `${field} ${SEGMENT_OP_LABEL[r.op]} ${fmtIdr(Number(r.value))}`
    case 'orders':
    case 'days_since_purchase':
      return `${field} ${SEGMENT_OP_LABEL[r.op]} ${r.value}`
    case 'tier':
      return `${field} is ${LOYALTY_TIER_LABEL[r.value as LoyaltyTier] ?? r.value}`
    case 'stage':
      return `${field} is ${LIFECYCLE_STAGE_LABEL[r.value as LifecycleStage] ?? r.value}`
    default:
      return `${field} is ${r.value}`
  }
}

/** The warning a high-risk card shows in red above its second confirm step. */
export function riskWarning(a: AssistantAction): string | null {
  if (a.risk !== 'high') return null
  switch (a.type) {
    case 'orders/cancel':
      return num(a, 'refund') > 0
        ? `This refunds ${fmtIdr(num(a, 'refund'))} to the shopper and cannot be undone.`
        : 'The order cannot be reopened after it is cancelled.'
    case 'campaigns/launch':
      return str(a, 'to') === 'scheduled'
        ? `Messages go to the whole audience from ${fmtDateShort(str(a, 'startAt'))}.`
        : 'Messages start going to the whole audience straight away.'
    default:
      return 'This change is hard to take back.'
  }
}

/** The exact change an action makes, in one line: "Create promotion 'Weekend 10%' · 10% off · 10 Oct to 11 Oct · Draft". */
export function describeAction(a: AssistantAction): string {
  switch (a.type) {
    case 'promotions/save': {
      const off =
        str(a, 'kind') === 'percentage' ? `${num(a, 'value')}% off` : `${fmtIdr(num(a, 'value'))} off`
      return [
        `Create promotion '${str(a, 'name')}'`,
        off,
        num(a, 'maxDiscount') > 0 && `up to ${fmtIdr(num(a, 'maxDiscount'))}`,
        num(a, 'minSpend') > 0 && `min. spend ${fmtIdr(num(a, 'minSpend'))}`,
        str(a, 'trigger') === 'code'
          ? `code ${str(a, 'code') || 'made from the name'}`
          : 'applies automatically',
        `${day(str(a, 'startAt'))} to ${day(str(a, 'endAt'))}`,
        str(a, 'status') === 'draft' ? 'Draft' : 'Live on its start date',
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'promotions/setStatus': {
      const verb = str(a, 'status') === 'paused' ? 'Pause' : 'Turn on'
      const from = PROMOTION_STATUS_LABEL[str(a, 'from') as PromotionStatus] ?? str(a, 'from')
      const to = PROMOTION_STATUS_LABEL[str(a, 'status') as PromotionStatus] ?? str(a, 'status')
      return `${verb} promotion '${str(a, 'name')}' (${str(a, 'code')}) · ${from} to ${to}`
    }
    case 'campaigns/pause':
      return `Pause campaign '${str(a, 'name')}' · ${CAMPAIGN_STATUS_LABEL.running} to ${CAMPAIGN_STATUS_LABEL.paused}`
    case 'stock/receive':
      return `Receive ${num(a, 'qty')} units of ${str(a, 'product')} (${str(a, 'sku')}) at ${str(a, 'warehouse')} · on hand ${num(a, 'onHand')} to ${num(a, 'onHand') + num(a, 'qty')}`
    case 'orders/advance':
      return `Move order ${str(a, 'code')} from ${orderLabel(str(a, 'status'))} to ${orderLabel(str(a, 'nextStatus'))}`
    case 'customers/note':
      return `Add a note to customer ${str(a, 'code') || str(a, 'id')}: "${str(a, 'note')}"`
    case 'campaigns/launch':
      return `${str(a, 'from') === 'paused' ? 'Resume' : 'Launch'} campaign '${str(a, 'name')}' · ${campaignLabel(str(a, 'from'))} to ${campaignLabel(str(a, 'to'))}`
    case 'stock/adjust': {
      const delta = num(a, 'delta')
      return `${delta > 0 ? 'Add' : 'Remove'} ${Math.abs(delta)} units of ${str(a, 'product')} (${str(a, 'sku')}) at ${str(a, 'warehouse')} · on hand ${num(a, 'onHand')} to ${num(a, 'onHand') + delta} · ${str(a, 'note')}`
    }
    case 'orders/cancel': {
      const reason = CANCEL_REASON_LABEL[str(a, 'reason') as CancelReason] ?? str(a, 'reason')
      const money =
        num(a, 'refund') > 0 ? `refunds ${fmtIdr(num(a, 'refund'))} in full` : 'no refund, nothing was paid'
      return `Cancel order ${str(a, 'code')} (${orderLabel(str(a, 'status'))}, ${fmtIdr(num(a, 'total'))}) · ${reason} · ${money}`
    }
    case 'orders/note':
      return `Add a note to order ${str(a, 'code')}: "${str(a, 'note')}"`
    case 'tickets/assign':
      return str(a, 'assigneeId')
        ? `Assign ticket ${str(a, 'code')} '${str(a, 'subject')}' to you`
        : `Unassign ticket ${str(a, 'code')} '${str(a, 'subject')}'`
    case 'tickets/resolve':
      return `Resolve ticket ${str(a, 'code')} '${str(a, 'subject')}' · ${TICKET_STATUS_LABEL[str(a, 'status') as TicketStatus] ?? str(a, 'status')} to ${TICKET_STATUS_LABEL.resolved}`
    case 'leads/move': {
      const stage = (s: string) => LEAD_STAGE_LABEL[s as LeadStage] ?? s
      return `Move lead ${str(a, 'code')} from ${stage(str(a, 'from'))} to ${stage(str(a, 'stage'))}`
    }
    case 'products/setStatus':
      return `${str(a, 'status') === 'archived' ? 'Archive' : 'Activate'} product ${str(a, 'name')} (${str(a, 'code')}) · ${productLabel(str(a, 'from'))} to ${productLabel(str(a, 'status'))}`
    case 'segments/save':
      return `Create segment '${str(a, 'name')}' · customers matching ${str(a, 'match') === 'all' ? 'all' : 'any'} of: ${rules(a).map(ruleText).join('; ')}`
  }
}

/** The past-tense toast title once an action ran. */
export function doneTitle(a: AssistantAction): string {
  switch (a.type) {
    case 'promotions/save':
      return 'Promotion created'
    case 'promotions/setStatus':
      return str(a, 'status') === 'paused' ? 'Promotion paused' : 'Promotion turned on'
    case 'campaigns/pause':
      return 'Campaign paused'
    case 'stock/receive':
      return 'Stock received'
    case 'orders/advance':
      return 'Order moved on'
    case 'customers/note':
    case 'orders/note':
      return 'Note added'
    case 'campaigns/launch':
      return str(a, 'to') === 'scheduled' ? 'Campaign scheduled' : 'Campaign running'
    case 'stock/adjust':
      return 'Stock adjusted'
    case 'orders/cancel':
      return num(a, 'refund') > 0 ? 'Order cancelled and refunded' : 'Order cancelled'
    case 'tickets/assign':
      return str(a, 'assigneeId') ? 'Ticket assigned to you' : 'Ticket unassigned'
    case 'tickets/resolve':
      return 'Ticket resolved'
    case 'leads/move':
      return 'Lead moved on'
    case 'products/setStatus':
      return str(a, 'status') === 'archived' ? 'Product archived' : 'Product activated'
    case 'segments/save':
      return 'Segment created'
  }
}

export interface ActionContext {
  tenantId: string
  /** Promotion codes in use, so a new automatic code does not repeat one. */
  promotionCodes: ReadonlySet<string>
  now: number
}

/** The reducer action a confirmed proposal dispatches. */
export function toAppAction(a: AssistantAction, ctx: ActionContext): AppAction {
  switch (a.type) {
    case 'promotions/save': {
      const startAt = fromInput(`${str(a, 'startAt')}T00:00`)
      const kind = str(a, 'kind') as PromotionKind
      const promotion: Promotion = {
        id: newId('promo'),
        tenantId: ctx.tenantId,
        code: str(a, 'code') || autoCode(str(a, 'name'), ctx.promotionCodes),
        name: str(a, 'name'),
        kind,
        trigger: str(a, 'trigger') === 'code' ? 'code' : 'automatic',
        value: num(a, 'value'),
        maxDiscount: kind === 'percentage' && num(a, 'maxDiscount') > 0 ? num(a, 'maxDiscount') : null,
        buyQty: null,
        getQty: null,
        getDiscountPct: null,
        minSpend: num(a, 'minSpend'),
        segmentId: null,
        categoryIds: [],
        productIds: [],
        paymentTypeIds: [],
        sellerId: null,
        status: str(a, 'status') === 'draft' ? 'draft' : onStatus({ startAt }, ctx.now),
        startAt,
        endAt: fromInput(`${str(a, 'endAt')}T23:59`),
        usageLimit: null,
        used: 0,
        revenue: 0,
      }
      return { type: 'promotions/save', promotion }
    }
    case 'promotions/setStatus':
      return { type: 'promotions/setStatus', id: str(a, 'id'), status: str(a, 'status') as PromotionStatus }
    case 'campaigns/pause':
      return { type: 'campaigns/pause', id: str(a, 'id') }
    case 'stock/receive':
      return {
        type: 'stock/receive',
        tenantId: ctx.tenantId,
        productId: str(a, 'productId'),
        variantId: str(a, 'variantId'),
        warehouseId: str(a, 'warehouseId'),
        qty: num(a, 'qty'),
        note: str(a, 'note'),
      }
    case 'orders/advance':
      return { type: 'orders/advance', id: str(a, 'id') }
    case 'customers/note':
      return { type: 'customers/note', id: str(a, 'id'), note: str(a, 'note') }
    case 'campaigns/launch':
      return { type: 'campaigns/launch', id: str(a, 'id') }
    case 'stock/adjust':
      return {
        type: 'stock/adjust',
        levelId: str(a, 'levelId'),
        delta: num(a, 'delta'),
        note: str(a, 'note'),
      }
    case 'orders/cancel':
      return {
        type: 'orders/cancel',
        id: str(a, 'id'),
        reason: str(a, 'reason') as CancelReason,
        note: str(a, 'note'),
      }
    case 'orders/note':
      return { type: 'orders/note', id: str(a, 'id'), note: str(a, 'note') }
    case 'tickets/assign':
      return { type: 'tickets/assign', id: str(a, 'id'), assigneeId: str(a, 'assigneeId') || null }
    case 'tickets/resolve':
      return { type: 'tickets/resolve', id: str(a, 'id') }
    case 'leads/move':
      return { type: 'leads/move', id: str(a, 'id'), stage: str(a, 'stage') as LeadStage }
    case 'products/setStatus':
      return { type: 'products/setStatus', id: str(a, 'id'), status: str(a, 'status') as ProductStatus }
    case 'segments/save':
      return {
        type: 'segments/save',
        segment: {
          id: newId('seg'),
          tenantId: ctx.tenantId,
          name: str(a, 'name'),
          description: str(a, 'description'),
          builtIn: false,
          match: str(a, 'match') === 'all' ? 'all' : 'any',
          rules: rules(a),
          createdAt: toIso(ctx.now),
        },
      }
  }
}

const LOOKUP_LABEL: Record<string, string> = {
  orders: 'orders',
  customers: 'customers',
  products: 'products and stock',
  promotions: 'promotions',
  campaigns: 'campaigns',
  tickets: 'tickets',
  leads: 'leads',
}

/** The line under an answer: "orders, products and stock". */
export const lookedUp = (types: string[]) => types.map((t) => LOOKUP_LABEL[t] ?? t).join(', ')

const STARTERS: [prefix: string, questions: string[]][] = [
  ['/commerce/orders/', ['What is the next step for this order?', 'Is this order late?']],
  ['/commerce/orders', ['Which orders are late?', 'What is waiting to ship?', 'How many returns are open?']],
  ['/commerce/products/', ['How is this product selling?', 'Does this product need restocking?']],
  ['/commerce/inventory', ['What should I restock?', 'Which items are below their reorder point?']],
  ['/commerce/products', ['Which products sold best this month?', 'What should I restock?']],
  ['/customers/all/', ['Summarise this customer.', 'When did this customer last order?']],
  [
    '/customers',
    ['How big are my segments?', 'How many carts were abandoned this week?', 'Who are my top customers?'],
  ],
  ['/marketing/campaigns', ['How are my campaigns doing?', 'Which campaign should I pause?']],
  ['/marketing/promotions', ['Which promotions are running?', 'Suggest a promotion for the weekend.']],
  ['/marketing', ['How are my campaigns doing?', 'Which promotions are running?']],
  ['/sales', ['Who are my top sellers this month?', 'How did sales change this week?']],
  ['/analytics', ['What changed this week?', 'Which products sold best this month?']],
]

const HOME = ['What changed this week?', 'What should I restock?', 'Which orders are late?']

/** Starter questions for the page the person is on. */
export function startersFor(pathname: string): string[] {
  return STARTERS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? HOME
}
