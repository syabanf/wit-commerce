import { nowMs } from '@rc/fixtures'
import type { AppAction } from '@rc/fixtures'
import type { Customer, Order, Seller, Tenant } from '@rc/types'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { type CartApi, type CartTotals, cartTotals, useCartStore } from '../lib/cart'
import { HTTP, api, setCurrentTenant, shopperToken } from '../lib/api'
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
  /** Signs in as a customer; the API answers with their account and orders. */
  signIn: (customerId: string) => Promise<void>
  signOut: () => void
  /** The seller this visit came through (personal store or ?ref=). */
  referral: Seller | null
  setReferral: (sellerId: string | null) => void
  wishlist: { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => boolean }
  cart: CartApi
  totals: CartTotals
  /** Dispatches a store action; in API mode it resolves once the server answered, or rejects. */
  send: (action: AppAction) => Promise<void>
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
  const { state, send, loadStore, merge } = useStore()
  const now = useNow()
  // API mode: this store's dataset and event stream, and the token requests carry.
  useEffect(() => {
    if (!HTTP) return
    setCurrentTenant(tenant.id)
    const stop = loadStore(tenant.subdomain, tenant.id)
    return () => {
      stop()
      setCurrentTenant(null)
    }
  }, [tenant.id, tenant.subdomain, loadStore])
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
  // API mode: a stored shopper token restores the account and its orders after a reload.
  useEffect(() => {
    if (!HTTP || !customerId || !shopperToken(tenant.id).get()) return
    let cancelled = false
    api.shop
      .me(tenant.subdomain)
      .then(({ customer: me, orders: mine }) => {
        if (cancelled) return
        merge({
          customers: [...state.customers.filter((c) => c.id !== me.id), me],
          orders: [...state.orders.filter((o) => o.customerId !== me.id), ...mine],
        })
      })
      .catch(() => {
        shopperToken(tenant.id).set(null)
        setCustomerId(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in shopper
  }, [customerId, tenant.id])
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
      signIn: async (id) => {
        if (HTTP && !shopperToken(tenant.id).get()) {
          const { token } = await api.shop.signIn(tenant.subdomain, id)
          shopperToken(tenant.id).set(token)
        }
        setCustomerId(id)
      },
      signOut: () => {
        if (HTTP) shopperToken(tenant.id).set(null)
        setCustomerId(null)
      },
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
