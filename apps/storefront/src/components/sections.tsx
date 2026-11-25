import {
  fmtIdr,
  initials,
  isExternalHref,
  nowMs,
  sectionHref,
  sectionItems,
  tenantPhotos,
  toMs,
} from '@rc/fixtures'
import type { Industry, PageSection, Product, Promotion, Seller, SellerKind } from '@rc/types'
import { cn, toast } from '@rc/ui'
import { ArrowRight, AtSign, ChevronDown, MessageCircle, Quote } from 'lucide-react'
import { Children, type ReactNode } from 'react'
import { Link } from 'react-router'
import { type MessageKey, t } from '../i18n'
import { fmtNumber } from '../i18n/format'
import { tint } from '../lib/brand'
import { type Catalog, bestSellers } from '../lib/catalog'
import { EMBED_FRAME, useFocusedSection } from '../lib/embed'
import { firstName, paths, waLink } from '../lib/paths'
import { returnsPolicy } from '../lib/policy'
import { useShop } from '../state/shop'
import { Sticker } from './ornaments'
import { CouponCode, PromoValue, Ticket, promoTerms } from './promo'
import { Photo } from './product'
import { offerText } from './shell'
import { Button, ButtonLink, type ButtonSize, type ButtonVariant, buttonClass } from './ui'

// Section blocks both themes share. Surfaces read the theme variables (sf-card, --sf-card-radius),
// so a block looks rounded in Theme 1 and hairline-square on a Theme 2 phone.

/** Products a section names, active only, padded with best sellers when it names none. */
export function sectionProducts(catalog: Catalog, section: PageSection, limit: number): Product[] {
  const named = section.productIds
    .map((id) => catalog.productMap.get(id))
    .filter((p): p is Product => !!p && p.status === 'active')
  if (!named.length) return bestSellers(catalog, limit)
  // A featured row tops up with best sellers so the desktop row fills; a collection keeps its own list.
  const extra =
    section.kind === 'featured_product'
      ? bestSellers(catalog, limit + named.length).filter((p) => !named.includes(p))
      : []
  return [...named, ...extra].slice(0, limit)
}

const QUOTES: Record<Industry, { quote: MessageKey; name: string }[]> = {
  sport: [
    { quote: 'catalog.quote.sport.1', name: 'Dewi, Bandung' },
    { quote: 'catalog.quote.sport.2', name: 'Andre, Surabaya' },
    { quote: 'catalog.quote.sport.3', name: 'Rina, Jakarta' },
    { quote: 'catalog.quote.sport.4', name: 'Yoga, Semarang' },
  ],
  beauty: [
    { quote: 'catalog.quote.beauty.1', name: 'Salsa, Jakarta' },
    { quote: 'catalog.quote.beauty.2', name: 'Maya, Bandung' },
    { quote: 'catalog.quote.beauty.3', name: 'Tiara, Medan' },
    { quote: 'catalog.quote.beauty.4', name: 'Nanda, Surabaya' },
  ],
  industrial: [
    { quote: 'catalog.quote.industrial.1', name: 'PT Presisi Logam' },
    { quote: 'catalog.quote.industrial.2', name: 'CV Sinar Teknik' },
    { quote: 'catalog.quote.industrial.3', name: 'PT Mitra Plastik' },
    { quote: 'catalog.quote.industrial.4', name: 'PT Baja Utama' },
  ],
  fnb: [
    { quote: 'catalog.quote.fnb.1', name: 'Lia, Jakarta' },
    { quote: 'catalog.quote.fnb.2', name: 'Bima, Depok' },
    { quote: 'catalog.quote.fnb.3', name: 'Sari, Bogor' },
    { quote: 'catalog.quote.fnb.4', name: 'Rudi, Bekasi' },
  ],
  fashion: [
    { quote: 'catalog.quote.fashion.1', name: 'Ayu, Jakarta' },
    { quote: 'catalog.quote.fashion.2', name: 'Dimas, Bandung' },
    { quote: 'catalog.quote.fashion.3', name: 'Laras, Surabaya' },
    { quote: 'catalog.quote.fashion.4', name: 'Fajar, Medan' },
  ],
  electronics: [
    { quote: 'catalog.quote.electronics.1', name: 'Kevin, Jakarta' },
    { quote: 'catalog.quote.electronics.2', name: 'Wina, Bandung' },
    { quote: 'catalog.quote.electronics.3', name: 'Reza, Surabaya' },
    { quote: 'catalog.quote.electronics.4', name: 'Putu, Denpasar' },
  ],
}

