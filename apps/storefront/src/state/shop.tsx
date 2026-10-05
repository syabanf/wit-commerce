import { nowMs } from '@rc/fixtures'
import type { AppAction } from '@rc/fixtures'
import type { Customer, Order, Seller, Tenant } from '@rc/types'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { type CartApi, type CartTotals, cartTotals, useCartStore } from '../lib/cart'
import { type Catalog, buildCatalog } from '../lib/catalog'
import { usePersisted } from '../lib/storage'
import { useStore } from './store'

export interface ShopValue {
  catalog: Catalog
  tenant: Tenant
  /** The tenant subdomain, the first URL segment. */
  store: string
  orders: Order[]
  customers: Customer[]
  /** The signed-in demo customer on this device. */
  customer: Customer | null
  signIn: (customerId: string) => void
  signOut: () => void
  /** The seller this visit came through (personal store or ?ref=). */
  referral: Seller | null
  setReferral: (sellerId: string | null) => void
  wishlist: { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => boolean }
  cart: CartApi
  totals: CartTotals
  send: (action: AppAction) => void
}

const ShopContext = createContext<ShopValue | null>(null)

/** The app clock, refreshed every `ms`, for countdowns and promotion windows. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(nowMs)
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMs()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

/** One tenant's storefront: catalog, cart, wishlist, referral and the signed-in customer. */
export function ShopProvider({ tenant, children }: { tenant: Tenant; children: ReactNode }) {
  const { state, send } = useStore()
  const now = useNow()
  const catalog = useMemo(() => buildCatalog(state, tenant), [state, tenant])
  const orders = useMemo(
    () => state.orders.filter((o) => o.tenantId === tenant.id),
    [state.orders, tenant.id],
  )
  const customers = useMemo(
    () => state.customers.filter((c) => c.tenantId === tenant.id),
    [state.customers, tenant.id],
  )
  const [customerId, setCustomerId] = usePersisted<string | null>(
    'local',
    `rc.storefront.account.${tenant.id}`,
    null,
  )
  const [referralId, setReferral] = usePersisted<string | null>(
    'session',
    `rc.storefront.ref.${tenant.id}`,
    null,
  )
  const [wishIds, , updateWish] = usePersisted<string[]>('local', `rc.storefront.wishlist.${tenant.id}`, [])
  const cart = useCartStore(tenant.id)

  const customer = customers.find((c) => c.id === customerId) ?? null
  const referral = catalog.sellers.find((s) => s.id === referralId && s.status === 'active') ?? null
  const totals = useMemo(
    () => cartTotals(catalog, cart.cart, referral?.id ?? null, now),
    [catalog, cart.cart, referral, now],
  )

  const value = useMemo<ShopValue>(() => {
    const ids = Array.isArray(wishIds) ? wishIds : []
    return {
      catalog,
      tenant,
      store: tenant.subdomain,
      orders,
      customers,
      customer,
      signIn: (id) => setCustomerId(id),
      signOut: () => setCustomerId(null),
      referral,
      setReferral,
      wishlist: {
        ids,
        has: (id) => ids.includes(id),
        toggle: (id) => {
          const adding = !ids.includes(id)
          updateWish((list) =>
            adding ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id),
          )
          return adding
        },
      },
      cart,
      totals,
      send,
    }
  }, [
    catalog,
    tenant,
    orders,
    customers,
    customer,
    setCustomerId,
    referral,
    setReferral,
    wishIds,
    updateWish,
    cart,
    totals,
    send,
  ])

  return <ShopContext value={value}>{children}</ShopContext>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used inside ShopProvider')
  return ctx
}
