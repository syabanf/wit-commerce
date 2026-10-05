import type { Category, Collection, PaymentType, Product, Promotion } from '@rc/types'
import { toMs } from './dates'
import { fmtIdr } from './format'

// The pricing engine: which promotions a cart earns and what each one is worth. The storefront
// prices carts with it and the admin previews offers with it, so both always agree.

export interface PricedLine {
  productId: string
  categoryId: string
  qty: number
  /** Unit price, modifiers included. */
  unitPrice: number
}

export interface CartContext {
  lines: PricedLine[]
  /** Promotions of the tenant; the engine filters what applies. */
  promotions: readonly Promotion[]
  categories: readonly Pick<Category, 'id' | 'parentId'>[]
  /** The code the shopper typed, if any. */
  code: string | null
  /** The payment type chosen so far; null before the payment step. */
  paymentTypeId: string | null
  sellerId: string | null
  now: number
}

export interface AppliedDiscount {
  promotionId: string
  label: string
  amount: number
}

export interface CartPrice {
  subtotal: number
  discounts: AppliedDiscount[]
  discount: number
  freeShipping: boolean
  /** Why the typed code does not apply, as a sentence for the shopper. */
  codeError: string | null
  /** Offers the shopper unlocks by paying with a given payment type: "5% off with QRIS". */
  paymentOffers: Promotion[]
}

const isOpen = (p: Promotion, now: number) =>
  p.status === 'active' &&
  toMs(p.startAt) <= now &&
  toMs(p.endAt) >= now &&
  (p.usageLimit === null || p.used < p.usageLimit)

/** Lines a promotion counts: its categories (sub-categories included) and products, or every line. */
export function scopedLines(
  p: Pick<Promotion, 'categoryIds' | 'productIds'>,
  lines: readonly PricedLine[],
  categories: CartContext['categories'],
) {
  if (!p.categoryIds.length && !p.productIds.length) return [...lines]
  const parent = new Map(categories.map((c) => [c.id, c.parentId]))
  return lines.filter(
    (l) =>
      p.productIds.includes(l.productId) ||
      p.categoryIds.includes(l.categoryId) ||
      p.categoryIds.includes(parent.get(l.categoryId) ?? ''),
  )
}

/** Buy X get Y: for every full set of buy + get units, the cheapest get units take the discount. */
export function bxgyDiscount(
  p: Pick<Promotion, 'buyQty' | 'getQty' | 'getDiscountPct'>,
  lines: readonly PricedLine[],
): number {
  const buy = p.buyQty ?? 0
  const get = p.getQty ?? 0
  if (buy < 1 || get < 1) return 0
  const units = lines.flatMap((l) => Array.from({ length: l.qty }, () => l.unitPrice)).sort((a, b) => b - a)
  const sets = Math.floor(units.length / (buy + get))
  const free = units.slice(units.length - sets * get)
  return Math.round(free.reduce((sum, price) => sum + price, 0) * ((p.getDiscountPct ?? 100) / 100))
}

/** What one promotion takes off scoped lines, before checking the trigger and payment conditions. */
export function promotionValue(
  p: Promotion,
  lines: readonly PricedLine[],
  categories: CartContext['categories'],
): number {
  const scoped = scopedLines(p, lines, categories)
  const base = scoped.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  switch (p.kind) {
    case 'percentage': {
      const raw = Math.round((base * p.value) / 100)
      return p.maxDiscount === null ? raw : Math.min(raw, p.maxDiscount)
    }
    case 'fixed':
      return Math.min(p.value, base)
    case 'bxgy':
      return bxgyDiscount(p, scoped)
    case 'bundle':
      return Math.max(0, base - p.value)
    case 'free_shipping':
      return 0
  }
}

/** One sentence that says what the offer gives: "15% off, up to Rp 100.000", "Buy 2 get 1 free". */
export function describePromotion(p: Promotion, paymentName?: (id: string) => string): string {
  const head = {
    percentage: `${p.value}% off${p.maxDiscount ? `, up to ${fmtIdr(p.maxDiscount)}` : ''}`,
    fixed: `${fmtIdr(p.value)} off`,
    bxgy: `Buy ${p.buyQty ?? 0} get ${p.getQty ?? 0}${(p.getDiscountPct ?? 100) >= 100 ? ' free' : ` at ${p.getDiscountPct}% off`}`,
    free_shipping: 'Free shipping',
    bundle: `Bundle for ${fmtIdr(p.value)}`,
  }[p.kind]
  const parts = [head]
  if (p.minSpend) parts.push(`on orders over ${fmtIdr(p.minSpend)}`)
  if (p.paymentTypeIds.length && paymentName)
    parts.push(`when paying with ${p.paymentTypeIds.map(paymentName).join(' or ')}`)
  return parts.join(' ')
}

