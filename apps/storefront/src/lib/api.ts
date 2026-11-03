import { createApi, createTokenStore } from '@rc/api'

/**
 * The API lives behind VITE_API_URL ("/api" in production). Without it the storefront runs on its
 * bundled fixtures and the local reducer.
 */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || null
export const HTTP = API_URL !== null

/** One shopper token per store on this device. */
const stores = new Map<string, ReturnType<typeof createTokenStore>>()
export function shopperToken(tenantId: string) {
  let store = stores.get(tenantId)
  if (!store) {
    store = createTokenStore(`rc.storefront.token.${tenantId}`)
    stores.set(tenantId, store)
  }
  return store
}

/** The store whose token requests carry; ShopProvider sets it for the store on screen. */
let currentTenantId: string | null = null
export const setCurrentTenant = (tenantId: string | null) => {
  currentTenantId = tenantId
}

export const api = createApi({
  baseUrl: API_URL ?? '/api',
  getToken: () => (currentTenantId ? shopperToken(currentTenantId).get() : null),
})
