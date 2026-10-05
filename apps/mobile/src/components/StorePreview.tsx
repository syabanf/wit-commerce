import { fmtIdr, initials, photoUrl, productPhoto } from '@rc/fixtures'
import type {
  BrandConfig,
  Page,
  PageSection,
  Product,
  SectionKind,
  Seller,
  Template,
  Tenant,
} from '@rc/types'
import { cn } from '@rc/ui'
import { MessageCircle, Quote, Star } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { firstName } from '../lib/seller'
import { BRAND_FONT_STACK } from '@rc/fixtures'

// CONTENT + TEMPLATE + BRAND TOKEN = RENDERED PAGE. The template decides which sections show and
// in what order, the seller's page holds the words, and the tenant's brand supplies colours and type.
// Brand colours are tenant data, so they arrive as CSS variables in an inline style.

const RADIUS: Record<BrandConfig['radius'], string> = {
  sharp: 'rounded-none',
  soft: 'rounded-lg',
  round: 'rounded-2xl',
}

function brandStyle(brand: BrandConfig): CSSProperties {
  const { colors } = brand
  return {
    '--sp-primary': colors.primary,
    '--sp-secondary': colors.secondary,
    '--sp-accent': colors.accent,
    '--sp-bg': colors.background,
    '--sp-text': colors.text,
    '--sp-heading': BRAND_FONT_STACK,
    fontFamily: BRAND_FONT_STACK,
  } as CSSProperties
}

interface Ctx {
  brand: BrandConfig
  seller: Seller
  tenant: Tenant
  storeUrl: string
  products: Product[]
  content: (kind: SectionKind) => PageSection | undefined
}

function CtaPill({ brand, children }: { brand: BrandConfig; children: ReactNode }) {
  const shape = brand.buttonStyle === 'pill' ? 'rounded-full' : RADIUS[brand.radius]
  return (
    <span
      className={cn(
        'h-8 gap-1.5 px-3.5 font-semibold inline-flex items-center text-[11px]',
        shape,
        brand.buttonStyle === 'outline'
          ? 'border-2 border-(--sp-primary) text-(--sp-primary)'
          : 'text-white bg-(--sp-primary)',
      )}
    >
      <MessageCircle aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  )
}

const heading = 'font-(family-name:--sp-heading) font-bold leading-tight'

function Block({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('px-4 py-4', className)}>
      {title && <p className={cn(heading, 'mb-2.5 text-sm')}>{title}</p>}
      {children}
    </div>
  )
}

