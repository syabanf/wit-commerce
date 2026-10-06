import { nowMs } from '@rc/fixtures'
import type { HomeData } from '../../features/home'
import { currentDeal, isBuyable } from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'
import {
  BenefitsStrip,
  Newsletter,
  ProductTabs,
  SellersRow,
  UseCases,
  extraSection,
} from '../../components/homeExtras'
import { BrandStory, Testimonials } from '../../components/sections'
import { SPACING, useTemplateLook } from '../../components/templateLook'
import { DealsStrip, OfferBand, ProductsBlock, ShowcaseRow } from './blocks'
import { Sections } from './Sections'
import {
  ConcernTiles,
  ConsultationBand,
  GlowWall,
  IngredientSpotlight,
  RewardsLadder,
  RoutineFinder,
  isBeauty,
} from '../../components/beauty'

/**
 * Theme 1 home: the published page's sections in template order, then the editorial commerce blocks
 * of spec 19: benefits, deals, use cases, product tabs, category and collection rows, the team's
 * personal stores, customer stories, brand story, recommendations and the newsletter.
 */
export function Home({ data }: { data: HomeData }) {
  const { tenant, store, catalog } = useShop()
  const beauty = isBeauty(catalog)
  const look = useTemplateLook()
  const { sections } = data
  const anchor = Math.max(
    sections.findIndex((s) => s.kind === 'category'),
    sections.findIndex((s) => s.kind === 'hero'),
  )
  const head = sections.slice(0, anchor + 1)
  const tail = sections.slice(anchor + 1)
  const story = sections.find((s) => s.kind === 'brand_story')
  const has = (kind: string) => sections.some((s) => s.kind === kind)
  const hasEditorialProducts = sections.some((s) => s.kind === 'featured_product' || s.kind === 'collection')
  // Keep the editor's chosen sections intact; only trim the automatically added product rows.
  const shown = new Set(sections.flatMap((s) => s.productIds))
  if (!has('countdown')) {
    for (const product of currentDeal(catalog, nowMs())?.products ?? []) shown.add(product.id)
  }
  if (!hasEditorialProducts) {
    for (const product of [...catalog.products]
      .filter((p) => isBuyable(catalog, p))
      .sort((a, b) => b.views30d - a.views30d)
      .slice(0, 8))
      shown.add(product.id)
  }
  const supplementalRows: {
    key: string
    title: string
    description: string
    to: string
    products: HomeData['bestSellers']
  }[] = []
  const candidates = [
    ...data.showcase.map((row) => ({
      key: row.category.id,
      title: row.category.name,
      description: row.category.description,
      to: paths.category(store, row.category.id),
      products: row.products,
    })),
    ...data.collections.map((row) => ({
      key: row.collection.id,
      title: row.collection.name,
      description: row.collection.description,
      to: paths.collection(store, row.collection.slug),
      products: row.products,
    })),
  ]
  for (const row of candidates) {
    if (supplementalRows.length === 2) break
    const products = row.products.filter((product) => !shown.has(product.id)).slice(0, 4)
    if (products.length < 3) continue
    supplementalRows.push({ ...row, products })
    for (const product of products) shown.add(product.id)
  }
  const recommended = data.recommended.filter((product) => !shown.has(product.id))
  return (
    <div className={SPACING[look.spacing]} data-template={data.template?.id ?? 'default'}>
      {!data.hero && <h1 className="sr-only">{tenant.name}</h1>}
      <Sections sections={head} />
      <BenefitsStrip />
      {!has('countdown') && <DealsStrip />}
      {beauty && <RoutineFinder />}
      <Sections sections={tail} />
      {beauty ? <ConcernTiles /> : <UseCases />}
      {beauty && <IngredientSpotlight />}
      {!hasEditorialProducts && <ProductTabs />}
      {supplementalRows.map((row, i) => (
        <ShowcaseRow
          key={row.key}
          index={i}
          title={row.title}
          description={row.description}
          to={row.to}
          products={row.products}
        />
      ))}
      {beauty && <ConsultationBand />}
      {beauty && <RewardsLadder />}
      <SellersRow />
      {beauty && <GlowWall />}
      {!beauty && !has('testimonials') && (
        <Testimonials section={extraSection('testimonials', 'Customer stories')} />
      )}
      {!story && <BrandStory section={extraSection('brand_story')} />}
      <OfferBand />
      {recommended.length > 0 && (
        <ProductsBlock
          id="recommended-h"
          title={data.recommendedTitle}
          products={recommended}
          action={{ label: 'Browse all products', to: paths.search(store) }}
        />
      )}
      <Newsletter />
    </div>
  )
}
