import type { Tenant } from '@rc/types'

/** The parent domain of every brand's store host in production: lari.commerce.reddie.id. */
export const DEFAULT_STORE_ROOT = 'commerce.reddie.id'

/** The parent domain in development, where Chrome resolves lari.localhost to this machine. */
export const DEV_STORE_ROOT = 'localhost:5375'

/** "lari.commerce.reddie.id": the host of a brand's store under the root domain. */
export const storeHost = (tenant: Pick<Tenant, 'subdomain'>, root = DEFAULT_STORE_ROOT) =>
  `${tenant.subdomain}.${root}`

/** "https://lari.commerce.reddie.id", or plain http for a localhost root in development. */
export const storeOrigin = (tenant: Pick<Tenant, 'subdomain'>, root = DEFAULT_STORE_ROOT) =>
  `${root.includes('localhost') ? 'http' : 'https'}://${storeHost(tenant, root)}`
