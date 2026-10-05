import { type CartPrice, priceCart } from '@rc/fixtures'
import type { ModifierOption, Product, Variant } from '@rc/types'
import { useMemo } from 'react'
import type { Catalog } from './catalog'
import { usePersisted } from './storage'

export interface CartChoice {
  groupId: string
  optionId: string
}

export interface CartLine {
  key: string
  productId: string
  variantId: string
  qty: number
  modifiers: CartChoice[]
}

export interface CartState {
  lines: CartLine[]
  voucher: string | null
}

const EMPTY: CartState = { lines: [], voucher: null }
export const MAX_QTY = 99

/** Same product, variant and add-ons share a line. */
export const lineKey = (productId: string, variantId: string, modifiers: readonly CartChoice[]) =>
  [productId, variantId, ...modifiers.map((m) => m.optionId).sort()].join('|')

function clean(value: CartState): CartState {
  if (!value || !Array.isArray(value.lines)) return EMPTY
  return {
    lines: value.lines.filter((l) => l && typeof l.productId === 'string' && l.qty > 0),
    voucher: typeof value.voucher === 'string' ? value.voucher : null,
  }
}

export interface CartApi {
  cart: CartState
  count: number
  add: (line: Omit<CartLine, 'key'>) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  setVoucher: (code: string | null) => void
  clear: () => void
}

/** The tenant's cart in localStorage, so it survives reloads and a later visit. */
export function useCartStore(tenantId: string): CartApi {
  const [raw, set, update] = usePersisted<CartState>('local', `rc.storefront.cart.${tenantId}`, EMPTY)
  return useMemo(() => {
    const cart = clean(raw)
    const edit = (fn: (c: CartState) => CartState) => update((c) => fn(clean(c)))
    return {
      cart,
      count: cart.lines.reduce((n, l) => n + l.qty, 0),
      add: (line) =>
        edit((c) => {
          const key = lineKey(line.productId, line.variantId, line.modifiers)
          const existing = c.lines.find((l) => l.key === key)
          return {
            ...c,
            lines: existing
              ? c.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + line.qty) } : l))
              : [...c.lines, { ...line, key }],
          }
        }),
      setQty: (key, qty) =>
        edit((c) => ({
          ...c,
          lines: c.lines.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : l)),
        })),
      remove: (key) => edit((c) => ({ ...c, lines: c.lines.filter((l) => l.key !== key) })),
      setVoucher: (code) => edit((c) => ({ ...c, voucher: code })),
      clear: () => set(null),
    }
  }, [raw, set, update])
}

// --- pricing ---

export interface PricedModifier {
  groupId: string
  groupName: string
  optionId: string
  name: string
  priceDelta: number
}

export interface CartItem {
  line: CartLine
  product: Product
  variant: Variant
  modifiers: PricedModifier[]
  /** Unit price, add-ons included. */
  unit: number
  total: number
}

export function priceItem(catalog: Catalog, line: CartLine): CartItem | null {
  const product = catalog.productMap.get(line.productId)
  const variant = product?.variants.find((v) => v.id === line.variantId)
  if (!product || !variant || product.status !== 'active') return null
  const modifiers: PricedModifier[] = []
  for (const choice of line.modifiers) {
    const group = catalog.modifiers.find((g) => g.id === choice.groupId)
    const option: ModifierOption | undefined = group?.options.find((o) => o.id === choice.optionId)
    if (group && option)
      modifiers.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
      })
  }
  const unit = variant.price + modifiers.reduce((n, m) => n + m.priceDelta, 0)
  return { line, product, variant, modifiers, unit, total: unit * line.qty }
}

export interface CartTotals extends CartPrice {
  items: CartItem[]
  count: number
  /** The typed code, upper-cased, when it applied. */
  appliedCode: string | null
  /** Spend still needed for free shipping; 0 once reached. */
  freeShippingGap: number
}

/**
 * Prices every line from the live catalog through the shared pricing engine: automatic promotions,
 * the typed code and, from the payment step on, offers tied to the chosen payment type.
 */
export function cartTotals(
  catalog: Catalog,
  cart: CartState,
  sellerId: string | null,
  now: number,
  paymentTypeId: string | null = null,
): CartTotals {
  const items = cart.lines.map((l) => priceItem(catalog, l)).filter((l): l is CartItem => !!l)
  const price = priceCart({
    lines: items.map((i) => ({
      productId: i.product.id,
      categoryId: i.product.categoryId,
      qty: i.line.qty,
      unitPrice: i.unit,
    })),
    promotions: catalog.promotions.filter((p) => !p.segmentId),
    categories: catalog.categories,
    code: cart.voucher,
    paymentTypeId,
    sellerId,
    now,
  })
  const min = catalog.tenant.loyalty.freeShippingMin
  const freeShipping = price.freeShipping || price.subtotal >= min
  return {
    ...price,
    freeShipping,
    items,
    count: items.reduce((n, i) => n + i.line.qty, 0),
    appliedCode: cart.voucher && !price.codeError ? cart.voucher.trim().toUpperCase() : null,
    freeShippingGap: freeShipping ? 0 : Math.max(0, min - price.subtotal),
  }
}
