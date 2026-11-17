import { subdomainHost } from '@rc/fixtures'
import type { Page, Tenant } from '@rc/types'
import { STORE_ROOT, storeAddress } from '../../lib/storefront'

/** The store's host under the platform root, which keeps working next to a custom domain. */
export const platformHost = (tenant: Tenant) => subdomainHost(tenant, STORE_ROOT)

/** The host shoppers reach: the custom domain once verified, else the platform address. */
export const primaryHost = (tenant: Tenant) => storeAddress(tenant)

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
