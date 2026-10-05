import { type AppAction, customerMetrics, nowIso, nowMs, toMs } from '@rc/fixtures'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/auth'
import { useStore } from './store'

const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((x) => [x.id, x]))
const newest =
  <T,>(at: (x: T) => string) =>
  (a: T, b: T) =>
    toMs(at(b)) - toMs(at(a))

/**
 * The signed-in seller's slice of the store: their tenant, personal page, leads, customers,
 * attributed orders and traffic, the tenant's products, and a dispatch stamped with the user.
 */
function useScopeValue() {
  const { state, send } = useStore()
  const { user, seller, tenant } = useAuth()
  if (!user || !seller || !tenant) throw new Error('SellerScopeProvider needs a signed-in seller')
  const userId = user.id
  const dispatch = useCallback(
    (action: AppAction) => send({ action, meta: { by: userId, at: nowIso() } }),
    [send, userId],
  )

  return useMemo(() => {
    const own = <T extends { tenantId: string }>(list: readonly T[]) =>
      list.filter((x) => x.tenantId === tenant.id)
    const allProducts = own(state.products)
    const tenantOrders = own(state.orders)
    const tenantCustomers = own(state.customers)
    const customers = tenantCustomers
      .filter((c) => c.sellerId === seller.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    const customerIds = new Set(customers.map((c) => c.id))
    const maps = {
      product: byId(allProducts),
      customer: byId(tenantCustomers),
      template: byId(state.templates),
    }
    const host = (tenant.domain ?? `${tenant.subdomain}.commerceos.id`).replace(/^www\./, '')
    const storeUrl = `${host}/${seller.slug}`
    return {
      user,
      seller,
      tenant,
      dispatch,
      storeUrl,
      storeHref: `https://${storeUrl}`,
      page: state.pages.find((p) => p.sellerId === seller.id) ?? null,
      leads: own(state.leads)
        .filter((l) => l.sellerId === seller.id)
        .sort(newest((l) => l.updatedAt)),
      /** Every lead code, so a new lead gets the next free one. */
      leadCodes: state.leads.map((l) => l.code),
      customers,
      /** Orders attributed to this seller's store or ref links, newest first. */
      orders: tenantOrders.filter((o) => o.sellerId === seller.id).sort(newest((o) => o.createdAt)),
      /** Every order of this seller's customers, wherever they bought, newest first. */
      customerOrders: tenantOrders
        .filter((o) => customerIds.has(o.customerId))
        .sort(newest((o) => o.createdAt)),
      customerEvents: state.customerEvents
        .filter((e) => customerIds.has(e.customerId))
        .sort(newest((e) => e.at)),
      metrics: customerMetrics(
        tenantOrders.filter((o) => customerIds.has(o.customerId)),
        (productId) => maps.product.get(productId)?.categoryId,
      ),
      traffic: state.traffic.filter((t) => t.sellerId === seller.id),
      /** Products a seller can feature, recommend or log a lead for. */
      products: allProducts.filter((p) => p.status === 'active'),
      /** Personal-store templates: the global library plus the tenant's own. */
      templates: state.templates.filter(
        (t) => t.scope === 'personal' && (t.tenantId === null || t.tenantId === tenant.id),
      ),
      maps,
      productName: (id: string | null | undefined) =>
        id ? (maps.product.get(id)?.name ?? 'Removed product') : 'No product',
      customerName: (id: string) => maps.customer.get(id)?.name ?? 'Removed customer',
      /** True for customers assigned to this seller, the ones whose record opens here. */
      isMine: (customerId: string) => customerIds.has(customerId),
    }
  }, [state, user, seller, tenant, dispatch])
}

export type SellerScope = ReturnType<typeof useScopeValue>

const ScopeContext = createContext<SellerScope | null>(null)

/** Builds the scope once per store change and shares it, so list cards do not rebuild every lookup. */
export function SellerScopeProvider({ children }: { children: ReactNode }) {
  const value = useScopeValue()
  return <ScopeContext value={value}>{children}</ScopeContext>
}

export function useSellerScope(): SellerScope {
  const ctx = useContext(ScopeContext)
  if (!ctx) throw new Error('useSellerScope must be used inside SellerScopeProvider')
  return ctx
}

/** Re-renders on an interval so "x ago" labels move. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(nowMs)
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMs()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
