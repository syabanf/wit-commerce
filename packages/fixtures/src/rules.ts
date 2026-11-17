import type {
  AttributeDef,
  Campaign,
  PaymentType,
  Category,
  Lead,
  LeadStage,
  ModifierGroup,
  ModifierStockLevel,
  Order,
  OrderReturn,
  Page,
  PageDraft,
  Product,
  ReturnItem,
  ReturnReason,
  ReturnRefundMethod,
  ReturnShippingPayer,
  Segment,
  Seller,
  StockLevel,
  Tenant,
} from '@rc/types'
import { OPEN_RETURN_STATUSES, RETURN_REASON_LABEL, SECTION_KIND_LABEL } from '@rc/types'
import { DAY, startOfDay, toMs, wib } from './dates'
import { modifierDemand, nextOrderStatus, variantDemand } from './derive'
import { listOf } from './format'

// Blockers return the sentence the UI shows beside a disabled action, or null when the action may run.
// The reducer refuses the same action with the same check, so the two never disagree.

const CLOSED = new Set(['completed', 'cancelled', 'returned', 'refunded'])

export function orderAdvanceBlocker(
  order: Order,
  stock: readonly StockLevel[],
  modifierStock: readonly ModifierStockLevel[] = [],
  modifiers: readonly ModifierGroup[] = [],
  products: readonly Product[] = [],
): string | null {
  if (CLOSED.has(order.status)) return 'This order is closed.'
  const next = nextOrderStatus(order)
  if (!next) return 'This order has no next step.'
  if (next === 'packed') {
    for (const [variantId, qty] of variantDemand(order)) {
      const level = stock.find((s) => s.variantId === variantId && s.warehouseId === order.warehouseId)
      if (
        !level &&
        products.some((p) => p.type === 'physical' && p.variants.some((v) => v.id === variantId))
      ) {
        return 'A product variant has no stock at this warehouse. Receive stock before packing.'
      }
      if (level && level.onHand < qty) {
        return `Only ${level.onHand} left of a line that needs ${qty}. Receive stock or move the order to another warehouse.`
      }
    }
    for (const [optionId, qty] of modifierDemand(order)) {
      const option = modifiers.flatMap((g) => g.options).find((o) => o.id === optionId)
      if (!option?.stockTracked) continue
      const level = modifierStock.find((s) => s.optionId === optionId && s.warehouseId === order.warehouseId)
      if (!level || level.onHand < qty) {
        return `Only ${level?.onHand ?? 0} left of ${option.name}; this order needs ${qty}. Receive modifier stock before packing.`
      }
    }
  }
  return null
}

export function orderCancelBlocker(order: Order): string | null {
  if (CLOSED.has(order.status)) return 'This order is already closed.'
  if (order.status === 'shipped' || order.status === 'delivered') {
    return 'The parcel has left the warehouse. Start a return instead.'
  }
  return null
}

export function orderRefundBlocker(order: Order): string | null {
  if (order.paymentStatus !== 'paid') return 'Nothing to refund: the payment never arrived.'
  if (order.refundedAmount >= order.total) return 'The full amount is already refunded.'
  return null
}

/** `attributes` are the definitions that apply to the product (attributesFor). */
export function productActivateBlocker(
  product: Product,
  attributes: readonly AttributeDef[] = [],
): string | null {
  if (!product.variants.length) return 'Add at least one variant before activating.'
  const missing = attributes.filter((a) => a.required && !product.attributes[a.id]?.trim())
  if (missing.length) return `Fill in ${listOf(missing.map((a) => a.name.toLowerCase()))} before activating.`
  if (product.price <= 0 && !product.assisted) return 'Set a price, or sell it through Talk to sales.'
  return null
}

export interface PagePublishCheck {
  key: 'required' | 'hero' | 'seo'
  /** What the check asks for, as the store editor's checklist lists it. */
  label: string
  /** The blocker sentence when the check fails, else null. */
  problem: string | null
}

