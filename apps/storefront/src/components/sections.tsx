import { fmtIdr, fmtNumber, initials, nowMs, tenantPhotos, toMs } from '@rc/fixtures'
import type { Industry, PageSection, Product, Promotion, Seller } from '@rc/types'
import { SELLER_KIND_LABEL } from '@rc/types'
import { cn, toast } from '@rc/ui'
import { ArrowRight, AtSign, ChevronDown, MessageCircle, Quote } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { tint } from '../lib/brand'
import { type Catalog, bestSellers } from '../lib/catalog'
import { firstName, paths, waLink } from '../lib/paths'
import { RETURNS_POLICY } from '../lib/policy'
import { useShop } from '../state/shop'
import { Sticker } from './ornaments'
import { CouponCode, PromoValue, Ticket, promoTerms } from './promo'
import { Photo } from './product'
import { offerText } from './shell'
import { Button, buttonClass } from './ui'

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

const QUOTES: Record<Industry, { quote: string; name: string }[]> = {
  sport: [
    { quote: 'The fitting advice got me to my first half marathon without blisters.', name: 'Dewi, Bandung' },
    { quote: 'Ordered on Monday, ran in them on Wednesday.', name: 'Andre, Surabaya' },
    { quote: 'Honest about which shoe suits my pace. I will be back.', name: 'Rina, Jakarta' },
    { quote: 'The gels and the plan made race day easy.', name: 'Yoga, Semarang' },
  ],
  beauty: [
    { quote: 'My skin calmed down within two weeks.', name: 'Salsa, Jakarta' },
    { quote: 'Gentle enough for my sensitive skin.', name: 'Maya, Bandung' },
    { quote: 'The consultation picked the right routine for me.', name: 'Tiara, Medan' },
    { quote: 'Beautiful gift box, my mother loved it.', name: 'Nanda, Surabaya' },
  ],
  industrial: [
    { quote: 'Commissioning finished a day early.', name: 'PT Presisi Logam' },
    { quote: 'Spare parts arrive the next morning.', name: 'CV Sinar Teknik' },
    { quote: 'The service contract cut our downtime in half.', name: 'PT Mitra Plastik' },
    { quote: 'Clear quotes and a sales engineer who answers.', name: 'PT Baja Utama' },
  ],
  fnb: [
    { quote: 'Fresh, fast and well packed.', name: 'Lia, Jakarta' },
    { quote: 'My weekly order never misses.', name: 'Bima, Depok' },
    { quote: 'Great taste at a fair price.', name: 'Sari, Bogor' },
    { quote: 'Lovely for gifting.', name: 'Rudi, Bekasi' },
  ],
  fashion: [
    { quote: 'Fits exactly as the size guide says.', name: 'Ayu, Jakarta' },
    { quote: 'Quality matches the photos.', name: 'Dimas, Bandung' },
    { quote: 'Easy exchange when I needed a size up.', name: 'Laras, Surabaya' },
    { quote: 'My new favourite store.', name: 'Fajar, Medan' },
  ],
  electronics: [
    { quote: 'Arrived sealed with the full warranty.', name: 'Kevin, Jakarta' },
    { quote: 'Helpful setup advice from the team.', name: 'Wina, Bandung' },
    { quote: 'Fair price and quick delivery.', name: 'Reza, Surabaya' },
    { quote: 'Will buy my next laptop here.', name: 'Putu, Denpasar' },
  ],
}

