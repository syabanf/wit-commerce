import { MessageCircle } from 'lucide-react'
import {
  BrandStory,
  Comparison,
  CtaBand,
  Faq,
  PromoBlock,
  SellerHero,
  Testimonials,
  sectionProducts,
} from '../../components/sections'
import { SalesBand } from '../../components/SalesBand'
import { PRODUCT_LAYOUT, SPACING, TemplateHero, useTemplateLook } from '../../components/templateLook'
import { ButtonLink, buttonClass } from '../../components/ui'
import { sellsThroughSales } from '../../lib/catalog'
import { firstName, paths, waLink } from '../../lib/paths'
import { useShop } from '../../state/shop'
import type { SectionsProps } from '../types'
import { CategoryTiles, DealsStrip, EditorialChips, HeroRow, ProductsBlock } from './blocks'

/** Theme 1 renderer for a page's sections, in the order the page and its template set. */
export function Sections({ sections, seller }: SectionsProps) {
  const { catalog, store } = useShop()
  const look = useTemplateLook()
  const layout = PRODUCT_LAYOUT[look.products]
  return (
    <div className={SPACING[look.spacing]}>
      {sections.map((s) => {
        switch (s.kind) {
          case 'hero':
            return seller ? (
              <SellerHero key={s.id} section={s} seller={seller} />
            ) : look.hero === 'theme' ? (
              <HeroRow key={s.id} section={s} />
            ) : (
              <TemplateHero key={s.id} section={s} />
            )
          case 'category':
            return (
              <div key={s.id} className="space-y-6 md:space-y-8">
                <CategoryTiles />
                <EditorialChips section={s} />
              </div>
            )
          case 'featured_product':
          case 'collection':
            return (
              <ProductsBlock
                key={s.id}
                id={`${s.id}-h`}
                title={s.headline || (seller ? `${firstName(seller.name)}'s picks` : 'Featured products')}
                products={sectionProducts(catalog, s, layout.limit)}
                rail={layout.rail}
                gridClassName={layout.className}
                action={{ label: 'View all', to: paths.search(store, '', { sort: 'best' }) }}
              />
            )
          case 'promotion':
            return <PromoBlock key={s.id} section={s} seller={seller} />
          case 'countdown':
            return <DealsStrip key={s.id} />
          case 'testimonials':
            return <Testimonials key={s.id} section={s} />
          case 'comparison':
            return <Comparison key={s.id} section={s} />
          case 'brand_story':
            return <BrandStory key={s.id} section={s} />
          case 'faq':
            return <Faq key={s.id} section={s} />
          case 'cta':
            return seller ? (
              <CtaBand
                key={s.id}
                section={s}
                action={
                  <a
                    href={waLink(seller.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass('light', 'lg')}
                  >
                    <MessageCircle aria-hidden="true" />
                    {s.ctaLabel || 'Message me'}
                    <span className="sr-only"> on WhatsApp (opens WhatsApp)</span>
                  </a>
                }
              />
            ) : sellsThroughSales(catalog) ? (
              <SalesBand key={s.id} section={s} />
            ) : (
              <CtaBand
                key={s.id}
                section={s}
                action={
                  <ButtonLink to={paths.search(store, '', { sort: 'best' })} variant="light" size="lg">
                    {s.ctaLabel || 'Shop best sellers'}
                  </ButtonLink>
                }
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
