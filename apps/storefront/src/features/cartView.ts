import { addedTax } from '@rc/fixtures'
import type { OrderTax, Product } from '@rc/types'
import { useMemo, useState } from 'react'
import { t } from '../i18n'
import { codeErrorText, describePromotion } from '../i18n/format'
import type { CartItem, CartTotals } from '../lib/cart'
import { cartTax, defaultCourierFor } from '../lib/checkout'
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
  /** The cart's PPN when the brand is a PKP. */
  tax: OrderTax | undefined
  total: number
  /** "5% off when you pay with QRIS". */
  paymentHints: string[]
  crossSell: Product[]
}

export function useCartView(): CartView {
  const { catalog, cart, totals, tenant } = useShop()
  const [input, setInput] = useState(cart.cart.voucher ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const shipping = totals.freeShipping ? 0 : defaultCourierFor(tenant).fee
  const tax = useMemo(() => cartTax(tenant, totals), [tenant, totals])
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
    catalog.paymentTypes.find((p) => p.id === id)?.name ?? t('checkout.voucher.otherPayment')
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
          setLocalError(t('checkout.voucher.enterCode'))
          return
        }
        cart.setVoucher(code)
      },
      remove: () => {
        cart.setVoucher(null)
        setInput('')
      },
      code: cart.cart.voucher,
      error: localError ?? (cart.cart.voucher && totals.codeError ? codeErrorText(totals.codeError) : null),
    },
    shipping,
    tax,
    total: Math.max(0, totals.subtotal - totals.discount + addedTax(tax) + shipping),
    paymentHints: totals.paymentOffers.map((p) => describePromotion(p, paymentName)),
    crossSell,
  }
}
