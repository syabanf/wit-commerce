import { categoryPhoto, fmtIdrShort, plural, productPhoto } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Flame, ShieldCheck, ShoppingBag, Star, Truck, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Stamp, Underlined } from '../../components/ornaments'
import { Photo, ProductImage, useQuickAdd } from '../../components/product'
import {
  BenefitsStrip,
  Newsletter,
  ProductTabs,
  SellersRow,
  UseCases,
  extraSection,
} from '../../components/homeExtras'
import { BrandStory, RAIL, Testimonials } from '../../components/sections'
import { SPACING, TemplateHero, useTemplateLook } from '../../components/templateLook'
import { Button, ButtonLink } from '../../components/ui'
import type { HomeData } from '../../features/home'
import { tint } from '../../lib/brand'
import { paths } from '../../lib/paths'
import { useIsPhone } from '../../lib/useIsPhone'
import { useShop } from '../../state/shop'
import { ProductGrid, ShowHeading } from './ProductCard'
import { CategoryGrid, DealsRow, Sections } from './Sections'
import {
  ConcernTiles,
  ConsultationBand,
  GlowWall,
  IngredientSpotlight,
  RewardsLadder,
  RoutineFinder,
  isBeauty,
} from '../../components/beauty'

function FloatChip({
  icon,
  title,
  text,
  className,
}: {
  icon: ReactNode
  title: string
  text: string
  className?: string
}) {
  return (
    <p
      className={cn(
        'gap-3 rounded-2xl py-2.5 pr-4 pl-2.5 absolute flex items-center bg-[var(--sf-bg)] shadow-float',
        className,
      )}
    >
      <span className="size-9 [&_svg]:size-4 flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-accent)] text-[color:var(--sf-on-accent)]">
        {icon}
      </span>
      <span className="text-xs leading-tight">
        <span className="font-bold block">{title}</span>
        <span className="text-[color:var(--sf-muted)]">{text}</span>
      </span>
    </p>
  )
}

/** Desktop hero (Belanja): an inset tinted panel under the floating navbar, headline, two CTAs and chips inside the photo. */
function Hero({ data, product, main }: { data: HomeData; product: Product | null; main: boolean }) {
  const Title = main ? 'h1' : 'p'
  const { tenant, store, catalog } = useShop()
  const quickAdd = useQuickAdd()
  const headline = data.hero?.headline || tenant.brand.tagline
  const warranty =
    product && catalog.attributes.find((a) => /warranty/i.test(a.name) && product.attributes[a.id])
  return (
    <section
      aria-label="Featured"
      className="mx-4 px-6 pt-32 pb-14 md:mx-6 lg:mx-10 lg:px-10 md:block hidden rounded-[var(--sf-card-radius)]"
      style={{ background: tint('--sf-primary', 10) }}
    >
      <div className="gap-10 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center">
        <div className="min-w-0">
          <p className="min-h-9 gap-2 px-4 text-sm font-semibold inline-flex max-w-full items-center rounded-full bg-[var(--sf-bg)]">
            <Flame className="size-4 shrink-0 text-[color:var(--sf-accent)]" aria-hidden="true" />
            <span className="truncate">Most popular at {tenant.name}</span>
          </p>
          <Title className="sf-hero-title mt-5">
            <Underlined text={headline} />
          </Title>
          <p className="mt-4 max-w-md text-lg text-[color:var(--sf-muted)]">
            {data.hero?.body || tenant.brand.tagline}
          </p>
          {product && (
            <div className="mt-8 gap-3 flex flex-wrap">
              <Button size="lg" onClick={() => quickAdd(product)}>
                <ShoppingBag aria-hidden="true" />
                {product.assisted ? 'Talk to sales' : 'Add to cart'}
              </Button>
              <ButtonLink to={paths.product(store, product.id)} variant="light" size="lg">
                View details
              </ButtonLink>
            </div>
          )}
        </div>
        {product && (
          <div className="relative w-full max-w-[720px] justify-self-end">
            <Link
              to={paths.product(store, product.id)}
              aria-label={`${product.name}, view details`}
              className="block"
            >
              <ProductImage
                product={product}
                size="lg"
                strength={26}
                className="aspect-square rounded-[48px]"
              />
            </Link>
            <Stamp
              text={`${tenant.name} · since ${tenant.createdAt.slice(0, 4)} · `}
              className="top-4 right-4 size-20 lg:top-6 lg:right-6 lg:size-24 absolute"
            />
            <FloatChip
              className="top-4 left-4 lg:top-6 lg:left-6"
              icon={warranty ? <ShieldCheck aria-hidden="true" /> : <Star aria-hidden="true" />}
              title={warranty ? 'Includes warranty' : `Rated ${product.rating.toFixed(1)} of 5`}
              text={
                warranty
                  ? `${product.attributes[warranty.id]} ${warranty.unit ?? ''}`.trim()
                  : `from ${product.reviewCount} reviews`
              }
            />
            <FloatChip
              className="right-4 bottom-24 lg:right-6 lg:flex hidden"
              icon={<Truck aria-hidden="true" />}
              title="Free shipping"
              text={`over ${fmtIdrShort(tenant.loyalty.freeShippingMin)}`}
            />
            <FloatChip
              className="bottom-4 left-4 lg:bottom-6 lg:left-6"
              icon={<Wallet aria-hidden="true" />}
              title="Pay your way"
              text={`${catalog.paymentTypes.filter((t) => t.enabled).length} payment options`}
            />
          </div>
        )}
      </div>
    </section>
  )
}

