import type { PageSection, PageSectionItem, Template } from '@rc/types'

/**
 * A page's sections in the order shoppers see them. Once the owner arranges the page by hand every
 * section carries `order`, and that order wins. A page nobody has arranged keeps its template's order;
 * kinds the template does not list go last, in their own order.
 */
export function sectionsInOrder(sections: readonly PageSection[], template: Template | null): PageSection[] {
  if (sections.some((s) => s.order !== undefined)) {
    const at = (s: PageSection) => s.order ?? Number.MAX_SAFE_INTEGER
    return [...sections].sort((a, b) => at(a) - at(b))
  }
  if (!template) return [...sections]
  const kinds = template.sections.map((s) => s.kind)
  const rank = (s: PageSection) => {
    const i = kinds.indexOf(s.kind)
    return i < 0 ? kinds.length : i
  }
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

/** The section's own questions or quotes with a title, or null when it has none and the defaults apply. */
export function sectionItems(section: Pick<PageSection, 'items'>): PageSectionItem[] | null {
  const items = (section.items ?? [])
    .map((i) => ({ title: i.title.trim(), body: i.body.trim() }))
    .filter((i) => i.title)
  return items.length ? items : null
}

/** True for a full web link; store paths start with "/". */
export const isExternalHref = (href: string) => /^https?:\/\//i.test(href)

/**
 * Where a section button points: a full link as is, a store path under the store's base ("" on a
 * store host, "/lari" on a single host), or null when the section names nowhere valid.
 */
export function sectionHref(base: string, href: string | undefined): string | null {
  const value = href?.trim()
  if (!value) return null
  if (isExternalHref(value)) return value
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return `${base}${value}` || '/'
}
