import { DEFAULT_STORE_ROOT, DEV_STORE_ROOT, customDomain, storeHost, storeOrigin } from '@rc/fixtures'
import type { Tenant } from '@rc/types'

/** The parent domain of store hosts, VITE_STORE_ROOT_DOMAIN. Development defaults to localhost:5375. */
const ROOT =
  (import.meta.env.VITE_STORE_ROOT_DOMAIN as string | undefined)?.trim() ||
  (import.meta.env.DEV ? DEV_STORE_ROOT : '')

/** Without a root, every store lives under one storefront address by path: {VITE_STOREFRONT_URL}/lari. */
const SINGLE_HOST = (import.meta.env.VITE_STOREFRONT_URL as string | undefined) ?? 'http://localhost:5375'

/** The domain store hosts sit under, for DNS records. */
export const STORE_ROOT = ROOT || DEFAULT_STORE_ROOT

/** Whether stores have their own hosts. Custom domains need it, since they serve the host build. */
export const STORE_HOSTS = ROOT !== ''

type StoreTenant = Pick<Tenant, 'subdomain'> &
  Partial<Pick<Tenant, 'domain' | 'domainVerified' | 'domainVerifiedAt'>>

/** "www.tokosaya.com" once verified, else "lari.commerce.reddie.id": the store address shoppers type. */
export const storeAddress = (tenant: StoreTenant) =>
  customDomain(tenant) ??
  (ROOT ? storeHost(tenant, ROOT) : `${SINGLE_HOST.replace(/^https?:\/\//, '')}/${tenant.subdomain}`)

/**
 * The store's home page, or another page of it: storefrontUrl(tenant, '/p/prd-1'). A tenant opens on
 * its verified custom domain; a bare subdomain always opens on the platform host, as previews need.
 */
export const storefrontUrl = (tenant: string | StoreTenant, path = '') => {
  const t = typeof tenant === 'string' ? { subdomain: tenant } : tenant
  if (customDomain(t)) return `${storeOrigin(t)}${path || '/'}`
  return ROOT
    ? `${storeOrigin({ subdomain: t.subdomain }, ROOT)}${path || '/'}`
    : `${SINGLE_HOST}/${t.subdomain}${path}`
}

/** The origin the store's page runs on, for postMessage. */
export const storefrontOrigin = (subdomain: string) => new URL(storefrontUrl(subdomain)).origin