function blocker(p: Promotion, ctx: CartContext, subtotal: number, value: number): string | null {
  if (p.sellerId && p.sellerId !== ctx.sellerId) return "This code only works in its seller's store."
  if (subtotal < p.minSpend) return `Spend at least ${fmtIdr(p.minSpend)} to use this code.`
  if (p.kind !== 'free_shipping' && value <= 0) {
    return p.kind === 'bxgy'
      ? `Add ${(p.buyQty ?? 0) + (p.getQty ?? 0)} qualifying items to use this code.`
      : 'Nothing in your cart qualifies for this code.'
  }
  return null
}

/** Prices a cart: every open automatic promotion plus the typed code, each counted once. */
export function priceCart(ctx: CartContext): CartPrice {
  const subtotal = ctx.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const open = ctx.promotions.filter((p) => isOpen(p, ctx.now))
  const paysWith = (p: Promotion) =>
    !p.paymentTypeIds.length || (!!ctx.paymentTypeId && p.paymentTypeIds.includes(ctx.paymentTypeId))
  const discounts: AppliedDiscount[] = []
  let freeShipping = false
  let codeError: string | null = null

  const apply = (p: Promotion) => {
    const value = promotionValue(p, ctx.lines, ctx.categories)
    if (blocker(p, ctx, subtotal, value)) return
    if (p.kind === 'free_shipping') freeShipping = true
    else
      discounts.push({
        promotionId: p.id,
        label: p.trigger === 'code' ? `${p.code} · ${p.name}` : p.name,
        amount: value,
      })
  }

  for (const p of open) if (p.trigger === 'automatic' && paysWith(p)) apply(p)

  const typed = ctx.code?.trim().toUpperCase()
  if (typed) {
    const p = ctx.promotions.find((x) => x.code.toUpperCase() === typed && x.trigger === 'code')
    if (!p) codeError = 'This code does not exist.'
    else if (!isOpen(p, ctx.now)) codeError = 'This code is not active right now.'
    else if (!paysWith(p))
      codeError = 'This code works with another payment type. Choose it at the payment step.'
    else {
      codeError = blocker(p, ctx, subtotal, promotionValue(p, ctx.lines, ctx.categories))
      if (!codeError) apply(p)
    }
  }

  // Discounts never take the cart below zero.
  let left = subtotal
  const capped = discounts.map((d) => {
    const amount = Math.min(d.amount, left)
    left -= amount
    return { ...d, amount }
  })
  const paymentOffers = open.filter(
    (p) => p.paymentTypeIds.length > 0 && p.trigger === 'automatic' && !paysWith(p),
  )
  return {
    subtotal,
    discounts: capped.filter((d) => d.amount > 0),
    discount: subtotal - left,
    freeShipping,
    codeError,
    paymentOffers,
  }
}

/** Payment types a shopper may use for this amount, in display order. */
export function availablePaymentTypes(types: readonly PaymentType[], amount: number): PaymentType[] {
  return types
    .filter((t) => t.enabled && amount >= t.minAmount && (t.maxAmount === null || amount <= t.maxAmount))
    .sort((a, b) => a.sort - b.sort)
}

/** The gateway fee a tenant pays on an amount. */
export const paymentFee = (t: Pick<PaymentType, 'feePercent' | 'feeFixed'>, amount: number) =>
  Math.round((amount * t.feePercent) / 100 + t.feeFixed)

/** Products in a collection: the hand-picked list, or what the smart rules match among active products. */
export function collectionProducts(
  c: Collection,
  products: readonly Product[],
  categories: readonly Pick<Category, 'id' | 'parentId'>[],
): Product[] {
  if (c.mode === 'manual')
    return c.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p)
  const parent = new Map(categories.map((x) => [x.id, x.parentId]))
  return products.filter(
    (p) =>
      p.status === 'active' &&
      (c.ruleCategoryIds.includes(p.categoryId) ||
        c.ruleCategoryIds.includes(parent.get(p.categoryId) ?? '') ||
        p.tags.some((t) => c.ruleTags.includes(t))),
  )
}

/** Every combination of option values, in option order: Size × Colour. */
export function optionCombinations(
  options: readonly { name: string; values: string[] }[],
): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (combos, option) => combos.flatMap((c) => option.values.map((v) => ({ ...c, [option.name]: v }))),
    [{}],
  )
}

/** "42 / Black" from { Size: '42', Colour: 'Black' } in option order. */
export const variantLabel = (options: readonly { name: string }[], values: Record<string, string>) =>
  options
    .map((o) => values[o.name])
    .filter(Boolean)
    .join(' / ') || 'Standard'
