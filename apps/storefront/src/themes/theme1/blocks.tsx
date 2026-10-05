import { categoryPhoto, fmtIdr, fmtIdrShort, nowMs, tenantPhotos } from '@rc/fixtures'
import type { Category, PageSection, Product } from '@rc/types'
import { cn } from '@rc/ui'
import { ArrowUpRight, ChevronLeft, ChevronRight, Gift, Truck } from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { Link } from 'react-router'
import { Countdown } from '../../components/Countdown'
import { CategoryIcon, Photo, ProductImage } from '../../components/product'
import { Sparkle, Stamp, Sticker, Underlined } from '../../components/ornaments'
import { CouponCode, PromoValue, Ticket, promoTerms } from '../../components/promo'
import { type HeadingProps, PlainHeading, RAIL } from '../../components/sections'
import { AccountGlyph, isVipCustomer, offerText } from '../../components/shell'
import { ButtonLink, IconButton, Scroller } from '../../components/ui'
import { tint } from '../../lib/brand'
import {
  currentDeal,
  popularCategories,
  productsIn,
  runningPromotions,
  welcomePromotion,
} from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'
import { CompactCell, ProductGrid } from './ProductCard'

const glow = `radial-gradient(circle at 85% 15%, ${tint('--sf-accent', 45)}, transparent 55%), radial-gradient(circle at 10% 95%, ${tint('--sf-primary', 30)}, transparent 60%), ${tint('--sf-primary', 10)}` // wit-allow: tenant storefront theme glow from the client references

