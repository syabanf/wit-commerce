import { fmtIdr } from '@rc/fixtures'
import type { Industry, PageSection, PaymentMethod, Product } from '@rc/types'
import { cn } from '@rc/ui'
import {
  ArrowRight,
  BadgePercent,
  CalendarHeart,
  CreditCard,
  Crown,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Link } from 'react-router'
import { type MessageKey, t, tp } from '../i18n'
import { isBuyable, sortProducts } from '../lib/catalog'
import { paths } from '../lib/paths'
import { readRaw, writeStored } from '../lib/storage'
import { useShop } from '../state/shop'
import { useTheme } from '../themes/registry'
import { type HeadingProps, PlainHeading, RAIL, lgCols, sellerKindLabel } from './sections'

type Heading = (p: HeadingProps) => ReactNode

const RETURNS: Partial<Record<Industry, { title: MessageKey; text: MessageKey }>> = {
  sport: { title: 'catalog.benefit.returns14', text: 'catalog.benefit.returns.sport' },
  beauty: { title: 'catalog.benefit.returns14', text: 'catalog.benefit.returns.beauty' },
  industrial: { title: 'catalog.benefit.returnsParts', text: 'catalog.benefit.returns.industrial' },
}

/** Short method names, so the ways-to-pay line fits one line in the strip. */
const PAY_SHORT: Record<PaymentMethod, MessageKey> = {
  qris: 'catalog.pay.qris',
  va: 'catalog.pay.va',
  bank_transfer: 'catalog.pay.transfer',
  credit_card: 'catalog.pay.card',
  ewallet: 'catalog.pay.ewallet',
  paylater: 'catalog.pay.paylater',
  cod: 'catalog.pay.cod',
}

/**
 * What every order gets: free shipping, returns, ways to pay and points, read from the tenant setup.
 * Beauty tenants swap pay and points for the BPOM and consultation facts, so one strip covers both.
 */