export const quotesFor = (industry: Industry) => QUOTES[industry] ?? QUOTES.sport

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
          className="group min-h-11 gap-1 text-sm font-semibold inline-flex items-center hover:text-[color:var(--sf-primary)]"
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
  return (
    <section aria-labelledby={`${section.id}-h`} id="testimonials" className="scroll-mt-24">
      <Heading id={`${section.id}-h`} title={section.headline || 'What customers say'} />
      {section.body && <p className="-mt-2 mb-4 text-sm text-[color:var(--sf-muted)]">{section.body}</p>}
      <ul className="gap-3 md:grid-cols-3 grid grid-cols-1">
        {quotesFor(tenant.industry)
          .slice(0, 3)
          .map((q) => (
            <li key={q.name} className="sf-card p-5">
              <Quote className="size-5 text-[color:var(--sf-accent)]" aria-hidden="true" />
              <blockquote className="mt-2 text-sm leading-relaxed font-semibold">{q.quote}</blockquote>
              <p className="mt-2 text-xs text-[color:var(--sf-muted)]">{q.name}</p>
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
    { label: 'Price', value: (p) => (p.assisted ? 'Talk to sales' : fmtIdr(p.price)) },
    { label: 'Rating', value: (p) => `${p.rating.toFixed(1)} of 5 (${p.reviewCount} reviews)` },
    { label: 'Best for', value: (p) => p.bestFor || 'Everyday use' },
  ]
  return (
    <section aria-labelledby={`${section.id}-h`}>
      <Heading id={`${section.id}-h`} title={section.headline || 'Compare'} />
      <div className="sf-card overflow-x-auto">
        <table className="text-sm w-full min-w-[480px] table-fixed text-left">
          <thead>
            <tr className="bg-[var(--sf-soft)]">
              <th scope="col" className="p-4 font-semibold w-1/4 text-[color:var(--sf-muted)]">
                <span className="sr-only">Feature</span>
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
    { value: catalog.products.length, label: 'products' },
    { value: customers.length, label: 'customers' },
    { value: new Set(orders.map((o) => o.city)).size, label: 'cities we ship to' },
  ].filter((s) => s.value > 0)
  return (
    <section
      aria-labelledby={`${section.id}-h`}
      className="sf-card gap-6 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10 md:p-6 grid grid-cols-1 items-center overflow-hidden"
    >
      <div className="relative">
        <Photo
          id={tenantPhotos(tenant.id)?.story}
          width={640}
          ratio={0.75}
          className="aspect-[4/3] rounded-[var(--sf-tile-radius)]"
        />
        <Sticker className="bottom-4 left-4 absolute">Since {tenant.createdAt.slice(0, 4)}</Sticker>
      </div>
      <div className="min-w-0">
        <p className="sf-kicker">Our story</p>
        <h2 id={`${section.id}-h`} className="sf-display mt-2 text-2xl font-bold md:text-3xl text-balance">
          {section.headline || `About ${tenant.name}`}
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
          Shop the range
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
  const [q, ...rest] = section.body.split('?')
  const items = [
    ...(q?.trim() && rest.join('?').trim() ? [{ q: `${q.trim()}?`, a: rest.join('?').trim() }] : []),
    {
      q: 'How long does delivery take?',
      a: `Two to four days with JNE or SiCepat, the same day with GoSend in Jakarta. Orders from ${fmtIdr(tenant.loyalty.freeShippingMin)} ship free.`,
    },
    {
      q: 'Can I return an item?',
      a: RETURNS_POLICY[tenant.industry],
    },
    {
      q: 'How can I pay?',
      a: 'QRIS, virtual account, e-wallet, card, and cash on delivery where the store offers it.',
    },
  ]
  return (
    <section aria-labelledby={`${section.id}-h`}>
      <Heading id={`${section.id}-h`} title={section.headline || 'Questions'} />
      <div className="space-y-2">
        {items.map((item) => (
          <details key={item.q} className="group sf-card px-5">
            <summary className="min-h-14 gap-3 font-semibold flex cursor-pointer list-none items-center justify-between">
              {item.q}
              <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-[color:var(--sf-muted)]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function CtaBand({ section, action }: { section: PageSection; action: ReactNode }) {
  return (
    <section
      aria-labelledby={`${section.id}-h`}
      className="px-6 py-10 md:py-14 rounded-[var(--sf-card-radius)] bg-[var(--sf-text)] text-center text-[color:var(--sf-bg)]"
    >
      <h2 id={`${section.id}-h`} className="sf-display text-2xl font-bold md:text-3xl">
        {section.headline || 'Questions before you buy?'}
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
    ? `${offerText(own)} with ${firstName(seller?.name ?? '')}'s code${own.minSpend ? ` on orders from ${fmtIdr(own.minSpend)}` : ''}.`
    : section.body
  if (!code) return null
  const promotion = own ?? catalog.promotions.find((p) => p.code === code) ?? null
  const use = () => {
    cart.setVoucher(code)
    toast(`Code ${code} added to your cart`, {
      tone: 'success',
      description: 'It applies when your cart qualifies.',
    })
  }
  const body = (
    <div className="gap-5 lg:flex-row lg:items-center lg:justify-between flex flex-col">
      <div className="min-w-0">
        <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-75">
          {seller ? `${firstName(seller.name)}'s code` : 'Limited offer'}
        </p>
        <p className="sf-title mt-1">{text || 'A code for this store'}</p>
        {promotion && <p className="mt-2 text-sm opacity-80">{promoTerms(promotion)}</p>}
      </div>
      <div className="gap-3 flex shrink-0 flex-wrap items-center">
        <CouponCode code={code} />
        <Button variant="light" onClick={use}>
          Use code
        </Button>
      </div>
    </div>
  )
  return (
    <section aria-label="Offer">
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

/** Personal store hero (spec 13): the seller's initials, headline, bio and a WhatsApp button. */
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
      <span
        aria-hidden="true"
        className="sf-heading size-24 text-3xl font-bold md:size-32 md:text-4xl flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]"
      >
        {initials(seller.name)}
      </span>
      <div className="min-w-0">
        <p className="sf-kicker">{seller.name}</p>
        <p className="mt-1 text-xs text-[color:var(--sf-muted)]">
          {SELLER_KIND_LABEL[seller.kind]}, {seller.city}
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
            href={waLink(seller.whatsapp, `Hi ${firstName(seller.name)}, I found your ${tenant.name} store.`)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('primary', 'lg')}
          >
            <MessageCircle aria-hidden="true" />
            {section.ctaLabel || 'Chat on WhatsApp'}
            <span className="sr-only"> (opens WhatsApp)</span>
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