/** Hero row: category list, a tinted banner with the page headline, and a welcome card with two offer tiles. */
export function HeroRow({ section }: { section: PageSection }) {
  const { catalog, store, customer, tenant } = useShop()
  const now = nowMs()
  const categories = popularCategories(catalog)
  const product = [...catalog.products].filter((p) => !p.assisted).sort((a, b) => b.views30d - a.views30d)[0]
  const welcome = welcomePromotion(catalog, now)
  const shopTo = categories[0] ? paths.category(store, categories[0].id) : paths.search(store)
  return (
    <section
      aria-label="Featured"
      className="gap-4 lg:grid-cols-[220px_minmax(0,1fr)_260px] grid grid-cols-1"
    >
      <nav aria-label="Top categories" className="sf-card p-2 lg:block hidden">
        <ul className="space-y-1">
          {categories.slice(0, 7).map((c, i) => (
            <li key={c.id}>
              <Link
                to={paths.category(store, c.id)}
                className={cn(
                  'min-h-11 gap-3 rounded-2xl px-3 text-sm font-semibold flex items-center hover:bg-[var(--sf-soft)]',
                  i === 0 && 'text-[color:var(--sf-primary)]',
                )}
                style={i === 0 ? { background: tint('--sf-primary', 10) } : undefined}
              >
                <CategoryIcon category={c} className="size-4" />
                <span className="truncate">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div
        className="p-4 md:min-h-[380px] md:p-10 md:flex-row relative flex flex-col overflow-hidden rounded-[var(--sf-tile-radius)]"
        style={{ background: glow }}
      >
        <Photo
          id={tenantPhotos(tenant.id)?.hero}
          width={960}
          ratio={0.8}
          eager
          className="md:absolute md:inset-y-0 md:right-0 md:aspect-auto md:w-[46%] md:rounded-none aspect-[16/10] rounded-[var(--sf-tile-radius)]"
        />
        <Stamp
          text={`${tenant.name} · since ${tenant.createdAt.slice(0, 4)} · `}
          className="top-6 right-6 size-24 md:top-8 md:right-auto md:left-[calc(54%_+_1.5rem)] lg:size-28 absolute z-10"
        />
        <div className="max-w-lg pt-5 pb-2 md:p-0 md:max-w-[50%] relative z-10 flex flex-col justify-center">
          <p className="sf-kicker gap-1.5 flex items-center">
            <Sparkle className="size-3.5" />
            Fresh in this week
          </p>
          <h1 className="sf-hero-title mt-3">
            <Underlined text={section.headline || tenant.brand.tagline} />
          </h1>
          {section.body && (
            <p className="mt-4 max-w-sm text-sm md:text-base text-[color:var(--sf-muted)]">{section.body}</p>
          )}
          <div className="mt-6">
            <ButtonLink to={shopTo} variant="dark" size="lg">
              {section.ctaLabel || 'Shop now'}
            </ButtonLink>
          </div>
        </div>
        {product && (
          <Link
            to={paths.product(store, product.id)}
            className="right-6 bottom-6 w-44 p-2 md:block xl:w-52 absolute z-10 hidden rounded-[var(--sf-tile-radius)] bg-[var(--sf-bg)] shadow-float"
          >
            <Sticker tilt="right" className="-top-3 left-3 absolute z-10">
              Staff pick
            </Sticker>
            <ProductImage product={product} className="aspect-square rounded-[var(--sf-tile-radius)]" />
            <span className="mt-2 px-1 text-sm font-bold block truncate">{product.name}</span>
            <span className="px-1 pb-1 text-xs block text-[color:var(--sf-muted)]">
              {fmtIdr(product.price)}
            </span>
          </Link>
        )}
      </div>
      <div className="gap-3 lg:flex hidden flex-col">
        <div className="p-4 rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
          <div className="gap-3 flex items-center">
            <span className="size-11 flex items-center justify-center rounded-full bg-[var(--sf-bg)]">
              <AccountGlyph className={customer ? 'size-11 text-sm' : ''} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{customer ? `Hi, welcome back` : 'Join and get offers'}</p>
              <p className="text-xs line-clamp-2 text-[color:var(--sf-muted)]">
                {customer
                  ? `${customer.name} · ${customer.points} points`
                  : 'Members earn points on every order.'}
              </p>
            </div>
          </div>
          <div className="mt-3 gap-2 grid grid-cols-2">
            {customer ? (
              <>
                <ButtonLink to={paths.account(store)} variant="dark" size="sm">
                  Orders
                </ButtonLink>
                <ButtonLink
                  to={paths.wishlist(store)}
                  variant="outline"
                  size="sm"
                  className="bg-[var(--sf-bg)]"
                >
                  Wishlist
                </ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink to={paths.account(store)} variant="dark" size="sm">
                  Sign in
                </ButtonLink>
                <ButtonLink
                  to={paths.account(store)}
                  variant="outline"
                  size="sm"
                  className="bg-[var(--sf-bg)]"
                >
                  Join
                </ButtonLink>
              </>
            )}
          </div>
        </div>
        <OfferTile tone="accent" icon={<Gift aria-hidden="true" />}>
          {customer && isVipCustomer(customer)
            ? 'Early access to new arrivals for members'
            : welcome
              ? `Get ${offerText(welcome)} your first order with ${welcome.code}`
              : 'Members earn points on every order'}
        </OfferTile>
        <OfferTile tone="primary" icon={<Truck aria-hidden="true" />}>
          Free shipping on orders from {fmtIdrShort(tenant.loyalty.freeShippingMin)}
        </OfferTile>
      </div>
    </section>
  )
}

function OfferTile({
  tone,
  icon,
  children,
}: {
  tone: 'accent' | 'primary'
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <p
      className={cn(
        'gap-4 p-4 text-base leading-snug font-bold [&_svg]:size-6 flex flex-1 flex-col justify-between rounded-[var(--sf-tile-radius)]',
        tone === 'accent'
          ? 'bg-[var(--sf-accent)] text-[color:var(--sf-on-accent)]'
          : 'bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]',
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  )
}

/** Square category photos in a scroller with the name and count under each; arrows sit beside the title. */
export function CategoryTiles({
  title = 'Shop by category',
  categories,
}: {
  title?: string
  categories?: Category[]
}) {
  const { catalog, store } = useShop()
  const list = categories ?? [...popularCategories(catalog), ...catalog.categories.filter((c) => c.parentId)]
  const ref = useRef<HTMLUListElement>(null)
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 420, behavior: 'smooth' })
  return (
    <section aria-labelledby="tiles-h">
      <div className="mb-5 gap-3 flex items-end justify-between">
        <h2 id="tiles-h" className="sf-title">
          {title}
        </h2>
        <div className="gap-2 md:flex hidden">
          <IconButton label="Scroll categories left" tone="light" onClick={() => scroll(-1)}>
            <ChevronLeft aria-hidden="true" />
          </IconButton>
          <IconButton label="Scroll categories right" tone="light" onClick={() => scroll(1)}>
            <ChevronRight aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <ul ref={ref} className={cn(RAIL, 'lg:flex lg:overflow-x-auto md:gap-5')}>
        {list.map((c) => (
          <li
            key={c.id}
            className="w-32 md:w-44 lg:w-[calc((100%_-_4_*_1.25rem)_/_5)] xl:w-[calc((100%_-_5_*_1.25rem)_/_6)] shrink-0 snap-start"
          >
            <Link to={paths.category(store, c.id)} className="group block">
              <Photo
                id={categoryPhoto(c.id)}
                width={420}
                className="aspect-square rounded-[var(--sf-card-radius)] [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-105"
              />
              <span className="mt-3 text-sm leading-tight font-semibold md:text-base block group-hover:underline">
                {c.name}
              </span>
              <span className="text-xs text-[color:var(--sf-muted)]">
                {productsIn(catalog, c.id).length} products
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Editorial chip row from a category section body, such as "5K · 10K · Half · Full · Trail". */
export function EditorialChips({ section }: { section: PageSection }) {
  const { store } = useShop()
  const chips = section.body
    .split(/[·,]/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (!chips.length) return null
  return (
    <section aria-labelledby={`${section.id}-chips`}>
      <h2 id={`${section.id}-chips`} className="sf-display mb-3 text-lg font-bold">
        {section.headline}
      </h2>
      <Scroller>
        {chips.map((c) => (
          <Link
            key={c}
            to={paths.search(store, c)}
            className="min-h-11 px-5 text-sm font-semibold inline-flex shrink-0 items-center rounded-full bg-[var(--sf-bg)] shadow-card hover:bg-[var(--sf-text)] hover:text-[color:var(--sf-bg)]"
          >
            {c}
          </Link>
        ))}
      </Scroller>
    </section>
  )
}

/** Deals and offers: the soonest-ending offer with a live countdown and the products it covers. */
export function DealsStrip() {
  const { catalog } = useShop()
  const deal = currentDeal(catalog, nowMs())
  if (!deal) return null
  const { promotion, products } = deal
  return (
    <section aria-labelledby="deals-h" className="space-y-6">
      <Ticket
        className="bg-[var(--sf-accent)] text-[color:var(--sf-on-accent)]"
        stub={<PromoValue promotion={promotion} className="text-6xl md:text-7xl" />}
      >
        <div className="gap-6 lg:flex-row lg:items-center lg:justify-between flex flex-col">
          <div className="min-w-0">
            <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-75">Deal of the week</p>
            <h2 id="deals-h" className="sf-title mt-1">
              {promotion.name}
            </h2>
            <p className="mt-2 text-sm opacity-80">{promoTerms(promotion)}</p>
            <div className="mt-4">
              {promotion.trigger === 'code' ? (
                <CouponCode code={promotion.code} />
              ) : (
                <span className="h-11 px-4 text-sm font-bold inline-flex items-center rounded-full border-2 border-current">
                  Applied in your cart
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <p className="mb-2 font-bold text-[11px] tracking-[0.16em] uppercase opacity-75">Ends in</p>
            <Countdown endAt={promotion.endAt} />
          </div>
        </div>
      </Ticket>
      <ProductGrid products={products} rail />
    </section>
  )
}

const PANEL_TONES = ['--sf-primary', '--sf-accent', '--sf-secondary'] as const
const XL_COLS = ['', 'xl:grid-cols-1', 'xl:grid-cols-2', 'xl:grid-cols-3', 'xl:grid-cols-4']

/** One showcase row: a tinted panel with "Explore all" and up to eight compact product cells. */
export function ShowcaseRow({
  title,
  description,
  to,
  products,
  index,
}: {
  title: string
  description: string
  to: string
  products: Product[]
  index: number
}) {
  const id = `showcase-${index}`
  return (
    <section
      aria-labelledby={id}
      className="sf-card gap-3 p-2 md:p-3 lg:grid-cols-[240px_minmax(0,1fr)] grid grid-cols-1"
    >
      <div
        className="gap-4 p-4 md:p-5 lg:p-6 lg:flex-col lg:items-start flex items-center justify-between rounded-[var(--sf-tile-radius)]"
        style={{ background: tint(PANEL_TONES[index % PANEL_TONES.length]!, 14) }}
      >
        <div className="min-w-0">
          <h2 id={id} className="sf-display text-xl font-bold lg:text-2xl">
            {title}
          </h2>
          <p className="mt-1 text-sm sm:block hidden text-[color:var(--sf-muted)]">{description}</p>
        </div>
        <ButtonLink to={to} variant="light" size="sm" className="shrink-0">
          Explore all
          <ArrowUpRight aria-hidden="true" />
        </ButtonLink>
      </div>
      <ul
        className={cn(
          'gap-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:self-center no-scrollbar flex snap-x overflow-x-auto',
          XL_COLS[Math.min(products.length, 4)],
        )}
      >
        {products.slice(0, 4).map((p) => (
          <li key={p.id} className="min-w-0 sm:w-auto w-[80%] shrink-0 snap-start">
            <CompactCell product={p} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The best running category offer, or the first-order code, as a voucher that links to what it covers. */
export function OfferBand() {
  const { catalog, store, tenant } = useShop()
  const now = nowMs()
  const scoped = runningPromotions(catalog, now).find((p) => p.kind === 'percentage' && p.categoryIds.length)
  const scopedCategory = scoped ? catalog.categoryMap.get(scoped.categoryIds[0]!) : undefined
  const promotion = scoped && scopedCategory ? scoped : welcomePromotion(catalog, now)
  if (!promotion) return null
  const to = scopedCategory
    ? paths.category(store, scopedCategory.id)
    : paths.search(store, '', { sort: 'best' })
  return (
    <section aria-labelledby="offer-h">
      <Ticket
        className="bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]"
        stub={<PromoValue promotion={promotion} className="text-6xl md:text-8xl" />}
      >
        <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-75">
          {scopedCategory ? `${scopedCategory.name} offer` : `New to ${tenant.name.replace(/\.$/, '')}`}
        </p>
        <h2 id="offer-h" className="sf-title mt-1 max-w-2xl">
          {scopedCategory
            ? `${offerText(promotion)} ${scopedCategory.name.toLowerCase()}`
            : `${offerText(promotion)} your first order`}
        </h2>
        <p className="mt-2 text-sm opacity-80">{promoTerms(promotion)}</p>
        <div className="mt-5 gap-3 flex flex-wrap items-center">
          {promotion.trigger === 'code' && <CouponCode code={promotion.code} />}
          <ButtonLink to={to} variant="light">
            {scopedCategory ? `Shop ${scopedCategory.name.toLowerCase()}` : 'Start shopping'}
            <ArrowUpRight aria-hidden="true" />
          </ButtonLink>
        </div>
      </Ticket>
    </section>
  )
}

export function ProductsBlock({
  title,
  products,
  action,
  Heading = PlainHeading,
  id,
  rail = true,
  gridClassName,
}: {
  title: string
  products: Product[]
  action?: HeadingProps['action']
  Heading?: (p: HeadingProps) => ReactNode
  id: string
  rail?: boolean
  gridClassName?: string
}) {
  if (!products.length) return null
  return (
    <section aria-labelledby={id}>
      <Heading id={id} title={title} action={action} />
      <ProductGrid products={products} rail={rail} className={gridClassName} />
    </section>
  )
}
