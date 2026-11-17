// Custom domains: a brand connects a domain it owns, proves it with DNS, and the store opens there.
// The API holds the same rules in internal/modules/identity/domains.go.
import type { Tenant } from '@rc/types'
import { DEFAULT_STORE_ROOT, subdomainHost } from './storeUrl'

/** The TXT record that proves ownership sits at _wit-commerce.{domain}. */
export const DOMAIN_TXT_LABEL = '_wit-commerce'

/** "tokosaya.com" for "www.tokosaya.com": one brand holds a domain with and without www. */
export const bareDomain = (domain: string) => domain.replace(/^www\./, '')

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
/** Endings that never resolve on the public internet. */
const PRIVATE_ENDINGS = [
  'localhost',
  'local',
  'test',
  'example',
  'invalid',
  'internal',
  'lan',
  'home',
  'corp',
  'onion',
  'arpa',
]

/**
 * Why a brand cannot connect this domain, or null when it may. platformHosts are the platform's own
 * addresses: the root that store hosts sit under and the console's host.
 */
export function domainProblem(domain: string, platformHosts: readonly string[] = [DEFAULT_STORE_ROOT]) {
  if (domain !== domain.toLowerCase()) return 'Write the domain in lowercase letters.'
  if (IPV4.test(domain) || domain.includes(':')) return 'Use a domain name, not an IP address or a port.'
  if (domain.length > 253 || !HOSTNAME.test(domain))
    return 'Enter a domain such as www.yourstore.com, without http:// or a path.'
  if (PRIVATE_ENDINGS.includes(domain.slice(domain.lastIndexOf('.') + 1)))
    return 'This domain is not on the public internet.'
  const bare = bareDomain(domain)
  for (const host of platformHosts) {
    const own = bareDomain(host.toLowerCase().replace(/:\d+$/, ''))
    if (own && (bare === own || bare.endsWith(`.${own}`)))
      return 'This address belongs to the platform. Use a domain you own.'
  }
  return null
}

/** Sentences the reducer and the API refuse with. */
export const DOMAIN_TAKEN = 'Another store already uses this domain.'

/** Whether another brand holds the domain, with or without www. */
export const domainTaken = (tenants: readonly Tenant[], tenantId: string, domain: string) =>
  tenants.some((t) => t.id !== tenantId && t.domain && bareDomain(t.domain) === bareDomain(domain))

/** A new ownership token. The API issues its own; the demo makes one in the browser. */
export const newDomainToken = () =>
  `wit-verify-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`

/** One DNS record the brand adds, and after a check what DNS answered for it. */
export interface DomainRecord {
  type: 'TXT' | 'CNAME' | 'A'
  name: string
  value: string
  /** What DNS answered for the name. Only a check fills it. */
  found?: string[]
  /** Whether the answer holds the value. Only a check fills it. */
  ok?: boolean
}

/** A custom domain as the API reports it: the records to add and, after a check, how each one did. */
export interface DomainStatus {
  domain: string | null
  verified: boolean
  verifiedAt?: string
  records: DomainRecord[]
  /** After a check: the TXT record proves ownership. */
  owned?: boolean
  /** After a check: the domain points at the store, by CNAME or by A records. */
  pointed?: boolean
  /** After a failed check: what to fix, as a sentence. */
  detail?: string
}

/** The records a brand adds for its domain: the TXT that proves ownership and the CNAME to its store host. */
export function domainRecords(
  tenant: Pick<Tenant, 'subdomain' | 'domain' | 'domainToken'>,
  root = DEFAULT_STORE_ROOT,
): DomainRecord[] {
  if (!tenant.domain) return []
  return [
    { type: 'TXT', name: `${DOMAIN_TXT_LABEL}.${tenant.domain}`, value: tenant.domainToken ?? '' },
    { type: 'CNAME', name: tenant.domain, value: subdomainHost(tenant, root.replace(/:\d+$/, '')) },
  ]
}