function renderSection(kind: SectionKind, ctx: Ctx): ReactNode {
  const { brand, seller, tenant, products } = ctx
  const s = ctx.content(kind)
  const radius = RADIUS[brand.radius]
  const name = firstName(seller.name)
  switch (kind) {
    case 'hero':
      return (
        <div className="px-4 pb-5 pt-6 bg-(--sp-primary)/10 text-center">
          <span className="size-14 text-base font-bold text-white mx-auto flex items-center justify-center rounded-full bg-(--sp-primary)">
            {initials(seller.name)}
          </span>
          <p className="mt-2 text-[11px] opacity-70">
            {seller.name} · {tenant.name}
          </p>
          <p className={cn(heading, 'mt-1 text-lg')}>{s?.headline || seller.headline}</p>
          <p className="mt-1 mx-auto max-w-[16rem] text-[11px] opacity-80">{s?.body || seller.bio}</p>
          <div className="mt-3">
            <CtaPill brand={brand}>{s?.ctaLabel || 'Chat on WhatsApp'}</CtaPill>
          </div>
        </div>
      )
    case 'featured_product':
      return (
        <Block title={s?.headline || `${name}'s picks`}>
          {products.length ? (
            <div className="gap-2 grid grid-cols-2">
              {products.map((p) => (
                <div key={p.id} className={cn('overflow-hidden bg-(--sp-secondary)/5', radius)}>
                  {productPhoto(p.id) ? (
                    <img
                      src={photoUrl(productPhoto(p.id)!, 320, 0.75)}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="text-sm font-bold flex aspect-[4/3] items-center justify-center bg-(--sp-secondary)/10 font-(family-name:--sp-heading) opacity-60">
                      {initials(p.name)}
                    </div>
                  )}
                  <div className="p-2">
                    <p className="font-semibold leading-snug line-clamp-2 text-[11px]">{p.name}</p>
                    <p className="mt-0.5 font-bold text-[11px] text-(--sp-primary)">
                      {p.assisted ? 'Ask me' : fmtIdr(p.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] opacity-70">Pick up to four products to show here.</p>
          )}
        </Block>
      )
    case 'testimonials':
      return (
        <Block title={s?.headline || 'What my customers say'}>
          <div className={cn('p-3 bg-(--sp-secondary)/5', radius)}>
            <Quote aria-hidden="true" className="size-4 text-(--sp-accent)" />
            <p className="mt-1 text-[11px] italic">{s?.body || 'Helpful, honest, fast replies.'}</p>
            <p className="mt-2 gap-1 font-semibold flex items-center text-[10px] opacity-70">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} aria-hidden="true" className="size-3 fill-(--sp-accent) text-(--sp-accent)" />
              ))}
              Verified buyer
            </p>
          </div>
        </Block>
      )
    case 'brand_story':
      return (
        <Block title={s?.headline || `About ${name}`}>
          <p className="text-[11px] opacity-80">{s?.body || seller.bio}</p>
        </Block>
      )
    case 'promotion':
      return (
        <div className="px-4 py-2.5 font-semibold bg-(--sp-accent) text-center text-[11px] text-(--sp-text)">
          {s?.headline || tenant.brand.tagline}
        </div>
      )
    case 'comparison': {
      const [a, b] = products
      if (!a || !b) return null
      return (
        <Block title={s?.headline || 'Which one fits you'}>
          <div className="gap-2 grid grid-cols-2 text-[11px]">
            {[a, b].map((p) => (
              <div key={p.id} className={cn('p-2 bg-(--sp-secondary)/5', radius)}>
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 opacity-70">{p.bestFor}</p>
              </div>
            ))}
          </div>
        </Block>
      )
    }
    case 'collection':
      return (
        <Block title={s?.headline || `More from ${tenant.name}`}>
          <p className="text-[11px] opacity-70">
            The full catalogue, with your link attached to every order.
          </p>
        </Block>
      )
    case 'faq':
      return (
        <Block title={s?.headline || 'Questions'}>
          <p className="font-semibold text-[11px]">How fast do you reply?</p>
          <p className="text-[11px] opacity-70">{s?.body || 'Usually within the hour on WhatsApp.'}</p>
        </Block>
      )
    case 'cta':
      return (
        <Block className="text-center">
          <p className={cn(heading, 'text-sm')}>{s?.headline || 'Questions before you buy?'}</p>
          <div className="mt-2.5">
            <CtaPill brand={brand}>{s?.ctaLabel || 'Message me'}</CtaPill>
          </div>
        </Block>
      )
    case 'footer':
      return (
        <div className="px-4 py-3 text-white/80 bg-(--sp-secondary) text-center text-[10px]">
          {tenant.name} · {ctx.storeUrl}
        </div>
      )
    default:
      return null
  }
}

/** A compact phone preview of the seller's personal page, drawn with the tenant's brand tokens. */
export function StorePreview({
  tenant,
  seller,
  page,
  template,
  products,
  storeUrl,
}: {
  tenant: Tenant
  seller: Seller
  page: Page | null
  template: Template | undefined
  /** The featured products, in order. */
  products: Product[]
  storeUrl: string
}) {
  const kinds = (template?.sections ?? []).map((s) => s.kind)
  const hidden = new Set(page?.sections.filter((s) => s.hidden).map((s) => s.kind))
  const ctx: Ctx = {
    brand: tenant.brand,
    seller,
    tenant,
    storeUrl,
    products,
    content: (kind) => page?.sections.find((s) => s.kind === kind),
  }
  return (
    <figure className="p-2 rounded-[30px] bg-ink shadow-float">
      <figcaption className="sr-only">
        Preview of your store with the {template?.name ?? 'current'} template
      </figcaption>
      <div
        style={brandStyle(tenant.brand)}
        className="no-scrollbar max-h-[34rem] overflow-y-auto rounded-[22px] bg-(--sp-bg) text-(--sp-text)"
      >
        <div className="top-0 px-4 py-1.5 backdrop-blur sticky z-10 flex items-center justify-center bg-(--sp-bg)/90 text-[10px] opacity-80">
          {storeUrl}
        </div>
        {kinds
          .filter((kind) => !hidden.has(kind))
          .map((kind) => (
            <div key={kind}>{renderSection(kind, ctx)}</div>
          ))}
      </div>
    </figure>
  )
}
