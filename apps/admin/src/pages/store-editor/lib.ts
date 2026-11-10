import { newId, slugify } from '@rc/fixtures'
import type { Page, PageKind, PageSection, SectionKind, Template, TemplateScope, Tenant } from '@rc/types'
import type { LucideIcon } from 'lucide-react'
import {
  BadgePercent,
  BookOpen,
  Columns2,
  Image,
  LayoutGrid,
  Megaphone,
  MessageCircleQuestion,
  PanelBottom,
  Quote,
  ShoppingBag,
  Tags,
  Timer,
} from 'lucide-react'

/** What the editor calls each section kind, in words a store owner uses. */
export const SECTION_COPY: Record<SectionKind, { label: string; icon: LucideIcon; blurb: string }> = {
  hero: { label: 'Big banner', icon: Image, blurb: 'A large photo with your headline and a button.' },
  category: { label: 'Shop by category', icon: Tags, blurb: 'Your categories as tiles, filled in for you.' },
  featured_product: {
    label: 'Product grid',
    icon: ShoppingBag,
    blurb: 'Products you pick, or your best sellers.',
  },
  collection: { label: 'Product collection', icon: LayoutGrid, blurb: 'A longer list of products you pick.' },
  promotion: { label: 'Promo code', icon: BadgePercent, blurb: 'A code shoppers can add to their cart.' },
  countdown: { label: 'Deal countdown', icon: Timer, blurb: 'A timer for your offer that ends soonest.' },
  testimonials: { label: 'Customer reviews', icon: Quote, blurb: 'Kind words from your customers.' },
  comparison: { label: 'Compare products', icon: Columns2, blurb: 'Two products side by side.' },
  brand_story: { label: 'About us', icon: BookOpen, blurb: 'Your story with a photo.' },
  faq: { label: 'Questions and answers', icon: MessageCircleQuestion, blurb: 'Answers shoppers look for.' },
  cta: { label: 'Call to action', icon: Megaphone, blurb: 'A bold band with one button.' },
  footer: { label: 'Footer', icon: PanelBottom, blurb: 'The bottom of every page.' },
}

/** Sections the "Add section" menu offers, most useful first. */
export const ADDABLE: SectionKind[] = [
  'hero',
  'featured_product',
  'faq',
  'testimonials',
  'cta',
  'brand_story',
  'category',
  'collection',
  'comparison',
  'countdown',
  'promotion',
]

export type Field = 'headline' | 'body' | 'button' | 'image' | 'products' | 'items'

/** How the items list names its rows: "Questions", each with a Question and an Answer. */
export interface ItemWords {
  heading: string
  title: string
  body: string
  add: string
}

/** The form fields each kind shows, and how the form names its text. */
export const SECTION_FORM: Record<
  SectionKind,
  { fields: Field[]; headline?: string; body?: string; items?: ItemWords; note?: string }
> = {
  hero: { fields: ['headline', 'body', 'button', 'image'] },
  category: { fields: [], note: 'This section lists your categories by itself.' },
  featured_product: {
    fields: ['headline', 'products'],
    note: 'Leave the products empty to show your best sellers.',
  },
  collection: {
    fields: ['headline', 'products'],
    note: 'Leave the products empty to show your best sellers.',
  },
  promotion: {
    fields: ['headline', 'body'],
    headline: 'Promo code',
    body: 'What the code gives',
    note: 'When the code matches one of your promotions, its terms show too.',
  },
  countdown: {
    fields: [],
    note: 'This section shows your offer that ends soonest. Create offers in Promotions.',
  },
  testimonials: {
    fields: ['headline', 'body', 'items'],
    items: { heading: 'Reviews', title: 'What they said', body: 'Their name', add: 'Add a review' },
    note: 'Until you add reviews, the section shows sample ones for your kind of store.',
  },
  comparison: { fields: ['headline', 'products'], note: 'Pick two products.' },
  brand_story: { fields: ['headline', 'body', 'image'] },
  faq: {
    fields: ['headline', 'items'],
    items: { heading: 'Questions', title: 'Question', body: 'Answer', add: 'Add a question' },
    note: 'Until you add questions, the section answers delivery, returns and payment for you.',
  },
  cta: { fields: ['headline', 'body', 'button'] },
  footer: { fields: [], note: 'The footer comes from your brand settings.' },
}

