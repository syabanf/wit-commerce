/** Where the shopper storefront runs. Each tenant lives under its subdomain path: /lari, /aruna. */
const BASE = (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:5375'

export const STOREFRONT_ORIGIN = new URL(BASE).origin

export const storefrontUrl = (subdomain: string, path = '') => `${BASE}/${subdomain}${path}`