/** Sample quotes from the store's industry, in the shopper's language. */
export const quotesFor = (industry: Industry) =>
  (QUOTES[industry] ?? QUOTES.sport).map((q) => ({ quote: t(q.quote), name: q.name }))

const SELLER_KIND: Record<SellerKind, MessageKey> = {
  sales: 'catalog.sellerKind.sales',
  agent: 'catalog.sellerKind.agent',
  reseller: 'catalog.sellerKind.reseller',
  affiliate: 'catalog.sellerKind.affiliate',
}
export const sellerKindLabel = (kind: SellerKind) => t(SELLER_KIND[kind])

/**
 * A row that scrolls on phones and tablets, bleeding to the edge of a px-4 / md:px-6 container, and
 * turns into a grid from lg (no bleed there). Pair it with `lgCols(count)` so the desktop row has no holes.
 */
export const RAIL =
  '-mx-4 px-4 gap-3 no-scrollbar scroll-px-4 md:-mx-6 md:gap-5 md:px-6 md:scroll-px-6 lg:mx-0 lg:px-0 lg:grid flex snap-x overflow-x-auto lg:overflow-visible'

const LG_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5']
export const lgCols = (count: number, max = 5) => LG_COLS[Math.min(count, max)]

/** Product listings in both themes: the same column count at every width, so a card has one size. */
export const PRODUCT_GRID =
  'grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 md:gap-y-10 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'

/**
 * Product rails use the listing columns from lg and show a single row: 4 at lg, 5 at xl and 6 at 2xl
 * when there are that many products, so a short row never ends in an empty slot. Pass the count.
 */
export function productRail(count = 6) {
  return [
    RAIL,
    'lg:grid-cols-4',
    count >= 5 && 'xl:grid-cols-5',
    count >= 6 ? '2xl:grid-cols-6' : count === 5 && '2xl:grid-cols-5',
  ]
    .filter(Boolean)
    .join(' ')
}
export const PRODUCT_RAIL = productRail()

export function productRailItem(i: number, count = 6) {
  const base = 'w-[44%] md:w-[30%] lg:w-auto shrink-0 snap-start'
  if (i < 4) return base
  if (i === 4) return `${base} lg:hidden${count >= 5 ? ' xl:flex' : ''}`
  if (i === 5) return `${base} lg:hidden${count >= 6 ? ' 2xl:flex' : ''}`
  return `${base} lg:hidden`
}

export interface HeadingProps {
  title: string
  id?: string
  action?: { label: string; to: string }
}

/** Theme 1 heading: one bold line with a "View all" link. */
export function PlainHeading({ title, id, action }: HeadingProps) {
  return (
    <div className="mb-5 gap-3 flex flex-wrap items-center justify-between">
      <h2 id={id} className="sf-title">
        {title}
      </h2>
      {action && (
        <Link
          to={action.to}
          className="group min-h-11 gap-1 text-sm font-semibold inline-flex items-center hover:text-[color:var(--sf-primary-text)]"
        >
          {action.label}
          <ArrowRight
            className="size-4 group-hover:translate-x-0.5 transition-transform"
            aria-hidden="true"
          />
        </Link>
      )}
    </div>
  )
}

