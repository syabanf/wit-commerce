import type { Page, Tenant } from '@rc/types'

export const PLATFORM_HOST = 'commerceos.id'
export const PLATFORM_IP = '76.76.21.21'

export const platformHost = (tenant: Tenant) => `${tenant.subdomain}.${PLATFORM_HOST}`

/** The host shoppers reach: the custom domain once verified, else the platform subdomain. */
export const primaryHost = (tenant: Tenant) =>
  tenant.domain && tenant.domainVerified ? tenant.domain : platformHost(tenant)

export interface DnsRecord {
  type: 'A' | 'CNAME'
  name: string
  value: string
}

export function dnsRecords(tenant: Tenant): DnsRecord[] {
  return [
    { type: 'A', name: '@', value: PLATFORM_IP },
    { type: 'CNAME', name: 'www', value: platformHost(tenant) },
  ]
}

export interface Redirect {
  from: string
  to: string
  code: 301 | 302
  hits30d: number
}

/** Redirects per tenant. Static until the redirect manager ships. */
export const REDIRECTS: Record<string, Redirect[]> = {
  'ten-lari': [
    { from: '/sale', to: '/running-month', code: 302, hits30d: 1840 },
    { from: '/trail-launch', to: '/summit-ultra', code: 301, hits30d: 312 },
    { from: '/help', to: '/faq', code: 301, hits30d: 96 },
  ],
  'ten-aruna': [
    { from: '/sale', to: '/glow-week', code: 302, hits30d: 2210 },
    { from: '/skincare', to: '/', code: 301, hits30d: 140 },
  ],
  'ten-teknika': [{ from: '/catalog', to: '/', code: 301, hits30d: 58 }],
}

export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 160

export type SeoFlag = { label: string; tone: 'accent' | 'warning' }

export function seoFlags(page: Page): SeoFlag[] {
  const title = page.seo.title.trim()
  const description = page.seo.description.trim()
  const flags: SeoFlag[] = []
  if (!title) flags.push({ label: 'Missing title', tone: 'accent' })
  else if (title.length > TITLE_MAX) flags.push({ label: `Title over ${TITLE_MAX}`, tone: 'warning' })
  if (!description) flags.push({ label: 'No description', tone: 'warning' })
  else if (description.length > DESCRIPTION_MAX)
    flags.push({ label: `Description over ${DESCRIPTION_MAX}`, tone: 'warning' })
  return flags
}
