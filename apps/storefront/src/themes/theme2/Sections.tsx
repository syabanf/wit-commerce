import { categoryPhoto, nowMs, plural } from '@rc/fixtures'
import type { Category } from '@rc/types'
import { cn } from '@rc/ui'
import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router'
import { CouponCode, PromoValue, Ticket, promoTerms } from '../../components/promo'
import { PRODUCT_LAYOUT, SPACING, TemplateHero, useTemplateLook } from '../../components/templateLook'
import { Countdown } from '../../components/Countdown'
import { Photo } from '../../components/product'
import { SalesBand } from '../../components/SalesBand'
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
import { ButtonLink, buttonClass } from '../../components/ui'
import { currentDeal, popularCategories, productsIn, sellsThroughSales } from '../../lib/catalog'
import { firstName, paths, waLink } from '../../lib/paths'
import { useShop } from '../../state/shop'
import type { SectionsProps } from '../types'
import { ProductGrid, ShowHeading } from './ProductCard'

const CAT_COLS = [
  '',
  'md:grid-cols-1',
  'md:grid-cols-2',
  'md:grid-cols-3',
  'md:grid-cols-4',
  'md:grid-cols-5',
]

/**
 * "Shop by category": a rail of round photos on phones; from md up white bordered tiles, one row for up
 * to five categories; hover gets an accent border.
 */
export function CategoryGrid({ categories }: { categories?: Category[] }) {
  const { catalog, store } = useShop()
  const list = categories ?? popularCategories(catalog)
  const count = (c: Category) => plural(productsIn(catalog, c.id).length, 'product')
  return (
    <section aria-labelledby="cat-grid-h">
      <ShowHeading
        id="cat-grid-h"
        title="Shop by category"
        action={{ label: 'Explore all', to: paths.search(store, '', { sort: 'best' }) }}
      />
      <ul className="-mx-4 px-4 gap-4 scroll-px-4 md:hidden no-scrollbar flex snap-x overflow-x-auto">
        {list.map((c) => (
          <li key={c.id} className="w-20 shrink-0 snap-start">
            <Link to={paths.category(store, c.id)} className="gap-2 flex flex-col items-center text-center">
              <Photo id={categoryPhoto(c.id)} width={160} className="size-20 rounded-full" />
              <span className="text-xs leading-tight font-semibold line-clamp-2">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <ul
        className={cn(
          'gap-3 md:grid hidden',
          list.length > 5 ? 'md:grid-cols-3 lg:grid-cols-5' : CAT_COLS[list.length],
        )}
      >
        {list.map((c) => (
          <li key={c.id}>
            <Link
              to={paths.category(store, c.id)}
              className="min-h-20 gap-3 p-4 lg:flex-row lg:gap-4 lg:text-left flex h-full flex-col items-center rounded-[var(--sf-card-radius)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)] text-center transition hover:border-2 hover:border-[color:var(--sf-accent)]"
            >
              <Photo id={categoryPhoto(c.id)} width={160} className="size-14 shrink-0 rounded-full" />
              <span className="min-w-0">
                <span className="font-bold lg:min-h-0 lg:line-clamp-1 line-clamp-2 block min-h-[2lh]">
                  {c.name}
                </span>
                <span className="text-sm text-[color:var(--sf-muted)]">{count(c)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Countdown to the soonest-ending offer, over a row of the products it covers. */
export function DealsRow() {
  const { catalog, store } = useShop()
  const deal = currentDeal(catalog, nowMs())
  if (!deal) return null
  return (
    <section aria-labelledby="deal-h" className="space-y-5">
      <Ticket
        className="bg-[var(--sf-text)] text-[color:var(--sf-bg)]"
        stub={<PromoValue promotion={deal.promotion} className="text-6xl md:text-7xl" />}
      >
        <div className="gap-6 lg:flex-row lg:items-center lg:justify-between flex flex-col">
          <div className="min-w-0">
            <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-70">Deal of the week</p>
            <h2 id="deal-h" className="sf-title mt-1">
              {deal.promotion.name}
            </h2>
            <p className="mt-2 text-sm opacity-75">{promoTerms(deal.promotion)}</p>
            <div className="mt-4">
              {deal.promotion.trigger === 'code' ? (
                <CouponCode code={deal.promotion.code} />
              ) : (
                <span className="h-11 px-4 text-sm font-bold inline-flex items-center rounded-full border-2 border-current">
                  Applied in your cart
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <p className="mb-2 font-bold text-[11px] tracking-[0.16em] uppercase opacity-70">Ends in</p>
            <Countdown
              endAt={deal.promotion.endAt}
              boxClassName="rounded-[var(--sf-tile-radius)] bg-[var(--sf-bg)] text-[color:var(--sf-text)]"
            />
          </div>
        </div>
      </Ticket>
      <ProductGrid products={deal.products.slice(0, 4)} rail />
      <ButtonLink to={paths.search(store, '', { deals: true })} variant="outline">
        See every offer
      </ButtonLink>
    </section>
  )
}

/** Theme 2 renderer for page sections: two-tone headings, product rails, hairline surfaces on phones. */
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
              <SellerHero key={s.id} section={s} seller={seller} className="md:rounded-b-[64px]" />
            ) : (
              <TemplateHero key={s.id} section={s} />
            )
          case 'category':
            return <CategoryGrid key={s.id} />
          case 'featured_product':
          case 'collection':
            return (
              <section key={s.id} aria-labelledby={`${s.id}-h`}>
                <ShowHeading
                  id={`${s.id}-h`}
                  title={
                    s.headline ||
                    (seller
                      ? `${firstName(seller.name)}'s picks`
                      : s.kind === 'collection'
                        ? 'Our collection'
                        : 'Featured products')
                  }
                  action={{ label: 'Browse all products', to: paths.search(store) }}
                />
                <ProductGrid
                  products={sectionProducts(catalog, s, layout.limit)}
                  rail={layout.rail}
                  className={layout.className}
                />
              </section>
            )
          case 'promotion':
            return <PromoBlock key={s.id} section={s} seller={seller} />
          case 'countdown':
            return <DealsRow key={s.id} />
          case 'testimonials':
            return <Testimonials key={s.id} section={s} Heading={ShowHeading} />
          case 'comparison':
            return <Comparison key={s.id} section={s} Heading={ShowHeading} />
          case 'brand_story':
            return <BrandStory key={s.id} section={s} />
          case 'faq':
            return <Faq key={s.id} section={s} Heading={ShowHeading} />
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
                    className={cn(buttonClass('light', 'lg'))}
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
