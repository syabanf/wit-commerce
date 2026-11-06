import { nowMs } from '@rc/fixtures'
import type { AppAction } from '@rc/fixtures'
import type { Customer, Order, Seller, Tenant } from '@rc/types'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { type CartApi, type CartTotals, cartTotals, useCartStore } from '../lib/cart'
import { ApiError, type Delta, type PaymentLink, type ShopperResponse } from '@rc/api'
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
  /** API mode: signs in with a password. Resolves to an error sentence, or null when in. */
  signInWithPassword: (email: string, password: string) => Promise<string | null>
  /** API mode: creates an account and signs in. Resolves to an error sentence, or null when in. */
  register: (input: {
    name: string
    email: string
    phone: string
    password: string
  }) => Promise<string | null>
  /** API mode: whether the signed-in shopper can sign in on another device. */
  hasPassword: boolean
  /** API mode: the shopper's inbox is proven, and this deployment can send a link to prove it. */
  emailVerified: boolean
  emailOn: boolean
  /** API mode: reads the account and its orders again. */
  reloadAccount: () => void
  /** API mode: sets or changes the password. Resolves to an error sentence, or null when done. */
  setPassword: (currentPassword: string, newPassword: string) => Promise<string | null>
  signOut: () => void
  /** The seller this visit came through (personal store or ?ref=). */
  referral: Seller | null
  setReferral: (sellerId: string | null) => void
  wishlist: { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => boolean }
  cart: CartApi
  totals: CartTotals
  /** Dispatches a store action; in API mode it resolves to the server's answer, or rejects. */
  send: (action: AppAction) => Promise<Delta | null>
  /** API mode: whether a provider collects this payment type online, on its own page. */
  paysOnline: (paymentTypeId?: string | null) => boolean
  /** API mode: the payment pages of the shopper's orders still waiting for payment, by order id. */
  payments: Record<string, PaymentLink>
}

const ShopContext = createContext<ShopValue | null>(null)

/** The app clock, refreshed every `ms`, for countdowns and promotion windows. */
const failure = (err: unknown) =>
  err instanceof ApiError ? err.message : 'The store did not answer. Try again in a moment.'

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
  const { state, send, loadStore, merge, onlinePayments } = useStore()
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
  const [hasPassword, setHasPassword] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailOn, setEmailOn] = useState(false)
  const [accountVersion, setAccountVersion] = useState(0)
  const [payments, setPayments] = useState<Record<string, PaymentLink>>({})
  // API mode: a stored shopper token restores the account and its orders after a reload.
  useEffect(() => {
    if (!HTTP || !customerId || !shopperToken(tenant.id).get()) return
    let cancelled = false
    api.shop
      .me(tenant.subdomain)
      .then(
        ({
          customer: me,
          orders: mine,
          payments: links,
          hasPassword: stored,
          emailVerified: proven,
          emailOn: canSend,
        }) => {
          if (cancelled) return
          setPayments(links ?? {})
          setHasPassword(stored)
          setEmailVerified(proven)
          setEmailOn(canSend)
          merge({
            customers: [...state.customers.filter((c) => c.id !== me.id), me],
            orders: [...state.orders.filter((o) => o.customerId !== me.id), ...mine],
          })
        },
      )
      .catch(() => {
        shopperToken(tenant.id).set(null)
        setCustomerId(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in shopper
  }, [customerId, tenant.id, accountVersion])
  const referral = catalog.sellers.find((s) => s.id === referralId && s.status === 'active') ?? null
  const totals = useMemo(
    () => cartTotals(catalog, cart.cart, referral?.id ?? null, now),
    [catalog, cart.cart, referral, now],
  )

  const value = useMemo<ShopValue>(() => {
    const ids = Array.isArray(wishIds) ? wishIds : []
    const enterAccount = async (request: () => Promise<ShopperResponse>) => {
      try {
        const { token, customer: me } = await request()
        shopperToken(tenant.id).set(token)
        merge({ customers: [...state.customers.filter((c) => c.id !== me.id), me] })
        setCustomerId(me.id)
        return null
      } catch (err) {
        return failure(err)
      }
    }
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
      signInWithPassword: (email, password) =>
        enterAccount(() => api.shop.login(tenant.subdomain, email, password)),
      register: (input) => enterAccount(() => api.shop.register(tenant.subdomain, input)),
      hasPassword,
      emailVerified,
      emailOn,
      reloadAccount: () => setAccountVersion((v) => v + 1),
      setPassword: async (currentPassword, newPassword) => {
        try {
          const { token } = await api.shop.setPassword(tenant.subdomain, currentPassword, newPassword)
          shopperToken(tenant.id).set(token)
          setHasPassword(true)
          return null
        } catch (err) {
          return failure(err)
        }
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
      paysOnline: (id) => !!id && onlinePayments.includes(id),
      payments,
    }
  }, [
    catalog,
    tenant,
    orders,
    customers,
    customer,
    setCustomerId,
    hasPassword,
    emailVerified,
    emailOn,
    merge,
    state.customers,
    referral,
    setReferral,
    wishIds,
    updateWish,
    cart,
    totals,
    send,
    onlinePayments,
    payments,
  ])

  return <ShopContext value={value}>{children}</ShopContext>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop must be used inside ShopProvider')
  return ctx
}
