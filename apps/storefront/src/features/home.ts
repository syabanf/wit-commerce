import type { Category, Collection, Page, PageSection, Product, Template } from '@rc/types'
import { useMemo } from 'react'
import {
  type Catalog,
  collectionItems,
  featuredCollections,
  isBuyable,
  popularCategories,
  productsIn,
  sellsThroughSales,
  sortProducts,
} from '../lib/catalog'
import { favouriteOf } from '../lib/checkout'
import { usePreviewPageId } from '../lib/embed'
import { firstName } from '../lib/paths'
import { useShop } from '../state/shop'

export interface HomeData {
  /** The published home page, or null when the tenant has not published one (Teknika). */
  page: Page | null
  template: Template | null
  /** Visible sections in template order, footer left to the layout. */
  sections: PageSection[]
  hero: PageSection | null
  heroProduct: Product | null
  bestSellers: Product[]
  newest: Product[]
  /** Picks from the signed-in customer's favourite category; empty for guests, so home shows no repeat rail. */
  recommended: Product[]
  recommendedTitle: string
  categories: { category: Category; count: number }[]
  showcase: { category: Category; products: Product[] }[]
  collections: { collection: Collection; products: Product[] }[]
}

/** Section kinds in the order the page's template lays them out; unknown kinds keep their place at the end. */
function inTemplateOrder(sections: PageSection[], template: Template | null): PageSection[] {
  if (!template) return sections
  const order = template.sections.map((s) => s.kind)
  const rank = (s: PageSection) => {
    const i = order.indexOf(s.kind)
    return i < 0 ? order.length : i
  }
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

const section = (
  id: string,
  kind: PageSection['kind'],
  headline = '',
  body = '',
  ctaLabel = '',
): PageSection => ({
  id: `default-${id}`,
  kind,
  rule: 'optional',
  hidden: false,
  headline,
  body,
  productIds: [],
  ctaLabel,
})

/** A sensible home page from the catalog when the tenant has not published one. */
function defaultSections(catalog: Catalog): PageSection[] {
  const { tenant } = catalog
  return [
    section(
      'hero',
      'hero',
      tenant.brand.tagline,
      `${catalog.products.length} products across ${catalog.topCategories.length} categories, with people who know them.`,
      'Browse the catalog',
    ),
    section('category', 'category'),
    ...(sellsThroughSales(catalog)
      ? [
          section(
            'sales',
            'cta',
            'Need a quote or a site visit?',
            'Our sales engineers size machines, quote spare parts and plan service contracts.',
            'Talk to sales',
          ),
        ]
      : []),
  ]
}

export function useHomeData(): HomeData {
  const { catalog, customer } = useShop()
  const previewId = usePreviewPageId()
  return useMemo(() => {
    const page =
      (previewId && catalog.pages.find((p) => p.id === previewId && p.kind === 'home')) ||
      (catalog.pages.find((p) => p.kind === 'home' && p.status === 'published') ?? null)
    const template = page ? (catalog.templates.find((t) => t.id === page.templateId) ?? null) : null
    const sections = page
      ? inTemplateOrder(
          page.sections.filter((s) => !s.hidden && s.kind !== 'footer'),
          template,
        )
      : defaultSections(catalog)
    const buyable = catalog.products.filter((p) => isBuyable(catalog, p))
    const best = sortProducts(buyable, 'best')
    const first = customer ? firstName(customer.name) : ''
    const favourite = favouriteOf(customer)
    const favouriteProducts = favourite
      ? sortProducts(productsIn(catalog, favourite), 'best').filter((p) => isBuyable(catalog, p))
      : []
    const categories = popularCategories(catalog)
    return {
      page,
      template,
      sections,
      hero: sections.find((s) => s.kind === 'hero') ?? null,
      heroProduct: best[0] ?? catalog.products[0] ?? null,
      bestSellers: best.slice(0, 8),
      newest: sortProducts(catalog.products, 'new').slice(0, 8),
      recommended: favouriteProducts.slice(0, 8),
      recommendedTitle: `Recommended for you, ${first}`,
      categories: categories.map((c) => ({ category: c, count: productsIn(catalog, c.id).length })),
      showcase: categories
        .map((c) => ({ category: c, products: sortProducts(productsIn(catalog, c.id), 'best').slice(0, 8) }))
        .filter((r) => r.products.length >= 4)
        .slice(0, 3),
      collections: featuredCollections(catalog).map((c) => ({
        collection: c,
        products: collectionItems(catalog, c),
      })),
    }
  }, [catalog, customer, previewId])
}
