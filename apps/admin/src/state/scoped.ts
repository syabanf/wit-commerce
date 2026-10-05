import { type AppAction, nowIso, nowMs, segmentContext, stockByProduct } from '@rc/fixtures'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/auth'
import { useStore } from './store'

/** The store plus a dispatch that stamps the signed-in user and the app clock on every action. */
export function useAppState() {
  const { state, send } = useStore()
  const { user } = useAuth()
  const by = user?.id ?? 'system'
  const dispatch = useCallback(
    (action: AppAction) => send({ action, meta: { by, at: nowIso() } }),
    [send, by],
  )
  return { state, dispatch }
}

const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((x) => [x.id, x]))

/** Everything a page needs for the current tenant, memoised on the store state. */
export function useScoped() {
  const { state, dispatch } = useAppState()
  const { user, tenant } = useAuth()
  if (!user || !tenant) throw new Error('useScoped needs a signed-in user')
  const tenantId = tenant.id

  return useMemo(() => {
    const own = <T extends { tenantId: string }>(list: readonly T[]) =>
      list.filter((x) => x.tenantId === tenantId)
    const products = own(state.products)
    const orders = own(state.orders)
    const customers = own(state.customers)
    const customerEvents = own(state.customerEvents)
    const sellers = own(state.sellers)
    const stock = own(state.stock)
    const maps = {
      user: byId(state.users),
      seller: byId(state.sellers),
      template: byId(state.templates),
      page: byId(state.pages),
      category: byId(state.categories),
      attribute: byId(state.attributes),
      collection: byId(state.collections),
      product: byId(state.products),
      variant: new Map(
        state.products.flatMap((p) => p.variants.map((v) => [v.id, { ...v, productId: p.id }] as const)),
      ),
      warehouse: byId(state.warehouses),
      customer: byId(state.customers),
      order: byId(state.orders),
      segment: byId(state.segments),
      lead: byId(state.leads),
      ticket: byId(state.tickets),
      campaign: byId(state.campaigns),
      automation: byId(state.automations),
      promotion: byId(state.promotions),
      paymentType: byId(state.paymentTypes),
      integration: byId(state.integrations),
    }
    return {
      user,
      tenant,
      tenantId,
      state,
      dispatch,
      products,
      orders,
      customers,
      customerEvents,
      sellers,
      stock,
      stockMoves: own(state.stockMoves),
      stockByProduct: stockByProduct(stock),
      /** Order count, spend and cart state per customer, as segment rules read them. */
      crm: segmentContext(orders, products, customerEvents),
      categories: own(state.categories),
      attributes: own(state.attributes),
      modifiers: own(state.modifiers),
      collections: own(state.collections),
      warehouses: own(state.warehouses),
      pages: own(state.pages),
      // Global templates plus the tenant's own.
      templates: state.templates.filter((t) => t.tenantId === null || t.tenantId === tenantId),
      segments: own(state.segments),
      leads: own(state.leads),
      tickets: own(state.tickets),
      campaigns: own(state.campaigns),
      automations: own(state.automations),
      promotions: own(state.promotions),
      paymentTypes: own(state.paymentTypes).sort((a, b) => a.sort - b.sort),
      integrations: own(state.integrations),
      integrationLogs: own(state.integrationLogs),
      traffic: own(state.traffic),
      searchTerms: own(state.searchTerms),
      users: state.users.filter((u) => u.role === 'platform_admin' || u.tenantIds.includes(tenantId)),
      maps,
      /** "Andi Pratama", "System" for jobs, "Unassigned" for null. */
      userName: (id: string | null | undefined) =>
        id === 'system' ? 'System' : id ? (maps.user.get(id)?.name ?? 'Unknown') : 'Unassigned',
      productName: (id: string | null | undefined) =>
        id ? (maps.product.get(id)?.name ?? 'Removed product') : 'None',
      categoryName: (id: string | null | undefined) =>
        id ? (maps.category.get(id)?.name ?? 'Uncategorised') : 'None',
      customerName: (id: string | null | undefined) =>
        id ? (maps.customer.get(id)?.name ?? 'Removed customer') : 'None',
      sellerName: (id: string | null | undefined) =>
        id ? (maps.seller.get(id)?.name ?? 'Removed seller') : 'Direct',
      segmentName: (id: string | null | undefined) =>
        id ? (maps.segment.get(id)?.name ?? 'Removed segment') : 'No audience',
    }
  }, [state, tenantId, tenant, user, dispatch])
}

export type Scoped = ReturnType<typeof useScoped>

/** Re-renders on an interval so "x ago" labels move. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(nowMs)
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMs()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
