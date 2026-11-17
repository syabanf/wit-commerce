import type { Tenant } from '@rc/types'

/** The parent domain of every brand's store host in production: lari.commerce.reddie.id. */
export const DEFAULT_STORE_ROOT = 'commerce.reddie.id'

/** The parent domain in development, where Chrome resolves lari.localhost to this machine. */
export const DEV_STORE_ROOT = 'localhost:5375'

type Subdomain = Pick<Tenant, 'subdomain'>
type DomainFields = Partial<Pick<Tenant, 'domain' | 'domainVerified' | 'domainVerifiedAt'>>

/**
 * The brand's own domain once DNS proved it is theirs, else null. A domain without a verified time
 * (the seeded ones) was never checked, so it is not served or linked to.
 */
export const customDomain = (tenant: DomainFields) =>
  tenant.domain && tenant.domainVerified && tenant.domainVerifiedAt ? tenant.domain : null

/** "lari.commerce.reddie.id": the host every store has under the root domain. */
export const subdomainHost = (tenant: Subdomain, root = DEFAULT_STORE_ROOT) => `${tenant.subdomain}.${root}`

/** "https://lari.commerce.reddie.id", or plain http for a localhost root in development. */
export const subdomainOrigin = (tenant: Subdomain, root = DEFAULT_STORE_ROOT) =>
  `${root.includes('localhost') ? 'http' : 'https'}://${subdomainHost(tenant, root)}`

/** The host shoppers reach: the verified custom domain, else the store's host under the root. */
export const storeHost = (tenant: Subdomain & DomainFields, root = DEFAULT_STORE_ROOT) =>
  customDomain(tenant) ?? subdomainHost(tenant, root)

/** Where links to the store point: "https://www.tokosaya.com" once verified, else the subdomain origin. */
export const storeOrigin = (tenant: Subdomain & DomainFields, root = DEFAULT_STORE_ROOT) => {
  const custom = customDomain(tenant)
  return custom ? `https://${custom}` : subdomainOrigin(tenant, root)
}
