import { newId } from '@rc/fixtures'
import type { Page, PageKind, PageSection, Seller, Template, TemplateScope, Tenant } from '@rc/types'

/** Kinds a new page may start as. Home, product and personal pages come from elsewhere. */
export const NEW_PAGE_KINDS: PageKind[] = ['landing', 'campaign', 'about', 'faq', 'collection']

/** Campaign templates serve landing and campaign pages, personal ones serve seller stores, store templates the rest. */
export function scopeForKind(kind: PageKind): TemplateScope {
  if (kind === 'personal') return 'personal'
  return kind === 'landing' || kind === 'campaign' ? 'campaign' : 'store'
}

/** Templates a page may switch to: the right scope and, for a seller, only the ones the tenant allowed. */
export function templatesFor(
  page: Page,
  templates: readonly Template[],
  seller: Seller | null | undefined,
): Template[] {
  const scope = page.sellerId ? 'personal' : scopeForKind(page.kind)
  return templates.filter(
    (t) => t.scope === scope && (!page.sellerId || !seller || seller.allowedTemplateIds.includes(t.id)),
  )
}

/** Sections of a new page. The hero takes the page title so the draft can be published right away. */
export function sectionsFromTemplate(template: Template, title: string): PageSection[] {
  return template.sections.map(({ kind, rule }) => ({
    id: newId('sec'),
    kind,
    rule,
    hidden: false,
    headline: kind === 'hero' || kind === 'cta' ? title : '',
    body: '',
    productIds: [],
    ctaLabel: kind === 'hero' || kind === 'cta' ? 'Shop now' : '',
  }))
}

export const liveUrl = (tenant: Tenant, slug: string) =>
  `https://${tenant.domain && tenant.domainVerified ? tenant.domain : `${tenant.subdomain}.commerceos.id`}${slug === '/' ? '' : slug}`