export function Testimonials({
  section,
  Heading = PlainHeading,
}: {
  section: PageSection
  Heading?: (p: HeadingProps) => ReactNode
}) {
  const { tenant } = useShop()
  // The owner's own quotes when the section has them, else three from the store's industry.
  const quotes =
    sectionItems(section)?.map((i) => ({ quote: i.title, name: i.body })) ??
    quotesFor(tenant.industry).slice(0, 3)
  return (
    <section aria-labelledby={`${section.id}-h`} id="testimonials" className="scroll-mt-24">
      <Heading id={`${section.id}-h`} title={section.headline || t('catalog.section.testimonials')} />
      {section.body && <p className="-mt-2 mb-4 text-sm text-[color:var(--sf-muted)]">{section.body}</p>}
      <ul className="gap-3 md:grid-cols-3 grid grid-cols-1">
        {quotes.map((q, i) => (
          <li key={`${i}-${q.name}`} className="sf-card p-5">
            <Quote className="size-5 text-[color:var(--sf-accent)]" aria-hidden="true" />
            <blockquote className="mt-2 text-sm leading-relaxed font-semibold">{q.quote}</blockquote>
            {q.name && <p className="mt-2 text-xs text-[color:var(--sf-muted)]">{q.name}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Comparison({
  section,
  Heading = PlainHeading,
}: {
  section: PageSection
  Heading?: (p: HeadingProps) => ReactNode
}) {
  const { catalog, store } = useShop()
  const products = sectionProducts(catalog, section, 2)
  if (products.length < 2) return null
  const rows: { label: string; value: (p: Product) => string }[] = [
    { label: t('catalog.compare.price'), value: (p) => (p.assisted ? t('catalog.price.talkToSales') : fmtIdr(p.price)) },
    {
      label: t('catalog.compare.rating'),
      value: (p) => t('catalog.compare.ratingValue', { rating: p.rating.toFixed(1), count: p.reviewCount }),
    },
    { label: t('catalog.compare.bestFor'), value: (p) => p.bestFor || t('catalog.compare.everyday') },
  ]
  return (
    <section aria-labelledby={`${section.id}-h`}>
      <Heading id={`${section.id}-h`} title={section.headline || t('catalog.section.compare')} />
      <div className="sf-card overflow-x-auto">
        <table className="text-sm w-full min-w-[480px] table-fixed text-left">
          <thead>
            <tr className="bg-[var(--sf-soft)]">
              <th scope="col" className="p-4 font-semibold w-1/4 text-[color:var(--sf-muted)]">
                <span className="sr-only">{t('catalog.compare.feature')}</span>
              </th>
              {products.map((p) => (
                <th key={p.id} scope="col" className="p-4">
                  <Link to={paths.product(store, p.id)} className="sf-display font-bold hover:underline">
                    {p.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-[color:var(--sf-line)]">
                <th scope="row" className="p-4 font-normal text-[color:var(--sf-muted)]">
                  {r.label}
                </th>
                {products.map((p) => (
                  <td key={p.id} className="p-4">
                    {r.value(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** The tenant's story beside its photo, with counts from the catalog and orders, and a way into the range. */
export function BrandStory({ section }: { section: PageSection }) {
  const { tenant, catalog, customers, orders, store } = useShop()
  const stats = [
    { value: catalog.products.length, label: t('catalog.story.products') },
    { value: customers.length, label: t('catalog.story.customers') },
    { value: new Set(orders.map((o) => o.city)).size, label: t('catalog.story.cities') },
  ].filter((s) => s.value > 0)
  return (
    <section
      aria-labelledby={`${section.id}-h`}
      className="sf-card gap-6 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 md:p-6 grid grid-cols-1 items-center overflow-hidden"
    >
      <div className="relative">
        <Photo
          id={tenantPhotos(tenant.id)?.story}
          src={section.imageUrl}
          width={640}
          ratio={0.75}
          className="aspect-[4/3] rounded-[var(--sf-tile-radius)]"
        />
        <Sticker className="bottom-4 left-4 absolute">
          {t('catalog.story.since', { year: tenant.createdAt.slice(0, 4) })}
        </Sticker>
      </div>
      <div className="min-w-0">
        <p className="sf-kicker">{t('catalog.story.kicker')}</p>
        <h2 id={`${section.id}-h`} className="sf-display mt-2 text-2xl font-bold md:text-3xl text-balance">
          {section.headline || t('catalog.story.about', { name: tenant.name })}
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-[color:var(--sf-muted)]">
          {section.body || tenant.brand.tagline}
        </p>
        {stats.length > 0 && (
          <dl className="mt-6 gap-4 py-4 grid grid-cols-3 border-y border-[color:var(--sf-line)]">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 flex flex-col-reverse">
                <dt className="text-xs text-[color:var(--sf-muted)]">{s.label}</dt>
                <dd className="sf-display text-2xl font-bold md:text-3xl">{fmtNumber(s.value)}</dd>
              </div>
            ))}
          </dl>
        )}
        <Link to={paths.search(store, '', { sort: 'best' })} className={cn(buttonClass('outline'), 'mt-6')}>
          {t('catalog.story.shop')}
        </Link>
      </div>
    </section>
  )
}

export function Faq({
  section,
  Heading = PlainHeading,
}: {
  section: PageSection
  Heading?: (p: HeadingProps) => ReactNode
}) {
  const { tenant } = useShop()
  const own = sectionItems(section)
  const [q, ...rest] = section.body.split('?')
  // The owner's own questions replace the defaults; older pages keep one question in the body.
  const items = own
    ? own.map((i) => ({ q: i.title, a: i.body }))
    : [
        ...(q?.trim() && rest.join('?').trim() ? [{ q: `${q.trim()}?`, a: rest.join('?').trim() }] : []),
        {
          q: t('catalog.faq.deliveryQ'),
          a: t('catalog.faq.deliveryA', { amount: fmtIdr(tenant.loyalty.freeShippingMin) }),
        },
        {
          q: t('catalog.faq.returnQ'),
          a: returnsPolicy(tenant).sentence,
        },
        {
          q: t('catalog.faq.payQ'),
          a: t('catalog.faq.payA'),
        },
      ]
  return (
    <section aria-labelledby={`${section.id}-h`}>
      <Heading id={`${section.id}-h`} title={section.headline || t('catalog.section.faq')} />
      <div className="space-y-2">
        {items.map((item, i) => (
          <details key={`${i}-${item.q}`} className="group sf-card px-5">
            <summary className="min-h-14 gap-3 font-semibold flex cursor-pointer list-none items-center justify-between">
              {item.q}
              <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            {item.a && <p className="pb-4 text-sm leading-relaxed text-[color:var(--sf-muted)]">{item.a}</p>}
          </details>
        ))}
      </div>
    </section>
  )
}

/**
 * A section's button: to the page or link the owner chose when there is one, else to `fallback`.
 * Full links open in a new tab.
 */
export function SectionButton({
  section,
  fallback,
  label,
  variant,
  size,
  className,
}: {
  section: PageSection
  fallback: string
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}) {
  const { store } = useShop()
  const href = sectionHref(paths.home(store).replace(/\/$/, ''), section.ctaHref) ?? fallback
  if (isExternalHref(href))
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonClass(variant, size), className)}
      >
        {label}
        <span className="sr-only"> {t('catalog.newTab')}</span>
      </a>
    )
  return (
    <ButtonLink to={href} variant={variant} size={size} className={className}>
      {label}
    </ButtonLink>
  )
}

/**
 * Inside the admin editor's frame, marks a rendered section so a click selects it there and hover
 * outlines it. Everywhere else it renders the section untouched.
 */
export function EditableSection({ id, children }: { id: string; children: ReactNode }) {
  const focused = useFocusedSection()
  if (!EMBED_FRAME) return children
  return (
    <div data-section-id={id} data-selected={focused === id || undefined} className="empty:hidden">
      {children}
    </div>
  )
}

/**
 * The column of a page's sections. In the editor's frame each child is marked with the section at the
 * same index, so children must come one per section, in order (null for a section that renders nothing).
 */
export function SectionStack({
  sections,
  className,
  children,
}: {
  sections: PageSection[]
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      {EMBED_FRAME
        ? Children.map(children, (child, i) =>
            sections[i] ? <EditableSection id={sections[i].id}>{child}</EditableSection> : child,
          )
        : children}
    </div>
  )
}

export function CtaBand({ section, action }: { section: PageSection; action: ReactNode }) {
  return (
    <section
      aria-labelledby={`${section.id}-h`}
      className="px-6 py-10 md:py-14 rounded-[var(--sf-card-radius)] bg-[var(--sf-text)] text-center text-[color:var(--sf-bg)]"
    >
      <h2 id={`${section.id}-h`} className="sf-display text-2xl font-bold md:text-3xl">
        {section.headline || t('catalog.section.cta')}
      </h2>
      {section.body && <p className="mt-2 max-w-md mx-auto opacity-80">{section.body}</p>}
      <div className="mt-6 flex justify-center">{action}</div>
    </section>
  )
}

/** The seller's own open promotion, else the section's code. */
export function sellerPromotion(catalog: Catalog, seller: Seller | null | undefined): Promotion | null {
  if (!seller) return null
  const now = nowMs()
  return (
    catalog.promotions.find(
      (p) =>
        p.sellerId === seller.id && p.status === 'active' && toMs(p.startAt) <= now && toMs(p.endAt) >= now,
    ) ?? null
  )
}

export function PromoBlock({ section, seller }: { section: PageSection; seller?: Seller | null }) {
  const { catalog, cart } = useShop()
  const own = sellerPromotion(catalog, seller)
  const code = own?.code ?? section.headline.trim()
  const text = own
    ? own.minSpend
      ? t('catalog.promoBlock.textMin', {
          offer: offerText(own),
          name: firstName(seller?.name ?? ''),
          amount: fmtIdr(own.minSpend),
        })
      : t('catalog.promoBlock.text', { offer: offerText(own), name: firstName(seller?.name ?? '') })
    : section.body
  if (!code) return null
  const promotion = own ?? catalog.promotions.find((p) => p.code === code) ?? null
  const use = () => {
    cart.setVoucher(code)
    toast(t('catalog.promoBlock.added', { code }), {
      tone: 'success',
      description: t('catalog.promoBlock.addedText'),
    })
  }
  const body = (
    <div className="gap-5 lg:flex-row lg:items-center lg:justify-between flex flex-col">
      <div className="min-w-0">
        <p className="font-bold text-[11px] tracking-[0.16em] uppercase">
          {seller ? t('catalog.promoBlock.sellerCode', { name: firstName(seller.name) }) : t('catalog.promoBlock.limited')}
        </p>
        <p className="sf-title mt-1">{text || t('catalog.promoBlock.fallback')}</p>
        {promotion && <p className="mt-2 text-sm">{promoTerms(promotion)}</p>}
      </div>
      <div className="gap-3 flex shrink-0 flex-wrap items-center">
        <CouponCode code={code} />
        <Button variant="light" onClick={use}>
          {t('catalog.promoBlock.use')}
        </Button>
      </div>
    </div>
  )
  return (
    <section aria-label={t('catalog.promoBlock.aria')}>
      {promotion ? (
        <Ticket
          className="bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]"
          stub={<PromoValue promotion={promotion} className="text-6xl md:text-7xl" />}
        >
          {body}
        </Ticket>
      ) : (
        <div className="p-6 md:p-8 rounded-[var(--sf-card-radius)] bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]">
          {body}
        </div>
      )}
    </section>
  )
}

/** Personal store hero (spec 13): the seller's photo or initials, headline, bio and a WhatsApp button. */
export function SellerHero({
  section,
  seller,
  className,
}: {
  section: PageSection
  seller: Seller
  className?: string
}) {
  const { tenant } = useShop()
  const headline = tenant.brand.locks.headline ? tenant.brand.tagline : section.headline || seller.headline
  return (
    <section
      aria-labelledby="seller-h"
      className={cn(
        'gap-5 px-5 py-10 md:flex-row md:gap-8 md:px-10 md:text-left flex flex-col items-center rounded-[var(--sf-card-radius)] text-center',
        className,
      )}
      style={{ background: tint('--sf-primary', 10) }}
    >
      {seller.photoUrl ? (
        <img
          src={seller.photoUrl}
          alt={seller.name}
          className="size-24 md:size-32 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="sf-heading size-24 text-3xl font-bold md:size-32 md:text-4xl flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]"
        >
          {initials(seller.name)}
        </span>
      )}
      <div className="min-w-0">
        <p className="sf-kicker">{seller.name}</p>
        <p className="mt-1 text-xs text-[color:var(--sf-muted)]">
          {sellerKindLabel(seller.kind)}, {seller.city}
        </p>
        <h1
          id="seller-h"
          className="sf-display mt-3 text-3xl leading-tight font-bold md:text-5xl text-balance"
        >
          {/* Keep hyphenated words such as "race-day" on one line. */}
          {headline.replace(/-/g, '\u2011')}
        </h1>
        <p className="mt-3 max-w-xl text-[color:var(--sf-muted)]">{section.body || seller.bio}</p>
        <div className="mt-6 gap-2 md:justify-start flex flex-wrap justify-center">
          <a
            href={waLink(seller.whatsapp, t('catalog.seller.waText', { name: firstName(seller.name), store: tenant.name }))}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('primary', 'lg')}
          >
            <MessageCircle aria-hidden="true" />
            {section.ctaLabel || t('catalog.seller.chat')}
            <span className="sr-only"> {t('catalog.seller.opensWa')}</span>
          </a>
          {seller.instagram && (
            <span className="min-h-12 gap-1.5 px-2 text-sm inline-flex items-center text-[color:var(--sf-muted)]">
              <AtSign className="size-4" aria-hidden="true" />
              {seller.instagram.replace(/^@/, '')}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
