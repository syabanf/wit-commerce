import { fmtIdr, initials, photoUrl, productPhoto } from '@rc/fixtures'
import type { BrandConfig, ButtonStyle, Device, PageSection, Product, RadiusScale, Seller } from '@rc/types'
import { SECTION_KIND_LABEL, SELLER_KIND_LABEL } from '@rc/types'
import { cn } from '@rc/ui'
import { ChevronDown, ImageIcon, Lock, MessageCircle, Search, ShoppingBag, Star } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { BRAND_FONT_STACK } from '@rc/fixtures'

export interface StorefrontPreviewProps {
  brand: BrandConfig
  storeName: string
  sections: PageSection[]
  device: Device
  /** Products that product sections show, by id. */
  products: Map<string, Product>
  /** Set on personal store pages, so the hero shows the seller. */
  seller?: Seller | null
  className?: string
}

type SfStyle = CSSProperties & Partial<Record<`--sf-${string}`, string>>

const RADIUS: Record<RadiusScale, string> = { sharp: '2px', soft: '12px', round: '24px' }
const FRAME_WIDTH: Record<Device, string> = {
  desktop: 'max-w-full',
  tablet: 'max-w-[768px]',
  mobile: 'max-w-[375px]',
}

// Tints mix brand tokens with the page background, so they read on any palette.
const tint = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, var(--sf-bg))`
const heading: CSSProperties = { fontFamily: 'var(--sf-heading)' }
const surface: CSSProperties = { background: tint('--sf-text', 5), borderRadius: 'var(--sf-radius)' }

function buttonStyle(style: ButtonStyle): CSSProperties {
  if (style === 'outline')
    return {
      border: '2px solid var(--sf-primary)',
      color: 'var(--sf-primary)',
      borderRadius: 'var(--sf-radius)',
    }
  return {
    background: 'var(--sf-primary)',
    color: 'var(--sf-bg)',
    borderRadius: style === 'pill' ? '9999px' : 'var(--sf-radius)',
  }
}

/**
 * Renders page content through a template with the tenant's brand tokens:
 * CONTENT + TEMPLATE + BRAND TOKEN = RENDERED PAGE. Colours come from the tokens as CSS variables,
 * so classes carry structure only.
 */
export function StorefrontPreview({
  brand,
  storeName,
  sections,
  device,
  products,
  seller,
  className,
}: StorefrontPreviewProps) {
  const vars: SfStyle = {
    '--sf-primary': brand.colors.primary,
    '--sf-secondary': brand.colors.secondary,
    '--sf-accent': brand.colors.accent,
    '--sf-bg': brand.colors.background,
    '--sf-text': brand.colors.text,
    '--sf-radius': RADIUS[brand.radius],
    '--sf-heading': BRAND_FONT_STACK,
    '--sf-body': BRAND_FONT_STACK,
    background: 'var(--sf-bg)',
    color: 'var(--sf-text)',
    fontFamily: 'var(--sf-body)',
  }
  const ctx: Ctx = {
    brand,
    storeName,
    products,
    seller: seller ?? null,
    button: buttonStyle(brand.buttonStyle),
  }
  const visible = sections.filter((s) => !s.hidden)

  return (
    <div className={cn('min-w-0 rounded-2xl p-2 sm:p-3 max-w-full overflow-hidden bg-surface', className)}>
      <div
        className={cn('rounded-xl mx-auto w-full overflow-hidden bg-card shadow-card', FRAME_WIDTH[device])}
      >
        <div className="gap-3 px-3 py-2 flex items-center border-b border-border" aria-hidden="true">
          <span className="gap-1.5 flex shrink-0">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </span>
          <span className="min-w-0 gap-1.5 px-3 py-1 flex flex-1 items-center rounded-full bg-surface text-[0.6875rem] text-muted">
            <Lock className="size-3 shrink-0" />
            <span className="truncate">{storeName}</span>
          </span>
        </div>
        <div className="min-w-0 text-sm @container overflow-hidden" style={vars}>
          <StoreNav ctx={ctx} />
          {visible.length ? (
            visible.map((section) => <Section key={section.id} section={section} ctx={ctx} />)
          ) : (
            <p className="px-6 py-16 text-center opacity-60">
              Every section is hidden. Show a section to see the page.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

interface Ctx {
  brand: BrandConfig
  storeName: string
  products: Map<string, Product>
  seller: Seller | null
  button: CSSProperties
}

function StoreNav({ ctx }: { ctx: Ctx }) {
  return (
    <div
      className="gap-3 px-4 py-3 @3xl:px-8 flex items-center"
      style={{ borderBottom: `1px solid ${tint('--sf-text', 10)}` }}
    >
      <span
        className="size-5 shrink-0"
        style={{ background: 'var(--sf-primary)', borderRadius: 'var(--sf-radius)' }}
      />
      <span className="min-w-0 text-base font-bold flex-1 truncate" style={heading}>
        {ctx.storeName}
      </span>
      <span className="gap-5 text-xs font-medium @2xl:flex hidden">
        <span>New in</span>
        <span>Shop</span>
        <span>Stores</span>
      </span>
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
    </div>
  )
}

function Section({ section, ctx }: { section: PageSection; ctx: Ctx }) {
  switch (section.kind) {
    case 'hero':
      return ctx.seller ? (
        <SellerHero section={section} ctx={ctx} seller={ctx.seller} />
      ) : (
        <Hero section={section} ctx={ctx} />
      )
    case 'category':
      return <Categories section={section} />
    case 'featured_product':
      return <ProductGrid section={section} ctx={ctx} limit={4} />
    case 'collection':
      return <ProductGrid section={section} ctx={ctx} limit={6} collection />
    case 'promotion':
      return <Promotion section={section} />
    case 'countdown':
      return <Countdown section={section} />
    case 'testimonials':
      return <Testimonials section={section} />
    case 'comparison':
      return <Comparison section={section} ctx={ctx} />
    case 'brand_story':
      return <BrandStory section={section} />
    case 'faq':
      return <Faq section={section} />
    case 'cta':
      return <CtaBand section={section} ctx={ctx} />
    case 'footer':
      return <Footer ctx={ctx} />
  }
}

/** Copy the editor has not filled in yet shows the section name, faded. */
function Copy({
  text,
  fallback,
  as = 'span',
  className,
  style,
}: {
  text: string
  fallback: string
  as?: 'span' | 'h2' | 'p'
  className?: string
  style?: CSSProperties
}) {
  const Tag = as
  const empty = !text.trim()
  return (
    <Tag className={cn(className, empty && 'opacity-40')} style={style}>
      {empty ? fallback : text}
    </Tag>
  )
}

function Block({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <section className={cn('px-4 py-8 @3xl:px-8 @3xl:py-12', className)} style={style}>
      {children}
    </section>
  )
}

function SectionTitle({ text, fallback }: { text: string; fallback: string }) {
  return (
    <Copy
      as="h2"
      text={text}
      fallback={fallback}
      className="mb-4 text-xl font-bold @3xl:text-2xl"
      style={heading}
    />
  )
}

function CtaButton({
  label,
  fallback,
  ctx,
  icon,
}: {
  label: string
  fallback: string
  ctx: Ctx
  icon?: ReactNode
}) {
  return (
    <span className="h-10 gap-2 px-5 text-sm font-semibold inline-flex items-center" style={ctx.button}>
      {icon}
      {label.trim() || fallback}
    </span>
  )
}

function ImageBlock({ className, photo }: { className?: string; photo?: string }) {
  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden', className)}
      style={{
        background: tint('--sf-primary', 14),
        borderRadius: 'var(--sf-radius)',
        color: 'var(--sf-primary)',
      }}
    >
      {photo ? (
        <img
          src={photoUrl(photo, 400)}
          alt=""
          loading="lazy"
          className="inset-0 absolute size-full object-cover"
        />
      ) : (
        <ImageIcon className="size-8 opacity-50" aria-hidden="true" />
      )}
    </div>
  )
}

function Hero({ section, ctx }: { section: PageSection; ctx: Ctx }) {
  return (
    <Block style={{ background: tint('--sf-primary', 8) }}>
      <div className="gap-6 @2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] grid grid-cols-1 items-center">
        <div className="min-w-0">
          <p
            className="mb-3 gap-2 font-bold tracking-widest flex items-center text-[0.6875rem] uppercase"
            style={{ color: 'var(--sf-primary)' }}
          >
            <span className="h-1 w-6" style={{ background: 'var(--sf-accent)' }} />
            {ctx.storeName}
          </p>
          <Copy
            as="h2"
            text={section.headline}
            fallback="Add a headline"
            className="text-3xl font-bold leading-tight @3xl:text-5xl"
            style={heading}
          />
          <Copy
            as="p"
            text={section.body}
            fallback="Add a line that says why to shop here."
            className="mt-3 max-w-md opacity-80"
          />
          <div className="mt-5">
            <CtaButton label={section.ctaLabel} fallback="Shop now" ctx={ctx} />
          </div>
        </div>
        <ImageBlock className="@2xl:flex hidden aspect-[4/3]" />
      </div>
    </Block>
  )
}

function SellerHero({ section, ctx, seller }: { section: PageSection; ctx: Ctx; seller: Seller }) {
  // A locked headline renders the tenant's line on every personal store.
  const headline = ctx.brand.locks.headline ? ctx.brand.tagline : section.headline
  return (
    <Block style={{ background: tint('--sf-primary', 8) }}>
      <div className="@2xl:flex-row @2xl:items-center @2xl:gap-8 @2xl:text-left flex flex-col items-center text-center">
        <span
          className="size-20 text-2xl font-bold @3xl:size-28 @3xl:text-3xl flex shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--sf-primary)', color: 'var(--sf-bg)', ...heading }}
          aria-hidden="true"
        >
          {initials(seller.name)}
        </span>
        <div className="mt-4 min-w-0 @2xl:mt-0">
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: 'var(--sf-primary)' }}
          >
            {seller.name} · {SELLER_KIND_LABEL[seller.kind]}, {seller.city}
          </p>
          <Copy
            as="h2"
            text={headline}
            fallback="Add a headline"
            className="mt-2 text-2xl font-bold leading-tight @3xl:text-4xl"
            style={heading}
          />
          <Copy
            as="p"
            text={section.body}
            fallback={seller.bio || 'Add a short introduction.'}
            className="mt-2 max-w-md opacity-80"
          />
          <div className="mt-5 gap-2 @2xl:justify-start flex flex-wrap justify-center">
            <CtaButton
              label={section.ctaLabel}
              fallback="Chat on WhatsApp"
              ctx={ctx}
              icon={<MessageCircle className="size-4" aria-hidden="true" />}
            />
          </div>
        </div>
      </div>
    </Block>
  )
}

function Categories({ section }: { section: PageSection }) {
  const items = section.body
    .split(/[·,]/)
    .map((x) => x.trim())
    .filter(Boolean)
  const chips = items.length ? items : ['New in', 'Best sellers', 'Sale']
  return (
    <Block>
      <SectionTitle text={section.headline} fallback={SECTION_KIND_LABEL.category} />
      <div className="gap-2 flex flex-wrap">
        {chips.map((c) => (
          <span
            key={c}
            className="px-4 py-2 text-xs font-semibold"
            style={{ ...surface, opacity: items.length ? 1 : 0.5 }}
          >
            {c}
          </span>
        ))}
      </div>
    </Block>
  )
}

function ProductGrid({
  section,
  ctx,
  limit,
  collection = false,
}: {
  section: PageSection
  ctx: Ctx
  limit: number
  collection?: boolean
}) {
  const list = section.productIds
    .map((id) => ctx.products.get(id))
    .filter((p): p is Product => !!p)
    .slice(0, limit)
  return (
    <Block style={collection ? { background: tint('--sf-secondary', 12) } : undefined}>
      <div className="mb-4 gap-2 flex flex-wrap items-end justify-between">
        <Copy
          as="h2"
          text={section.headline}
          fallback={SECTION_KIND_LABEL[section.kind]}
          className="text-xl font-bold @3xl:text-2xl"
          style={heading}
        />
        <span className="text-xs font-semibold underline underline-offset-4">View all</span>
      </div>
      <div
        className={cn(
          'gap-3 @3xl:gap-4 grid grid-cols-2',
          collection ? '@2xl:grid-cols-3' : '@2xl:grid-cols-4',
        )}
      >
        {list.length
          ? list.map((p) => <ProductCard key={p.id} product={p} />)
          : Array.from({ length: collection ? 3 : 4 }, (_, i) => <PlaceholderCard key={i} />)}
      </div>
    </Block>
  )
}

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="min-w-0">
      <ImageBlock className="aspect-square" photo={productPhoto(product.id)} />
      <p className="mt-2 text-xs font-semibold leading-snug @3xl:text-sm line-clamp-2">{product.name}</p>
      <p className="mt-0.5 gap-x-1.5 text-xs flex flex-wrap items-baseline">
        <span className="font-bold" style={{ color: 'var(--sf-primary)' }}>
          {product.assisted ? 'Talk to sales' : fmtIdr(product.price)}
        </span>
        {product.compareAt && !product.assisted && (
          <span className="line-through opacity-50">{fmtIdr(product.compareAt)}</span>
        )}
      </p>
    </div>
  )
}

function PlaceholderCard() {
  return (
    <div className="min-w-0 opacity-50">
      <ImageBlock className="aspect-square" />
      <p className="mt-2 text-xs font-semibold">Choose a product</p>
      <p className="mt-0.5 text-xs">Price</p>
    </div>
  )
}

function Promotion({ section }: { section: PageSection }) {
  return (
    <Block>
      <div
        className="gap-4 p-6 @2xl:flex-row @2xl:items-center @2xl:justify-between flex flex-col"
        style={{ background: 'var(--sf-primary)', color: 'var(--sf-bg)', borderRadius: 'var(--sf-radius)' }}
      >
        <div className="min-w-0">
          <p className="font-bold tracking-widest text-[0.6875rem] uppercase opacity-80">Limited offer</p>
          <Copy
            as="p"
            text={section.body}
            fallback="Describe the offer"
            className="mt-1 text-lg font-bold leading-snug @3xl:text-2xl"
            style={heading}
          />
        </div>
        <span
          className="px-4 py-2 text-sm font-bold tracking-wider @2xl:self-center shrink-0 self-start border-2 border-dashed font-mono"
          style={{ borderColor: 'var(--sf-bg)', borderRadius: 'var(--sf-radius)' }}
        >
          {section.headline.trim() || 'CODE'}
        </span>
      </div>
    </Block>
  )
}

const COUNTDOWN = [
  ['03', 'Days'],
  ['14', 'Hours'],
  ['22', 'Mins'],
  ['09', 'Secs'],
] as const

function Countdown({ section }: { section: PageSection }) {
  return (
    <Block className="text-center">
      <Copy
        as="p"
        text={section.headline}
        fallback="Offer ends soon"
        className="mb-4 text-xs font-bold tracking-widest uppercase"
      />
      <div className="max-w-sm gap-2 mx-auto grid grid-cols-4">
        {COUNTDOWN.map(([value, label]) => (
          <div key={label} className="py-3" style={surface}>
            <p className="text-2xl font-bold @3xl:text-3xl tabular-nums" style={heading}>
              {value}
            </p>
            <p className="tracking-wider text-[0.625rem] uppercase opacity-70">{label}</p>
          </div>
        ))}
      </div>
    </Block>
  )
}

const QUOTES = [
  { quote: 'Exactly what I needed, and it arrived in two days.', name: 'Dewi, Bandung' },
  { quote: 'Honest advice before I bought. I will order again.', name: 'Andre, Surabaya' },
  { quote: 'Quality matches the photos. Packaging was neat.', name: 'Rina, Jakarta' },
]

function Testimonials({ section }: { section: PageSection }) {
  return (
    <Block>
      <div className="mb-4">
        <Copy
          as="h2"
          text={section.headline}
          fallback={SECTION_KIND_LABEL.testimonials}
          className="text-xl font-bold @3xl:text-2xl"
          style={heading}
        />
        {section.body.trim() && <p className="mt-1 text-xs opacity-70">{section.body}</p>}
      </div>
      <div className="gap-3 @2xl:grid-cols-3 grid grid-cols-1">
        {QUOTES.map((q) => (
          <figure key={q.name} className="p-4" style={surface}>
            <div className="gap-0.5 flex" style={{ color: 'var(--sf-accent)' }} aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="size-3.5 fill-current" />
              ))}
            </div>
            <blockquote className="mt-2 text-sm leading-snug">{q.quote}</blockquote>
            <figcaption className="mt-2 text-xs opacity-70">{q.name}</figcaption>
          </figure>
        ))}
      </div>
    </Block>
  )
}

function Comparison({ section, ctx }: { section: PageSection; ctx: Ctx }) {
  const [a, b] = section.productIds.map((id) => ctx.products.get(id)).filter((p): p is Product => !!p)
  const cols = [a, b]
  const rows: { label: string; value: (p: Product) => string }[] = [
    { label: 'Price', value: (p) => (p.assisted ? 'Talk to sales' : fmtIdr(p.price)) },
    { label: 'Rating', value: (p) => `${p.rating.toFixed(1)} of 5` },
    { label: 'Reviews', value: (p) => String(p.reviewCount) },
    { label: 'Best for', value: (p) => p.bestFor || 'Everyday use' },
  ]
  return (
    <Block>
      <SectionTitle text={section.headline} fallback={SECTION_KIND_LABEL.comparison} />
      <div
        className="overflow-hidden"
        style={{ borderRadius: 'var(--sf-radius)', border: `1px solid ${tint('--sf-text', 12)}` }}
      >
        <table className="text-xs @3xl:text-sm w-full table-fixed text-left">
          <thead>
            <tr style={{ background: tint('--sf-text', 5) }}>
              <th className="p-3 font-semibold w-1/4 opacity-70" />
              {cols.map((p, i) => (
                <th key={i} className={cn('p-3 font-bold', !p && 'opacity-40')} style={heading}>
                  <span className="line-clamp-2">{p?.name ?? `Product ${i === 0 ? 'A' : 'B'}`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderTop: `1px solid ${tint('--sf-text', 10)}` }}>
                <td className="p-3 opacity-70">{r.label}</td>
                {cols.map((p, i) => (
                  <td key={i} className={cn('p-3', !p && 'opacity-40')}>
                    <span className="line-clamp-2">{p ? r.value(p) : 'Choose a product'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  )
}

function BrandStory({ section }: { section: PageSection }) {
  return (
    <Block>
      <div className="gap-6 @2xl:grid-cols-2 grid grid-cols-1 items-center">
        <ImageBlock className="aspect-[4/3]" />
        <div className="min-w-0">
          <p
            className="mb-2 font-bold tracking-widest text-[0.6875rem] uppercase"
            style={{ color: 'var(--sf-primary)' }}
          >
            Our story
          </p>
          <Copy
            as="h2"
            text={section.headline}
            fallback={SECTION_KIND_LABEL.brand_story}
            className="text-2xl font-bold leading-tight @3xl:text-3xl"
            style={heading}
          />
          <Copy
            as="p"
            text={section.body}
            fallback="Tell visitors where the brand comes from."
            className="mt-3 leading-relaxed opacity-80"
          />
        </div>
      </div>
    </Block>
  )
}

function Faq({ section }: { section: PageSection }) {
  const [question, ...rest] = section.body.split('?')
  const first = question?.trim() ? { q: `${question.trim()}?`, a: rest.join('?').trim() } : null
  const items = [
    first ?? { q: 'Add a question in the body', a: '' },
    { q: 'How long does delivery take?', a: '' },
    { q: 'Can I return an item?', a: '' },
  ]
  return (
    <Block>
      <SectionTitle text={section.headline} fallback="Questions" />
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.q} className="p-4" style={surface}>
            <p
              className={cn(
                'gap-3 font-semibold flex items-center justify-between',
                !first && i === 0 && 'opacity-40',
              )}
            >
              <span className="min-w-0">{item.q}</span>
              <ChevronDown
                className={cn('size-4 shrink-0', i === 0 && item.a && 'rotate-180')}
                aria-hidden="true"
              />
            </p>
            {i === 0 && item.a && <p className="mt-2 text-xs leading-relaxed opacity-80">{item.a}</p>}
          </div>
        ))}
      </div>
    </Block>
  )
}

function CtaBand({ section, ctx }: { section: PageSection; ctx: Ctx }) {
  return (
    <Block className="text-center" style={{ background: 'var(--sf-text)', color: 'var(--sf-bg)' }}>
      <Copy
        as="h2"
        text={section.headline}
        fallback="Add a call to action"
        className="text-2xl font-bold @3xl:text-3xl"
        style={heading}
      />
      {section.body.trim() && <p className="mt-2 max-w-md mx-auto opacity-80">{section.body}</p>}
      <div className="mt-5">
        <CtaButton label={section.ctaLabel} fallback="Get started" ctx={ctx} />
      </div>
    </Block>
  )
}

function Footer({ ctx }: { ctx: Ctx }) {
  const columns = [
    ['Shop', 'New in', 'Best sellers', 'Gift cards'],
    ['Help', 'Shipping', 'Returns', 'Contact'],
    ['Follow', 'Instagram', 'TikTok', 'WhatsApp'],
  ]
  return (
    <footer className="px-4 py-8 text-xs @3xl:px-8" style={{ background: tint('--sf-secondary', 14) }}>
      <div className="gap-6 @2xl:grid-cols-4 grid grid-cols-2">
        <div className="min-w-0 @2xl:col-span-1 col-span-2">
          <p className="text-base font-bold" style={heading}>
            {ctx.storeName}
          </p>
          <p className="mt-1 opacity-70">{ctx.brand.tagline}</p>
        </div>
        {columns.map(([title, ...links]) => (
          <div key={title} className="min-w-0">
            <p className="mb-2 font-bold">{title}</p>
            <ul className="space-y-1 opacity-70">
              {links.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 pt-4 opacity-60" style={{ borderTop: `1px solid ${tint('--sf-text', 12)}` }}>
        © {ctx.storeName}. Prices in rupiah, taxes included.
      </p>
    </footer>
  )
}