/** Every check a page passes before it goes live, in the order pagePublishBlocker reports them. */
export function pagePublishChecks(page: Page): PagePublishCheck[] {
  const hiddenRequired = page.sections.find((s) => s.rule === 'required' && s.hidden)
  const hero = page.sections.find((s) => s.kind === 'hero' && !s.hidden)
  return [
    {
      key: 'required',
      label: 'Every section the layout needs is showing',
      problem: hiddenRequired
        ? `The ${SECTION_KIND_LABEL[hiddenRequired.kind]} section is required. Show it before publishing.`
        : null,
    },
    {
      key: 'hero',
      label: 'The big banner has a title',
      problem: hero && !hero.headline.trim() ? 'The hero needs a headline.' : null,
    },
    {
      key: 'seo',
      label: 'The page has a title for search engines',
      problem: page.seo.title.trim() ? null : 'Add a meta title so the page can be found in search.',
    },
  ]
}

/** The page as it would go live: its unpublished changes laid over it, when it has any. */
export function pageWithDraft(page: Page, draft: PageDraft | null | undefined): Page {
  return draft ? { ...page, sections: draft.sections, seo: draft.seo, templateId: draft.templateId } : page
}

/** Edits wait in a draft while the page is live or scheduled, or already has unpublished changes. */
export function pageEditsGoToDraft(page: Page, draft: PageDraft | null | undefined): boolean {
  return page.status !== 'draft' || !!draft
}

export function pagePublishBlocker(page: Page): string | null {
  return pagePublishChecks(page).find((c) => c.problem)?.problem ?? null
}

export function campaignLaunchBlocker(campaign: Campaign, audienceSize: number): string | null {
  if (campaign.status === 'running') return 'The campaign is already running.'
  if (campaign.status === 'completed') return 'The campaign has ended. Duplicate it to run it again.'
  if (!campaign.channels.length) return 'Choose at least one channel.'
  if (!campaign.segmentId) return 'Choose an audience segment.'
  if (audienceSize === 0) return 'The audience segment has no customers yet.'
  return null
}

export function leadMoveBlocker(lead: Lead, stage: LeadStage): string | null {
  if (lead.stage === 'won' || lead.stage === 'lost') return 'This lead is closed. Reopen it as a new lead.'
  if (stage === 'won' && lead.value <= 0) return 'Enter the deal value before marking it won.'
  return null
}

export function sellerTemplateBlocker(seller: Seller, templateId: string): string | null {
  if (!seller.allowedTemplateIds.includes(templateId))
    return 'The tenant admin has not allowed this template for this seller.'
  return null
}

export function stockAdjustBlocker(
  level: Pick<StockLevel, 'onHand' | 'reserved'>,
  delta: number,
): string | null {
  if (level.onHand + delta >= level.reserved) return null
  if (level.reserved > 0)
    return `Stock cannot drop below the ${level.reserved} units reserved for open orders.`
  return `Stock cannot drop below zero. Remove at most ${level.onHand} units.`
}

export function segmentRemoveBlocker(segment: Segment, campaigns: readonly Campaign[]): string | null {
  if (segment.builtIn) return 'Built-in segments cannot be removed.'
  const using = campaigns.filter((c) => c.segmentId === segment.id && c.status !== 'completed')
  if (using.length)
    return `Used by ${listOf(using.map((c) => c.name))}. Change their audience or wait until they complete.`
  return null
}

export function categoryRemoveBlocker(
  category: Category,
  products: readonly Product[],
  categories: readonly Category[],
): string | null {
  const used = products.filter((p) => p.categoryId === category.id).length
  if (used)
    return `${used} ${used === 1 ? 'product uses' : 'products use'} this category. Move them to another category first.`
  const children = categories.filter((c) => c.parentId === category.id).length
  if (children)
    return `${children} ${children === 1 ? 'sub-category sits' : 'sub-categories sit'} under it. Move or remove them first.`
  return null
}

