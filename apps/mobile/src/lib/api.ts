import { createApi, createTokenStore } from '@rc/api'

/**
 * The API lives behind VITE_API_URL ("/api" in production). Without it the seller app runs on its
 * bundled fixtures and the local reducer.
 */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || null
export const HTTP = API_URL !== null

/** The shared password of every demo account; the API seeds it from DEMO_PASSWORD. */
export const DEMO_PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) || 'commerce-demo'

export const tokenStore = createTokenStore('rc.mobile.token')
export const api = createApi({ baseUrl: API_URL ?? '/api', getToken: tokenStore.get })
