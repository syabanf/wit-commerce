import { type TemplateLook, lookFor, nowMs, tenantPhotos } from '@rc/fixtures'
import type { PageSection } from '@rc/types'
import { cn } from '@rc/ui'
import { type ReactNode, createContext, useContext } from 'react'
import { currentDeal, welcomePromotion } from '../lib/catalog'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { Countdown } from './Countdown'
import { Underlined } from './ornaments'
import { Photo } from './product'
import { CouponCode, PromoValue, Ticket, promoTerms } from './promo'
import { ButtonLink } from './ui'

export const SPACING: Record<TemplateLook['spacing'], string> = {
  airy: 'space-y-14 md:space-y-20 lg:space-y-28',
  regular: 'space-y-10 md:space-y-14 lg:space-y-16',
  dense: 'space-y-6 md:space-y-8 lg:space-y-10',
}

/** Product section layout per look: how many products, rail or grid, and extra grid classes. */
export const PRODUCT_LAYOUT: Record<
  TemplateLook['products'],
  { limit: number; rail: boolean; className?: string }
> = {
  rail: { limit: 6, rail: true },
  // One large product beside two stacked ones: a full 2x2 bento with no empty cell.
  feature: {
    limit: 3,
    rail: false,
    className:
      'md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 md:items-start md:[&>li:first-child]:col-span-2 md:[&>li:first-child]:row-span-2',
  },
  grid: { limit: 8, rail: false },
}

const LookContext = createContext<TemplateLook>(lookFor(null))

export function TemplateLookProvider({
  templateId,
  children,
}: {
  templateId?: string | null
  children: ReactNode
}) {
  return <LookContext value={lookFor(templateId)}>{children}</LookContext>
}

export const useTemplateLook = () => useContext(LookContext)

/** The hero a template asks for, or null when the theme's own hero should render. */
export function TemplateHero({ section }: { section: PageSection }) {
  const { hero } = useTemplateLook()
  if (hero === 'immersive') return <ImmersiveHero section={section} />
  if (hero === 'offer') return <OfferHero section={section} />
  if (hero === 'compact') return <CompactHero section={section} />
  return null
}

/** Editorial: a full-bleed photo with the headline set large over a dark fade. */
function ImmersiveHero({ section }: { section: PageSection }) {
  const { tenant, store } = useShop()
  return (
    <section
      aria-label="Featured"
      className="md:min-h-[560px] lg:min-h-[640px] text-white relative flex min-h-[440px] items-end overflow-hidden rounded-[var(--sf-card-radius)]"
    >
      <Photo id={tenantPhotos(tenant.id)?.hero} width={1800} ratio={0.5} eager className="inset-0 absolute" />
      <div
        aria-hidden="true"
        className="inset-0 absolute"
        style={{ background: 'linear-gradient(180deg, transparent 25%, rgb(0 0 0 / 0.7))' }} // wit-allow: scrim so white type reads on any photo
      />
      <div className="max-w-3xl p-6 md:p-12 lg:p-16 relative">
        <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-80">{tenant.name}</p>
        <h1 className="sf-hero-title mt-3">
          <Underlined text={section.headline || tenant.brand.tagline} />
        </h1>
        {section.body && <p className="mt-4 max-w-xl text-lg opacity-90">{section.body}</p>}
        <ButtonLink to={paths.search(store, '', { sort: 'best' })} variant="light" size="lg" className="mt-8">
          {section.ctaLabel || 'Discover the range'}
        </ButtonLink>
      </div>
    </section>
  )
}

/** Conversion: the offer leads as a voucher, with the countdown and one call to action. */
function OfferHero({ section }: { section: PageSection }) {
  const { catalog, store, tenant } = useShop()
  const now = nowMs()
  // The offer the hero names ("Claim RUNMONTH15"), else the deal ending soonest, else the first-order code.
  const text = `${section.headline} ${section.body} ${section.ctaLabel}`.toUpperCase()
  const named = catalog.promotions.find((p) => p.code && text.includes(p.code.toUpperCase()))
  const promotion = named ?? currentDeal(catalog, now)?.promotion ?? welcomePromotion(catalog, now)
  const body = (
    <div className="gap-6 lg:flex-row lg:items-end lg:justify-between flex flex-col">
      <div className="min-w-0 max-w-2xl">
        <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-75">{tenant.name}</p>
        <h1 className="sf-hero-title mt-2">{section.headline || tenant.brand.tagline}</h1>
        {section.body && <p className="mt-3 text-lg opacity-85">{section.body}</p>}
        <div className="mt-6 gap-3 flex flex-wrap items-center">
          <ButtonLink to={paths.search(store, '', { deals: true })} variant="light" size="lg">
            {section.ctaLabel || 'Shop the offer'}
          </ButtonLink>
          {promotion?.trigger === 'code' && <CouponCode code={promotion.code} />}
        </div>
      </div>
      {promotion && (
        <div className="shrink-0">
          <p className="mb-2 font-bold text-[11px] tracking-[0.16em] uppercase opacity-75">Ends in</p>
          <Countdown endAt={promotion.endAt} boxClassName="bg-[var(--sf-bg)] text-[color:var(--sf-text)]" />
          <p className="mt-2 text-xs opacity-75">{promoTerms(promotion)}</p>
        </div>
      )}
    </div>
  )
  const surface = 'bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]'
  return (
    <section aria-label="Featured">
      {promotion ? (
        <Ticket
          className={surface}
          stub={<PromoValue promotion={promotion} className="text-7xl md:text-8xl" />}
        >
          {body}
        </Ticket>
      ) : (
        <div className={cn('p-6 md:p-10 rounded-[var(--sf-card-radius)]', surface)}>{body}</div>
      )}
    </section>
  )
}

/** Catalog: a slim banner so the category grid and products start high on the page. */
function CompactHero({ section }: { section: PageSection }) {
  const { tenant, store } = useShop()
  return (
    <section
      aria-label="Featured"
      className="sf-card gap-6 p-4 md:grid-cols-[minmax(0,1fr)_280px] md:p-6 lg:grid-cols-[minmax(0,1fr)_360px] grid grid-cols-1 items-center"
    >
      <div className="min-w-0 md:pl-2">
        <h1 className="sf-display text-3xl font-bold tracking-tight md:text-4xl">
          {section.headline || tenant.brand.tagline}
        </h1>
        {section.body && <p className="mt-2 max-w-2xl text-[color:var(--sf-muted)]">{section.body}</p>}
        <ButtonLink to={paths.search(store, '', { sort: 'best' })} className="mt-5">
          {section.ctaLabel || 'Browse the catalog'}
        </ButtonLink>
      </div>
      <Photo
        id={tenantPhotos(tenant.id)?.hero}
        width={720}
        ratio={0.5}
        eager
        className="md:block hidden aspect-[2/1] rounded-[var(--sf-tile-radius)]"
      />
    </section>
  )
}