/** Checks a storefront order before it is placed: every line needs enough sellable stock at its warehouse. */
export function orderPlaceBlocker(
  order: Order,
  stock: readonly StockLevel[],
  modifierStock: readonly ModifierStockLevel[] = [],
  modifiers: readonly ModifierGroup[] = [],
  products: readonly Product[] = [],
): string | null {
  if (!order.lines.length) return 'Your cart is empty.'
  for (const [variantId, qty] of variantDemand(order)) {
    const level = stock.find((s) => s.variantId === variantId && s.warehouseId === order.warehouseId)
    if (!level && products.some((p) => p.type === 'physical' && p.variants.some((v) => v.id === variantId))) {
      return 'One item has no stock at this warehouse. Remove it or try again after restocking.'
    }
    if (level && level.onHand - level.reserved < qty) {
      const left = Math.max(0, level.onHand - level.reserved)
      return left
        ? `Only ${left} left of one item. Lower the quantity to continue.`
        : 'One item just sold out. Remove it to continue.'
    }
  }
  for (const [optionId, qty] of modifierDemand(order)) {
    const option = modifiers.flatMap((g) => g.options).find((o) => o.id === optionId)
    if (!option?.stockTracked) continue
    const level = modifierStock.find((s) => s.optionId === optionId && s.warehouseId === order.warehouseId)
    const left = Math.max(0, (level?.onHand ?? 0) - (level?.reserved ?? 0))
    if (left < qty)
      return `${option.name} has only ${left} left. Lower the quantity or choose another option.`
  }
  return null
}

/** A store needs at least one way to pay. */
export function paymentTypeDisableBlocker(type: PaymentType, all: readonly PaymentType[]): string | null {
  const others = all.filter((t) => t.tenantId === type.tenantId && t.id !== type.id && t.enabled)
  return others.length ? null : 'Keep at least one payment type on, or shoppers cannot check out.'
}

// --- returns ---
//
// A return covers some units of one order. It moves requested → approved → received → refunded, or
// ends rejected or cancelled. An order turns `returned` when refunded returns cover every unit it
// holds; a partial return leaves the order's status alone and shows in its refunded amount.

/** Days after delivery a shopper may ask for a return when the brand set none. */
export const DEFAULT_RETURN_WINDOW_DAYS = 7

/** PP 80/2019 Pasal 69(1): a shopper always gets at least this many working days after delivery. */
export const LEGAL_RETURN_WORKING_DAYS = 2

/**
 * The reasons Pasal 69(2) names: wrong or mismatched goods, late delivery, a hidden defect, damage or
 * expiry. The store must take these inside the legal window and pays their return shipping
 * (Pasal 69(3-4)). Change of mind and fit follow the brand's own policy.
 */
export const LEGAL_RETURN_REASONS: readonly ReturnReason[] = [
  'damaged',
  'wrong_item',
  'not_as_described',
  'late_delivery',
  'hidden_defect',
  'expired',
]

export const isLegalReturnReason = (reason: ReturnReason) => LEGAL_RETURN_REASONS.includes(reason)

/**
 * The end of the second working day (Monday to Friday, WIB) after the day the parcel arrived.
 * Public holidays are not counted out.
 */
export function legalReturnDeadline(deliveredMs: number): number {
  let day = startOfDay(deliveredMs)
  for (let left = LEGAL_RETURN_WORKING_DAYS; left > 0;) {
    day += DAY
    const weekday = wib(day).weekday
    if (weekday !== 0 && weekday !== 6) left--
  }
  return day + DAY - 1
}

/** Who pays return shipping: the shopper only when every item comes back by their own choice. */
export function returnShippingPayer(items: readonly Pick<ReturnItem, 'reason'>[]): ReturnShippingPayer {
  return items.some((i) => isLegalReturnReason(i.reason)) ? 'brand' : 'shopper'
}

/** The payer a return recorded, or the rule's answer for returns made before it was recorded. */
export const shippingPayerOf = (ret: Pick<OrderReturn, 'items' | 'shippingPaidBy'>) =>
  ret.shippingPaidBy ?? returnShippingPayer(ret.items)

export const returnWindowDays = (tenant: Pick<Tenant, 'returnWindowDays'> | undefined) =>
  tenant?.returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS

export const isOpenReturn = (r: Pick<OrderReturn, 'status'>) => OPEN_RETURN_STATUSES.includes(r.status)

