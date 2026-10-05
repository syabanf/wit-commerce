import { type PricedLine, fmtIdr, promotionValue as discountOn, scopedLines, toMs } from '@rc/fixtures'
import type { Category, Product, Promotion, PromotionKind, PromotionStatus } from '@rc/types'

/** Short chip labels for the kind filter. */
export const KIND_CHIP: Record<PromotionKind, string> = {
  percentage: 'Percentage',
  fixed: 'Nominal',
  bxgy: 'Buy X get Y',
  free_shipping: 'Free shipping',
  bundle: 'Bundle',
}

/** One line per kind for the choice grid in the dialog. */
export const KIND_HINT: Record<PromotionKind, string> = {
  percentage: 'A share off the qualifying items, with an optional cap.',
  fixed: 'A fixed Rupiah amount off the qualifying items.',
  bxgy: 'Buy a number of items and get more free or discounted.',
  free_shipping: 'No delivery fee once the order reaches the minimum spend.',
  bundle: 'Two or more products together for one price.',
}

type Names = {
  categoryName: (id: string) => string
  productName: (id: string) => string
  segmentName: (id: string) => string
  sellerName: (id: string) => string
  paymentName: (id: string) => string
}

/** "Road running shoes, Apparel · Pay with QRIS · VIP members", or "Everything". */
export function promotionScope(p: Promotion, names: Names): string {
  const items = [
    ...p.categoryIds.map(names.categoryName),
    ...(p.productIds.length > 2 ? [`${p.productIds.length} products`] : p.productIds.map(names.productName)),
  ]
  const parts = [
    items.length ? items.join(', ') : 'Everything',
    p.paymentTypeIds.length && `Pay with ${p.paymentTypeIds.map(names.paymentName).join(' or ')}`,
    p.segmentId && names.segmentName(p.segmentId),
    p.sellerId && `${names.sellerName(p.sellerId)}'s store`,
  ].filter((x): x is string => !!x)
  return parts.join(' · ')
}

/**
 * What the offer is worth on a sample cart: three units of the cheapest active product in scope
 * (one of each product for a bundle), priced by the same engine the storefront uses.
 */
export function sampleCart(
  p: Promotion,
  products: readonly Product[],
  categories: readonly Pick<Category, 'id' | 'parentId'>[],
): string | null {
  const line = (x: Product, qty: number): PricedLine => ({
    productId: x.id,
    categoryId: x.categoryId,
    qty,
    unitPrice: x.price,
  })
  let lines: PricedLine[]
  let label: string
  if (p.kind === 'bundle') {
    const picked = p.productIds
      .map((id) => products.find((x) => x.id === id))
      .filter((x): x is Product => !!x)
    if (picked.length < 2) return null
    lines = picked.map((x) => line(x, 1))
    label = picked.map((x) => x.name).join(' + ')
  } else {
    const priced = products.filter((x) => x.status === 'active' && !x.assisted && x.price > 0)
    const candidates = priced.map((x) => line(x, 3))
    const scoped = scopedLines(p, candidates, categories)
    const cheapest = [...(scoped.length ? scoped : candidates)].sort((a, b) => a.unitPrice - b.unitPrice)[0]
    const product = cheapest && priced.find((x) => x.id === cheapest.productId)
    if (!cheapest || !product) return null
    lines = [cheapest]
    label = `3 × ${product.name}`
  }
  const subtotal = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0)
  const head = `On a sample cart of ${label} (${fmtIdr(subtotal)})`
  if (subtotal < p.minSpend)
    return `${head}: nothing yet, it is below the ${fmtIdr(p.minSpend)} minimum spend.`
  if (p.kind === 'free_shipping') return `${head}: free shipping.`
  return `${head}: −${fmtIdr(discountOn(p, lines, categories))}`
}

/** Status a promotion gets when it is switched on: scheduled before its start, active after. */
export const onStatus = (p: Pick<Promotion, 'startAt'>, now: number): PromotionStatus =>
  toMs(p.startAt) > now ? 'scheduled' : 'active'

/** Why a promotion cannot be switched on, or null. */
export const activateBlocker = (p: Pick<Promotion, 'endAt'>, now: number) =>
  toMs(p.endAt) < now ? 'The end date has passed. Edit the dates first.' : null

export const CODE = /^[A-Z0-9]{3,20}$/

/** A reference code for an automatic offer, from its name and unique in the tenant: "QRISWEEKEND", "QRISWEEKEND2". */
export function autoCode(name: string, taken: ReadonlySet<string>): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
  const stem = base.length >= 3 ? base : 'AUTO'
  if (!taken.has(stem)) return stem
  let n = 2
  while (taken.has(`${stem}${n}`)) n++
  return `${stem}${n}`
}
