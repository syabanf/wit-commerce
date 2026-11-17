import { DEV_STORE_ROOT, storeOrigin } from '@rc/fixtures'

/**
 * The store whose host this is: "lari" for lari.commerce.reddie.id under the root commerce.reddie.id.
 * Ports are ignored. The bare root, www and deeper names are no store, so they give null.
 */
export function resolveStore(hostname: string, root: string | null): string | null {
  if (!root) return null
  const host = hostname.toLowerCase().replace(/:\d+$/, '')
  const suffix = `.${root.toLowerCase().replace(/:\d+$/, '')}`
  if (!host.endsWith(suffix)) return null
  const label = host.slice(0, -suffix.length)
  return label && label !== 'www' && !label.includes('.') ? label : null
}

/** Where an old path URL lives on its store host: /lari/p/1 becomes https://lari.{root}/p/1. Null for the hub at /. */
export function storeHostUrl(path: string, root: string): string | null {
  const [, store, ...rest] = path.split('/')
  if (!store || !/^[a-z0-9-]+$/.test(store)) return null
  return `${storeOrigin({ subdomain: store }, root)}/${rest.join('/')}`
}

// Read with ?. so Node can load this file in the unit tests, where import.meta.env does not exist.
const env = import.meta.env as ImportMetaEnv | undefined

/** The parent domain of store hosts. Development defaults to localhost:5375; a build without it stays on paths. */
export const STORE_ROOT: string | null =
  (env?.VITE_STORE_ROOT_DOMAIN as string | undefined)?.trim() || (env?.DEV ? DEV_STORE_ROOT : null)

/**
 * The host to look up as a brand's own domain, or null. Only a build served at the root (the store
 * host build) runs on custom domains; the platform's own names, localhost and IP addresses never do.
 */
export function customDomainHost(hostname: string, root: string | null, base = '/'): string | null {
  if (!root || base !== '/') return null
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const own = root.toLowerCase().replace(/:\d+$/, '')
  if (host === own || host.endsWith(`.${own}`)) return null
  if (host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':'))
    return null
  return host.includes('.') ? host : null
}

/**
 * The store this host serves. Null means path mode: /{store}/... under one host. A store host sets it
 * at load; main.tsx sets it for a custom domain before the routes load, so it never changes after.
 */
export let HOST_STORE: string | null =
  typeof window === 'undefined' ? null : resolveStore(window.location.hostname, STORE_ROOT)

export const setHostStore = (store: string) => {
  HOST_STORE = store
}
