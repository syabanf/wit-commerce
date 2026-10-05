import { describePromotion } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { useMemo, useState } from 'react'
import type { CartItem, CartTotals } from '../lib/cart'
import { CHEAPEST_FEE } from '../lib/checkout'
import { isBuyable } from '../lib/catalog'
import { useShop } from '../state/shop'

export interface CartView {
  items: CartItem[]
  totals: CartTotals
  setQty: (key: string, qty: number) => void
  remove: (item: CartItem) => void
  voucher: {
    input: string
    setInput: (value: string) => void
    apply: () => void
    remove: () => void
    /** The code in the cart, applied or not. */
    code: string | null
    error: string | null
  }
  /** Shipping estimate: free, or the cheapest courier. */
  shipping: number
  total: number
  /** "5% off when you pay with QRIS". */
  paymentHints: string[]
  crossSell: Product[]
}

export function useCartView(): CartView {
  const { catalog, cart, totals } = useShop()
  const [input, setInput] = useState(cart.cart.voucher ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const shipping = totals.freeShipping ? 0 : CHEAPEST_FEE
  const crossSell = useMemo(() => {
    const inCart = new Set(totals.items.map((i) => i.product.id))
    const cats = new Set(totals.items.map((i) => i.product.categoryId))
    const pool = catalog.products.filter((p) => !inCart.has(p.id) && isBuyable(catalog, p))
    return pool
      .sort(
        (a, b) => Number(cats.has(b.categoryId)) - Number(cats.has(a.categoryId)) || b.views30d - a.views30d,
      )
      .slice(0, 4)
  }, [catalog, totals.items])
  const paymentName = (id: string) =>
    catalog.paymentTypes.find((t) => t.id === id)?.name ?? 'another payment type'
  return {
    items: totals.items,
    totals,
    setQty: cart.setQty,
    remove: (item) => cart.remove(item.line.key),
    voucher: {
      input,
      setInput: (v) => {
        setInput(v)
        setLocalError(null)
      },
      apply: () => {
        const code = input.trim().toUpperCase()
        if (!code) {
          setLocalError('Enter a voucher code, such as the one in your welcome email.')
          return
        }
        cart.setVoucher(code)
      },
      remove: () => {
        cart.setVoucher(null)
        setInput('')
      },
      code: cart.cart.voucher,
      error: localError ?? (cart.cart.voucher ? totals.codeError : null),
    },
    shipping,
    total: Math.max(0, totals.subtotal - totals.discount + shipping),
    paymentHints: totals.paymentOffers.map((p) => describePromotion(p, paymentName)),
    crossSell,
  }
}
