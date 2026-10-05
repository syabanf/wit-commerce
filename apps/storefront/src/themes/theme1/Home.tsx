import type { HomeData } from '../../features/home'
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
      <ProductTabs />
      {data.showcase.map((row, i) => (
        <ShowcaseRow
          key={row.category.id}
          index={i}
          title={row.category.name}
          description={row.category.description}
          to={paths.category(store, row.category.id)}
          products={row.products}
        />
      ))}
      {data.collections.map((row, i) => (
        <ShowcaseRow
          key={row.collection.id}
          index={data.showcase.length + i}
          title={row.collection.name}
          description={row.collection.description}
          to={paths.collection(store, row.collection.slug)}
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
      <ProductsBlock
        id="recommended-h"
        title={data.recommendedTitle}
        products={data.recommended}
        action={{ label: 'View all', to: paths.search(store, '', { sort: 'best' }) }}
      />
      <Newsletter />
    </div>
  )
}
