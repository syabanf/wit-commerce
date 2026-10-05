import type {
  AttributeDef,
  Campaign,
  PaymentType,
  Category,
  Lead,
  LeadStage,
  Order,
  Page,
  Product,
  Segment,
  Seller,
  StockLevel,
} from '@rc/types'
import { SECTION_KIND_LABEL } from '@rc/types'
import { nextOrderStatus } from './derive'
import { listOf } from './format'

// Blockers return the sentence the UI shows beside a disabled action, or null when the action may run.
// The reducer refuses the same action with the same check, so the two never disagree.

const CLOSED = new Set(['completed', 'cancelled', 'returned', 'refunded'])

export function orderAdvanceBlocker(order: Order, stock: readonly StockLevel[]): string | null {
  if (CLOSED.has(order.status)) return 'This order is closed.'
  const next = nextOrderStatus(order)
  if (!next) return 'This order has no next step.'
  if (next === 'packed') {
    for (const line of order.lines) {
      const level = stock.find((s) => s.variantId === line.variantId && s.warehouseId === order.warehouseId)
      if (level && level.onHand < line.qty) {
        return `Only ${level.onHand} left of a line that needs ${line.qty}. Receive stock or move the order to another warehouse.`
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

export function pagePublishBlocker(page: Page): string | null {
  const hiddenRequired = page.sections.find((s) => s.rule === 'required' && s.hidden)
  if (hiddenRequired)
    return `The ${SECTION_KIND_LABEL[hiddenRequired.kind]} section is required. Show it before publishing.`
  const hero = page.sections.find((s) => s.kind === 'hero' && !s.hidden)
  if (hero && !hero.headline.trim()) return 'The hero needs a headline.'
  if (!page.seo.title.trim()) return 'Add a meta title so the page can be found in search.'
  return null
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
export function orderPlaceBlocker(order: Order, stock: readonly StockLevel[]): string | null {
  if (!order.lines.length) return 'Your cart is empty.'
  for (const line of order.lines) {
    const level = stock.find((s) => s.variantId === line.variantId && s.warehouseId === order.warehouseId)
    // Untracked items (services, digital) have no stock row.
    if (level && level.onHand - level.reserved < line.qty) {
      const left = Math.max(0, level.onHand - level.reserved)
      return left
        ? `Only ${left} left of one item. Lower the quantity to continue.`
        : 'One item just sold out. Remove it to continue.'
    }
  }
  return null
}

/** A store needs at least one way to pay. */
export function paymentTypeDisableBlocker(type: PaymentType, all: readonly PaymentType[]): string | null {
  const others = all.filter((t) => t.tenantId === type.tenantId && t.id !== type.id && t.enabled)
  return others.length ? null : 'Keep at least one payment type on, or shoppers cannot check out.'
}