/** Units per variant the order's returns hold: every return that was not rejected or cancelled. */
export function returnedQty(orderId: string, returns: readonly OrderReturn[]): Map<string, number> {
  const held = new Map<string, number>()
  for (const r of returns) {
    if (r.orderId !== orderId || r.status === 'rejected' || r.status === 'cancelled') continue
    for (const item of r.items) held.set(item.variantId, (held.get(item.variantId) ?? 0) + item.qty)
  }
  return held
}

/** Units per variant that can still go into a return: bought minus earlier returns. */
export function returnableQty(order: Order, returns: readonly OrderReturn[]): Map<string, number> {
  const held = returnedQty(order.id, returns)
  const left = new Map<string, number>()
  for (const [variantId, qty] of variantDemand(order)) left.set(variantId, qty - (held.get(variantId) ?? 0))
  return left
}

/** When the parcel arrived: the delivered step on the order's timeline, else when it was placed. */
export function deliveredAt(order: Pick<Order, 'events' | 'createdAt'>): string {
  return order.events.find((e) => e.status === 'delivered')?.at ?? order.createdAt
}

/**
 * The last moment a shopper may ask to return an item for this reason, or null when the store takes
 * no such requests. A Pasal 69(2) reason gets the brand's window or 2 working days, whichever ends
 * later; change of mind and fit get the brand's window only.
 */
export function returnDeadline(
  order: Pick<Order, 'events' | 'createdAt'>,
  windowDays: number,
  reason: ReturnReason,
): number | null {
  const delivered = toMs(deliveredAt(order))
  const brand = windowDays > 0 ? delivered + windowDays * DAY : null
  if (!isLegalReturnReason(reason)) return brand
  return Math.max(brand ?? 0, legalReturnDeadline(delivered))
}

/** Why a shopper may not ask to return an item for this reason now, or null when they may. */
function returnWindowBlocker(
  order: Pick<Order, 'events' | 'createdAt'>,
  windowDays: number,
  reason: ReturnReason,
  now: number,
): string | null {
  const deadline = returnDeadline(order, windowDays, reason)
  if (deadline === null)
    return 'This store takes change-of-mind and fit returns by message. Contact the store.'
  if (now <= deadline) return null
  const brandBound = windowDays > 0 && deadline === toMs(deliveredAt(order)) + windowDays * DAY
  return brandBound
    ? `The ${windowDays}-day return window for this order has closed.`
    : `The ${LEGAL_RETURN_WORKING_DAYS}-working-day return window for this order has closed.`
}

/**
 * Checks a return request. Staff may start one once the parcel has shipped; a shopper once it is
 * delivered, within the window each item's reason allows.
 */
export function returnRequestBlocker(
  order: Order,
  returns: readonly OrderReturn[],
  items: readonly Pick<ReturnItem, 'variantId' | 'qty' | 'reason'>[],
  who: 'staff' | 'shopper',
  now: number,
  windowDays: number,
): string | null {
  const delivered = order.status === 'delivered' || order.status === 'completed'
  if (who === 'shopper') {
    if (!delivered) return 'You can ask for a return once the order is delivered.'
  } else if (!delivered && order.status !== 'shipped') {
    return 'Only a shipped or delivered order can be returned.'
  }
  if (!items.length) return 'Choose at least one item to return.'
  const bought = variantDemand(order)
  const left = returnableQty(order, returns)
  const open = new Set(
    returns
      .filter((r) => r.orderId === order.id && isOpenReturn(r))
      .flatMap((r) => r.items.map((i) => i.variantId)),
  )
  const seen = new Set<string>()
  for (const item of items) {
    if (!bought.has(item.variantId)) return 'One item is not part of this order.'
    if (seen.has(item.variantId)) return 'List each item once.'
    seen.add(item.variantId)
    if (!(item.reason in RETURN_REASON_LABEL)) return 'Choose a reason for each item.'
    const closed = who === 'shopper' && returnWindowBlocker(order, windowDays, item.reason, now)
    if (closed) return closed
    if (!Number.isInteger(item.qty) || item.qty < 1) return 'Enter how many units to return.'
    if (open.has(item.variantId)) return 'One item already has an open return. Finish that one first.'
    const can = left.get(item.variantId) ?? 0
    if (item.qty > can)
      return can > 0
        ? `Only ${can} of one item can still be returned.`
        : 'One item was already returned in full.'
  }
  return null
}