/** A new section of a kind, with copy that reads well before the owner changes it. */
export function newSection(kind: SectionKind, tenant: Pick<Tenant, 'name' | 'brand'>): PageSection {
  const copy: Partial<Record<SectionKind, Pick<PageSection, 'headline' | 'body' | 'ctaLabel'>>> = {
    hero: { headline: tenant.brand.tagline || `Welcome to ${tenant.name}`, body: '', ctaLabel: 'Shop now' },
    featured_product: { headline: 'Featured products', body: '', ctaLabel: '' },
    collection: { headline: 'Our collection', body: '', ctaLabel: '' },
    testimonials: { headline: 'What customers say', body: '', ctaLabel: '' },
    comparison: { headline: 'Compare', body: '', ctaLabel: '' },
    brand_story: { headline: `About ${tenant.name}`, body: tenant.brand.tagline, ctaLabel: '' },
    faq: { headline: 'Questions', body: '', ctaLabel: '' },
    cta: { headline: 'Ready to order?', body: '', ctaLabel: 'Shop now' },
  }
  return {
    id: newId('sec'),
    kind,
    rule: 'optional',
    hidden: false,
    headline: '',
    body: '',
    productIds: [],
    ctaLabel: '',
    ...copy[kind],
  }
}

/** Numbers every section by its place, so the storefront keeps the order the owner set. */
export const withOrder = (sections: readonly PageSection[]): PageSection[] =>
  sections.map((s, order) => (s.order === order ? s : { ...s, order }))

/** Why a section cannot move, hide or go, or null when it can. */
export function sectionLocks(section: PageSection) {
  const locked = section.rule === 'locked' ? 'Your layout keeps this section in place.' : null
  const required =
    section.rule === 'required' ? 'Your layout needs this section, so it stays on the page.' : null
  return { move: locked, hide: locked ?? required, remove: locked ?? required }
}

/**
 * Moves a section from its place to another place among the sections the list shows (every one but
 * the footer). Locked sections neither move nor give up their place.
 */
export function moveSection(sections: readonly PageSection[], id: string, to: number): PageSection[] {
  const listed = sections.filter((s) => s.kind !== 'footer')
  const from = listed.findIndex((s) => s.id === id)
  const target = Math.max(0, Math.min(listed.length - 1, to))
  if (from < 0 || from === target || listed[from]!.rule === 'locked') return [...sections]
  const [lo, hi] = from < target ? [from, target] : [target, from]
  if (listed.slice(lo, hi + 1).some((s) => s.rule === 'locked')) return [...sections]
  const next = [...listed]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved!)
  return [...next, ...sections.filter((s) => s.kind === 'footer')]
}

/** Adds a section after `afterId`, or at the end before the footer. */
export function insertSection(
  sections: readonly PageSection[],
  section: PageSection,
  afterId: string | null,
) {
  const at = afterId ? sections.findIndex((s) => s.id === afterId) + 1 : 0
  const footer = sections.findIndex((s) => s.kind === 'footer')
  const index = at > 0 ? at : footer >= 0 ? footer : sections.length
  return [...sections.slice(0, index), section, ...sections.slice(index)]
}

/** Search listing text: what the owner typed, else the store name and tagline. */
export function seoFor(page: Page, tenant: Pick<Tenant, 'name' | 'brand'>): Page['seo'] {
  return {
    title: page.seo.title.trim() || (page.kind === 'home' ? tenant.name : `${page.title} · ${tenant.name}`),
    description: page.seo.description.trim() || tenant.brand.tagline,
  }
}

/** Pages the owner may add from the editor, with the section their template should carry. */
export const NEW_PAGES: {
  kind: PageKind
  label: string
  title: string
  needs: SectionKind
  blurb: string
}[] = [
  {
    kind: 'about',
    label: 'About',
    title: 'About us',
    needs: 'brand_story',
    blurb: 'Your story and your team.',
  },
  { kind: 'faq', label: 'FAQ', title: 'Questions', needs: 'faq', blurb: 'Answers to common questions.' },
  { kind: 'landing', label: 'Landing', title: 'New arrivals', needs: 'cta', blurb: 'One product or launch.' },
  {
    kind: 'campaign',
    label: 'Campaign',
    title: 'Big sale',
    needs: 'promotion',
    blurb: 'A sale with a code.',
  },
]

const scopeFor = (kind: PageKind): TemplateScope =>
  kind === 'landing' || kind === 'campaign' ? 'campaign' : 'store'

/** The template a new page starts from: one of the right scope that carries the section the page is for. */
export function templateForNewPage(kind: PageKind, templates: readonly Template[]): Template | null {
  const needs = NEW_PAGES.find((p) => p.kind === kind)?.needs
  const fits = templates.filter((t) => t.scope === scopeFor(kind))
  return fits.find((t) => t.sections.some((s) => s.kind === needs)) ?? fits[0] ?? null
}

/** Store paths a page may not take: the storefront's own routes. */
const RESERVED = new Set([
  'c',
  'p',
  'search',
  'cart',
  'checkout',
  'order',
  'account',
  'wishlist',
  'collections',
  'preview',
  'agent',
])

/** A free address for a new page: "/about", then "/about-2" when that is taken. */
export function freeSlug(title: string, taken: ReadonlySet<string>): string {
  const base = slugify(title) || 'page'
  let slug = RESERVED.has(base) ? `${base}-page` : base
  for (let n = 2; taken.has(`/${slug}`); n++) slug = `${base}-${n}`
  return `/${slug}`
}
