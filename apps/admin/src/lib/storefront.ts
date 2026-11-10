import { DEFAULT_STORE_ROOT, DEV_STORE_ROOT, storeHost, storeOrigin } from '@rc/fixtures'
import type { Tenant } from '@rc/types'

/** The parent domain of store hosts, VITE_STORE_ROOT_DOMAIN. Development defaults to localhost:5375. */
const ROOT =
  (import.meta.env.VITE_STORE_ROOT_DOMAIN as string | undefined)?.trim() ||
  (import.meta.env.DEV ? DEV_STORE_ROOT : '')

/** Without a root, every store lives under one storefront address by path: {VITE_STOREFRONT_URL}/lari. */
const SINGLE_HOST = (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:5375'

/** The domain store hosts sit under, for DNS records. */
export const STORE_ROOT = ROOT || DEFAULT_STORE_ROOT

/** "lari.commerce.reddie.id": the store address shoppers type. */
export const storeAddress = (tenant: Pick<Tenant, 'subdomain'>) =>
  ROOT ? storeHost(tenant, ROOT) : `${SINGLE_HOST.replace(/^https?:\/\//, '')}/${tenant.subdomain}`

/** The store's home page, or another page of it: storefrontUrl('lari', '/p/prd-1'). */
export const storefrontUrl = (subdomain: string, path = '') =>
  ROOT ? `${storeOrigin({ subdomain }, ROOT)}${path || '/'}` : `${SINGLE_HOST}/${subdomain}${path}`

/** The origin the store's page runs on, for postMessage. */
export const storefrontOrigin = (subdomain: string) => new URL(storefrontUrl(subdomain)).origin