/** Approving and rejecting both answer a request. */
export function returnDecideBlocker(ret: Pick<OrderReturn, 'status'>): string | null {
  return ret.status === 'requested' ? null : 'Only a requested return can be approved or rejected.'
}

export function returnReceiveBlocker(ret: Pick<OrderReturn, 'status'>): string | null {
  return ret.status === 'approved' ? null : 'Approve the return before marking it received.'
}

export function returnCancelBlocker(ret: Pick<OrderReturn, 'status'>): string | null {
  return ret.status === 'requested' || ret.status === 'approved'
    ? null
    : 'Only a return that has not been received can be cancelled.'
}

export function returnRefundBlocker(ret: Pick<OrderReturn, 'status'>, order: Order): string | null {
  if (ret.status !== 'received') return 'Mark the return received before refunding it.'
  return orderRefundBlocker(order)
}

/**
 * What the shopper paid for the returned units: their line value, less their share of the order's
 * discount. Shipping is not part of it.
 */
export function returnItemsPaid(
  order: Order,
  items: readonly Pick<ReturnItem, 'variantId' | 'qty'>[],
): number {
  let value = 0
  for (const item of items) {
    const lines = order.lines.filter((l) => l.variantId === item.variantId)
    const units = lines.reduce((n, l) => n + l.qty, 0)
    const total = lines.reduce((n, l) => n + l.qty * l.price, 0)
    if (units) value += Math.floor((item.qty * total) / units)
  }
  const goods = Math.max(0, order.subtotal - order.discount)
  return order.subtotal > 0 ? Math.floor((value * goods) / order.subtotal) : 0
}

/** The most a return may refund: what was paid for its items, and no more than the order still holds. */
export function returnRefundCap(order: Order, ret: Pick<OrderReturn, 'items'>): number {
  return Math.max(0, Math.min(returnItemsPaid(order, ret.items), order.total - order.refundedAmount))
}

/**
 * Splits a refund into the items part, capped by returnRefundCap, and the return shipping the brand
 * adds when it pays that shipping, capped at what the order still holds after the items.
 */
export function returnRefundSplit(
  order: Order,
  ret: Pick<OrderReturn, 'items' | 'shippingPaidBy'>,
  amount: number,
  shippingCost: number,
): { items: number; shipping: number } {
  const items = Math.max(0, Math.min(Math.floor(amount), returnRefundCap(order, ret)))
  const room = order.total - order.refundedAmount - items
  const shipping =
    shippingPayerOf(ret) === 'brand' ? Math.max(0, Math.min(Math.floor(shippingCost), room)) : 0
  return { items, shipping }
}

/**
 * Pasal 71: a return is marked refunded only once the money moved. A gateway refund carries the
 * gateway's reference; any other refund needs the transfer reference and date staff recorded.
 */
export function returnRefundProofBlocker(proof: {
  method?: ReturnRefundMethod
  reference?: string
  refundedOn?: string
}): string | null {
  const method = proof.method ?? 'manual'
  if (method !== 'manual' && method !== 'midtrans') return 'Choose how the money went back.'
  if (!proof.reference?.trim())
    return method === 'midtrans'
      ? 'The gateway gave no refund reference.'
      : 'Enter the transfer reference so the shopper can trace the money.'
  if (method === 'manual' && !proof.refundedOn?.trim()) return 'Enter the date the money was sent.'
  return null
}

/** True when refunded returns cover every unit of the order. */
export function orderFullyReturned(order: Order, returns: readonly OrderReturn[]): boolean {
  const refunded = returnedQty(
    order.id,
    returns.filter((r) => r.status === 'refunded'),
  )
  for (const [variantId, qty] of variantDemand(order)) if ((refunded.get(variantId) ?? 0) < qty) return false
  return order.lines.length > 0
}