export function BenefitsStrip() {
  const { catalog, tenant } = useShop()
  const pays = catalog.paymentTypes.filter((p) => p.enabled).sort((a, b) => a.sort - b.sort)
  const points = tenant.loyalty.pointsPer10k
  const bpom = catalog.attributes.find((a) => a.code === 'bpom_number')
  const returns = RETURNS[tenant.industry] ?? RETURNS.sport!
  const items = [
    {
      icon: Truck,
      title: t('catalog.benefit.freeShipping'),
      text: t('catalog.benefit.freeShippingText', { amount: fmtIdr(tenant.loyalty.freeShippingMin) }),
    },
    { icon: RotateCcw, title: t(returns.title), text: t(returns.text) },
    ...(tenant.industry === 'beauty'
      ? [
          {
            icon: ShieldCheck,
            title: t('catalog.benefit.bpom', {
              count: catalog.products.filter((p) => bpom && p.attributes[bpom.id]).length,
            }),
            text: t('catalog.benefit.bpomText'),
          },
          {
            icon: CalendarHeart,
            title: t('catalog.benefit.consult'),
            text: t('catalog.benefit.consultText'),
          },
        ]
      : [
          {
            icon: CreditCard,
            title: tp('catalog.benefit.ways', pays.length),
            text: [...new Set(pays.map((p) => t(PAY_SHORT[p.method])))].slice(0, 4).join(', '),
          },
          points > 0
            ? {
                icon: Crown,
                title: t('catalog.benefit.points'),
                text: tp('catalog.benefit.pointsText', points),
              }
            : {
                icon: MessageCircle,
                title: t('catalog.price.talkToSales'),
                text: t('catalog.benefit.salesText'),
              },
        ]),
  ]
  return (
    <ul
      aria-label={t('catalog.benefit.aria')}
      className="sf-card md:grid-cols-2 lg:grid-cols-4 grid grid-cols-1 gap-px overflow-hidden"
    >
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="gap-3 px-4 py-3 md:p-4 md:items-start flex items-center bg-[var(--sf-bg)]">
          <span className="size-10 flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-soft)] text-[color:var(--sf-primary-text)]">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="text-sm font-bold block">{title}</span>
            <span className="mt-0.5 text-xs line-clamp-2 block text-[color:var(--sf-muted)]">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

type TabKey = 'trending' | 'new' | 'best' | 'deals'
const TABS: { key: TabKey; label: MessageKey }[] = [
  { key: 'trending', label: 'catalog.tabs.trending' },
  { key: 'new', label: 'catalog.sort.new' },
  { key: 'best', label: 'catalog.tabs.best' },
  { key: 'deals', label: 'catalog.tabs.deals' },
]

/**
 * Hides cards that would leave a partial last row of eight on the listing grid: six at three columns
 * (md), five at five (xl), six at six (2xl).
 */
const FULL_ROWS =
  'md:max-lg:[&>li:nth-child(n+7)]:hidden xl:max-2xl:[&>li:nth-child(n+6)]:hidden 2xl:[&>li:nth-child(n+7)]:hidden'

/** Trending, new, best-selling and discounted products behind one row of tabs, on the theme's listing grid. */
export function ProductTabs({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { catalog, store } = useShop()
  const { ProductGrid } = useTheme()
  const [tab, setTab] = useState<TabKey>('trending')
  const id = useId()
  const buyable = catalog.products.filter((p) => isBuyable(catalog, p))
  const lists: Record<TabKey, Product[]> = {
    trending: [...buyable].sort((a, b) => b.views30d - a.views30d),
    new: sortProducts(buyable, 'new'),
    best: sortProducts(buyable, 'best'),
    deals: buyable.filter((p) => p.compareAt !== null && p.compareAt > p.price),
  }
  const tabs = TABS.filter((tab) => lists[tab.key].length > 0)
  const sortFor: Record<TabKey, 'best' | 'new'> = {
    trending: 'best',
    new: 'new',
    best: 'best',
    deals: 'best',
  }
  return (
    <section aria-labelledby={`${id}-h`}>
      <Heading
        id={`${id}-h`}
        title={t('catalog.tabs.title')}
        action={{
          label: t('catalog.tabs.shopAll'),
          to: paths.search(store, '', { sort: sortFor[tab], deals: tab === 'deals' }),
        }}
      />
      <div role="tablist" aria-label={t('catalog.tabs.aria')} className="mb-4 gap-2 no-scrollbar flex overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${id}-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`${id}-panel`}
            onClick={() => setTab(item.key)}
            className={cn(
              'min-h-11 px-4 text-sm font-semibold shrink-0 rounded-[var(--sf-pill)] transition',
              tab === item.key
                ? 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]'
                : 'border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)]',
            )}
          >
            {t(item.label)}
            <sup className="ml-0.5 text-[10px] opacity-70">{lists[item.key].length}</sup>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        <ProductGrid products={lists[tab].slice(0, 8)} className={FULL_ROWS} />
      </div>
    </section>
  )
}

/** Search shortcuts by what the shopper is doing, per industry (spec 19: shop by use case and mood). */
const USE_CASES: Record<Industry, { label: MessageKey; q: string; hint: MessageKey }[]> = {
  sport: [
    { label: 'catalog.useCase.sport.1', q: 'beginner', hint: 'catalog.useCase.sport.1.hint' },
    { label: 'catalog.useCase.sport.2', q: 'daily trainer', hint: 'catalog.useCase.sport.2.hint' },
    { label: 'catalog.useCase.sport.3', q: 'race', hint: 'catalog.useCase.sport.3.hint' },
    { label: 'catalog.useCase.sport.4', q: 'trail', hint: 'catalog.useCase.sport.4.hint' },
    { label: 'catalog.useCase.sport.5', q: 'recovery', hint: 'catalog.useCase.sport.5.hint' },
  ],
  beauty: [
    { label: 'catalog.useCase.beauty.1', q: 'sensitive', hint: 'catalog.useCase.beauty.1.hint' },
    { label: 'catalog.useCase.beauty.2', q: 'brightening', hint: 'catalog.useCase.beauty.2.hint' },
    { label: 'catalog.useCase.beauty.3', q: 'lip', hint: 'catalog.useCase.beauty.3.hint' },
    { label: 'catalog.useCase.beauty.4', q: 'bundle', hint: 'catalog.useCase.beauty.4.hint' },
    { label: 'catalog.useCase.beauty.5', q: 'frizz', hint: 'catalog.useCase.beauty.5.hint' },
  ],
  industrial: [
    { label: 'catalog.useCase.industrial.1', q: 'cnc', hint: 'catalog.useCase.industrial.1.hint' },
    { label: 'catalog.useCase.industrial.2', q: 'compressor', hint: 'catalog.useCase.industrial.2.hint' },
    { label: 'catalog.useCase.industrial.3', q: 'filter', hint: 'catalog.useCase.industrial.3.hint' },
    { label: 'catalog.useCase.industrial.4', q: 'service', hint: 'catalog.useCase.industrial.4.hint' },
  ],
  fnb: [],
  fashion: [],
  electronics: [],
}

export function UseCases({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { tenant, store } = useShop()
  const id = useId()
  const cases = USE_CASES[tenant.industry]
  if (!cases.length) return null
  return (
    <section aria-labelledby={`${id}-h`}>
      <Heading id={`${id}-h`} title={t('catalog.useCase.title')} />
      <ul className={cn(RAIL, 'py-1 lg:py-0', lgCols(cases.length))}>
        {cases.map((c, i) => (
          <li key={c.q} className="md:w-[30%] lg:w-auto w-[180px] shrink-0 snap-start">
            <Link
              to={paths.search(store, c.q)}
              className="sf-card group min-h-32 p-4 hover:-translate-y-0.5 flex h-full flex-col transition"
              style={
                i === 0
                  ? {
                      background: 'var(--sf-primary)',
                      color: 'var(--sf-on-primary)',
                      borderColor: 'transparent',
                    }
                  : undefined
              }
            >
              <span className="sf-display text-lg leading-tight font-bold">{t(c.label)}</span>
              <span className="gap-2 pt-3 text-xs mt-auto flex items-end justify-between">
                {t(c.hint)}
                <ArrowRight
                  className="size-4 group-hover:translate-x-0.5 shrink-0 transition"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Personal stores of the tenant's sellers (spec 13): shop with someone who knows the products. */
export function SellersRow({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { catalog, store } = useShop()
  const id = useId()
  const live = new Set(
    catalog.pages.filter((p) => p.sellerId && p.status === 'published').map((p) => p.sellerId),
  )
  const sellers = catalog.sellers.filter((s) => s.status === 'active' && live.has(s.id)).slice(0, 4)
  if (!sellers.length) return null
  return (
    <section aria-labelledby={`${id}-h`}>
      <Heading id={`${id}-h`} title={t('catalog.sellers.title')} />
      <ul className={cn(RAIL, 'py-1 lg:py-0', lgCols(sellers.length, 4))}>
        {sellers.map((s) => (
          <li key={s.id} className="md:w-[40%] lg:w-auto w-[72%] shrink-0 snap-start">
            <Link
              to={paths.seller(store, s.slug)}
              className="sf-card gap-3 p-3 md:p-4 hover:-translate-y-0.5 flex h-full items-start transition"
            >
              <span
                aria-hidden="true"
                className="size-11 text-sm font-bold md:size-12 flex shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
              >
                {s.name
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('')}
              </span>
              <span className="min-w-0">
                <span className="font-bold block truncate">{s.name}</span>
                <span className="text-xs block text-[color:var(--sf-muted)]">
                  {sellerKindLabel(s.kind)} · {s.city}
                </span>
                <span className="mt-1.5 text-sm line-clamp-2 block min-h-[2lh]">{s.headline || s.bio}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Email sign-up. The demo keeps the address on this device and shows the welcome code. */
export function Newsletter() {
  const { tenant, catalog } = useShop()
  const key = `rc.storefront.newsletter.${tenant.id}`
  const [done, setDone] = useState(() => readRaw('local', key) !== null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const welcome = catalog.promotions.find((p) => p.code === 'WELCOME10' && p.status === 'active')
  const inputId = useId()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('catalog.news.invalid'))
      return
    }
    writeStored('local', key, email.trim())
    setDone(true)
  }

  return (
    <section
      aria-labelledby={`${inputId}-h`}
      className="sf-card gap-5 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 grid grid-cols-1 items-center"
      style={{ background: 'color-mix(in srgb, var(--sf-primary) 8%, var(--sf-bg))' }}
    >
      <div>
        <p className="gap-2 text-xs font-bold tracking-widest flex items-center text-[color:var(--sf-primary-text)] uppercase">
          <BadgePercent className="size-4" aria-hidden="true" />
          {t('catalog.news.kicker')}
        </p>
        <h2 id={`${inputId}-h`} className="sf-display mt-2 text-2xl font-bold md:text-3xl text-balance">
          {t('catalog.news.title')}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--sf-muted)]">
          {welcome ? t('catalog.news.welcome', { code: welcome.code }) : t('catalog.news.noWelcome')}
        </p>
      </div>
      {done ? (
        <p
          role="status"
          className="p-4 text-sm font-semibold rounded-[var(--sf-tile-radius)] bg-[var(--sf-bg)]"
        >
          {t('catalog.news.done')}{' '}
          {welcome ? t('catalog.code.use', { code: welcome.code }) : t('catalog.news.inbox')}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="gap-2 sm:flex-row flex flex-col">
          <label htmlFor={inputId} className="sr-only">
            {t('catalog.news.email')}
          </label>
          <input
            id={inputId}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${inputId}-err` : undefined}
            placeholder="name@mail.com"
            className="h-12 min-w-0 px-4 text-base sm:text-sm sm:flex-1 w-full rounded-[var(--sf-pill)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)]"
          />
          <button
            type="submit"
            className="h-12 px-6 text-sm font-semibold shrink-0 rounded-[var(--sf-cta-radius)]"
            style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
          >
            {t('catalog.news.join')}
          </button>
          {error && (
            <p
              id={`${inputId}-err`}
              role="alert"
              className="text-sm font-semibold sm:basis-full text-[color:var(--sf-primary-text)]"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  )
}

/** A stand-in section for home blocks the published page does not carry. */
export const extraSection = (kind: PageSection['kind'], headline = '', body = ''): PageSection => ({
  id: `extra-${kind}`,
  kind,
  rule: 'optional',
  hidden: false,
  headline,
  body,
  productIds: [],
  ctaLabel: '',
})