/** Phone shop screen (Klubhaus): "Shop Products", a cart button, category tabs with counts. */
function PhoneShop({ data, main }: { data: HomeData; main: boolean }) {
  const { store, cart } = useShop()
  const Title = main ? 'h1' : 'h2'
  return (
    <section aria-labelledby="phone-shop-h" className="px-4 pt-5 md:hidden">
      <div className="gap-3 flex items-center justify-between">
        <Title id="phone-shop-h" className="sf-display text-4xl">
          Shop <span className="text-[color:var(--sf-muted)]">Products</span>
        </Title>
        <Link
          to={paths.cart(store)}
          aria-label={`Cart, ${cart.count} items`}
          className="size-12 relative inline-flex items-center justify-center rounded-full bg-[var(--sf-text)] text-[color:var(--sf-bg)]"
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
        </Link>
      </div>
      <nav
        aria-label="Categories"
        className="mt-4 gap-5 no-scrollbar flex overflow-x-auto border-b border-[color:var(--sf-line)] whitespace-nowrap"
      >
        <span
          aria-current="page"
          className="min-h-11 text-sm font-bold inline-flex items-center border-b-2 border-[color:var(--sf-text)]"
        >
          All
        </span>
        {data.categories.map(({ category, count }) => (
          <Link
            key={category.id}
            to={paths.category(store, category.id)}
            className="min-h-11 text-sm inline-flex items-center text-[color:var(--sf-muted)]"
          >
            {category.name}
            <sup className="ml-0.5 text-[10px]">{count}</sup>
          </Link>
        ))}
      </nav>
      <ProductGrid products={data.bestSellers.slice(0, 6)} className="mt-5" />
    </section>
  )
}

const MD_COLS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3']

/** Featured collections as photo cards, one row; a single collection is left to the category links. */
function Collections({ collections }: { collections: HomeData['collections'] }) {
  const { store } = useShop()
  if (collections.length < 2) return null
  const shown = collections.slice(0, 3)
  return (
    <section aria-labelledby="collections-h">
      <ShowHeading id="collections-h" title="Popular collections" />
      <ul className={cn(RAIL, 'md:mx-0 md:px-0 md:grid md:overflow-visible', MD_COLS[shown.length])}>
        {shown.map(({ collection, products }) => {
          const first = products[0]
          return (
            <li key={collection.id} className="md:w-auto w-[72%] shrink-0 snap-start">
              <Link to={paths.collection(store, collection.slug)} className="group block">
                <Photo
                  id={first && (productPhoto(first.id) ?? categoryPhoto(first.categoryId))}
                  width={640}
                  ratio={0.75}
                  className="md:aspect-[2/1] 2xl:aspect-[3/1] aspect-[4/3] rounded-[var(--sf-card-radius)]"
                />
                <span className="sf-display mt-3 text-lg font-bold block group-hover:underline">
                  {collection.name}
                </span>
                <span className="text-sm text-[color:var(--sf-muted)]">
                  {plural(products.length, 'product')}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function Home({ data }: { data: HomeData }) {
  const { catalog } = useShop()
  const isPhone = useIsPhone()
  const beauty = isBeauty(catalog)
  const look = useTemplateLook()
  const templateHero = look.hero !== 'theme' ? data.hero : null
  // Beauty homes show customer quotes once, in the GlowWall.
  const sections = data.sections.filter((s) => s.kind !== 'hero' && !(beauty && s.kind === 'testimonials'))
  const has = (kind: string) => sections.some((s) => s.kind === kind)
  return (
    <div data-template={data.template?.id ?? 'default'}>
      {templateHero ? (
        <div className="px-4 pt-4 md:px-6 md:pt-28 lg:px-10">
          <TemplateHero section={templateHero} />
        </div>
      ) : (
        <Hero data={data} product={data.heroProduct} main={!isPhone} />
      )}
      <PhoneShop data={data} main={isPhone && !templateHero} />
      <div className={cn('mt-12 px-4 md:mt-16 md:px-6 lg:px-10', SPACING[look.spacing])}>
        <BenefitsStrip />
        {!has('category') && <CategoryGrid />}
        {beauty && <RoutineFinder Heading={ShowHeading} />}
        <Sections sections={sections} />
        {beauty && <ConcernTiles Heading={ShowHeading} />}
        {!has('countdown') && <DealsRow />}
        {beauty ? <IngredientSpotlight Heading={ShowHeading} /> : <UseCases Heading={ShowHeading} />}
        <Collections collections={data.collections} />
        {/* Phones already lead with the best-seller grid in PhoneShop. */}
        <div className="md:block hidden">
          <ProductTabs Heading={ShowHeading} />
        </div>
        {beauty && <ConsultationBand />}
        {beauty && <RewardsLadder Heading={ShowHeading} />}
        <SellersRow Heading={ShowHeading} />
        {beauty && <GlowWall Heading={ShowHeading} />}
        {!beauty && !has('testimonials') && (
          <Testimonials section={extraSection('testimonials', 'Customer stories')} Heading={ShowHeading} />
        )}
        {!has('brand_story') && <BrandStory section={extraSection('brand_story')} />}
        {data.recommended.length > 0 && (
          <section aria-labelledby="rec-h">
            <ShowHeading id="rec-h" title={data.recommendedTitle} />
            <ProductGrid products={data.recommended} rail />
          </section>
        )}
        <Newsletter />
      </div>
    </div>
  )
}
