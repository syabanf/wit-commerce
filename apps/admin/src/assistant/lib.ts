import type { AssistantAction } from '@rc/api'
import { type AppAction, type Permission, fmtDateShort, fmtIdr, fromInput, newId } from '@rc/fixtures'
import {
  CAMPAIGN_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PROMOTION_STATUS_LABEL,
  type OrderStatus,
  type Promotion,
  type PromotionKind,
  type PromotionStatus,
} from '@rc/types'
import { autoCode, onStatus } from '../pages/promotions/lib'

/** The permission each proposed action needs; the same as its API route (TestAssistantActionsMatchTheirRoutes). */
export const ACTION_PERMISSION: Record<AssistantAction['type'], Permission> = {
  'promotions/save': 'promotion.manage',
  'promotions/setStatus': 'promotion.manage',
  'campaigns/pause': 'campaign.manage',
  'stock/receive': 'inventory.manage',
  'orders/advance': 'order.fulfil',
  'customers/note': 'customer.manage',
}

const str = (a: AssistantAction, key: string) => String(a.params[key] ?? '')
const num = (a: AssistantAction, key: string) => Number(a.params[key] ?? 0)
const day = (value: string) => fmtDateShort(fromInput(`${value}T12:00`))

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
    case 'orders/advance': {
      const label = (s: string) => ORDER_STATUS_LABEL[s as OrderStatus] ?? s
      return `Move order ${str(a, 'code')} from ${label(str(a, 'status'))} to ${label(str(a, 'nextStatus'))}`
    }
    case 'customers/note':
      return `Add a note to customer ${str(a, 'code') || str(a, 'id')}: "${str(a, 'note')}"`
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
      return 'Note added'
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
  }
}

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
