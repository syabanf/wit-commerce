import { fmtIdr, plural, tenantPhotos } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { LOYALTY_TIER_FLOW, LOYALTY_TIER_LABEL } from '@rc/types'
import { cn } from '@rc/ui'
import {
  BadgeCheck,
  CalendarHeart,
  Check,
  Droplets,
  FlaskConical,
  Leaf,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { type ReactNode, useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { type Catalog, isBuyable, variantAvailable } from '../lib/catalog'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { Photo, ProductImage } from './product'
import { type HeadingProps, PlainHeading, RAIL, lgCols, quotesFor } from './sections'
import { Button, ButtonLink, Pill } from './ui'

// Beauty modules for tenants in the beauty industry (Aruna). Everything reads the catalog: the
// Skin type, Fragrance-free, Key ingredient, How to use and BPOM number attributes, and product tags.

type Heading = (p: HeadingProps) => ReactNode

/** Attribute value of a product by the attribute's code (skin_type, key_ingredient …). */
function attr(catalog: Catalog, product: Product, code: string): string | undefined {
  const def = catalog.attributes.find((a) => a.code === code)
  return def ? product.attributes[def.id] : undefined
}

export const isBeauty = (catalog: Catalog) => catalog.tenant.industry === 'beauty'

interface Concern {
  key: string
  label: string
  /** The product tag that treats it. */
  tag: string
  text: string
}

const CONCERNS: Concern[] = [
  {
    key: 'sensitive',
    label: 'Sensitive & redness',
    tag: 'sensitive',
    text: 'Calm the barrier, skip fragrance.',
  },
  { key: 'dull', label: 'Dullness & dark spots', tag: 'brightening', text: 'Vitamin C and a daily SPF.' },
  { key: 'oily', label: 'Acne & oily skin', tag: 'oily', text: 'Clear pores without stripping.' },
  { key: 'dry', label: 'Dry & tight', tag: 'hydrating', text: 'Layer water, then seal it in.' },
  { key: 'ageing', label: 'Fine lines', tag: 'anti-aging', text: 'Retinal at night, SPF by day.' },
]

/** The four steps of a routine; the treat step follows the concern. */
const STEPS: { key: string; label: string; when: string; tag: string | null }[] = [
  { key: 'cleanse', label: 'Cleanse', when: 'AM and PM', tag: 'daily' },
  { key: 'tone', label: 'Tone', when: 'AM and PM', tag: 'hydrating' },
  { key: 'treat', label: 'Treat', when: 'Your concern', tag: null },
  { key: 'protect', label: 'Protect', when: 'Every morning', tag: 'spf' },
]

const firstInStock = (catalog: Catalog, p: Product) =>
  p.variants.find((v) => {
    const n = variantAvailable(catalog, p, v.id)
    return n === null || n > 0
  }) ?? null

/** Picks one product per step: tagged for the step, suited to the skin type, in stock, best seller first. */
export function buildRoutine(catalog: Catalog, skin: string, concern: Concern) {
  const used = new Set<string>()
  return STEPS.map((step) => {
    const tag = step.tag ?? concern.tag
    const candidates = catalog.products
      .filter(
        (p) => p.tags.includes(tag) && isBuyable(catalog, p) && !p.tags.includes('bundle') && !used.has(p.id),
      )
      .sort((a, b) => {
        const fit = (p: Product) => {
          const s = attr(catalog, p, 'skin_type')
          return s === skin ? 2 : s === 'All' ? 1 : 0
        }
        return fit(b) - fit(a) || b.views30d - a.views30d
      })
    const product = candidates[0] ?? null
    if (product) used.add(product.id)
    return { step, product }
  })
}

/** Skin type and concern in, a four-step routine out, with one button to add it all. */
export function RoutineFinder({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { catalog, cart, store } = useShop()
  const id = useId()
  const skinDef = catalog.attributes.find((a) => a.code === 'skin_type')
  const skins = skinDef?.options ?? ['All']
  const [skin, setSkin] = useState(skins.includes('Sensitive') ? 'Sensitive' : skins[0]!)
  const [concernKey, setConcernKey] = useState(CONCERNS[0]!.key)
  const [added, setAdded] = useState(false)
  const concern = CONCERNS.find((c) => c.key === concernKey)!
  const routine = useMemo(() => buildRoutine(catalog, skin, concern), [catalog, skin, concern])
  const picks = routine.filter((r): r is { step: (typeof STEPS)[number]; product: Product } => !!r.product)
  const total = picks.reduce(
    (sum, r) => sum + (firstInStock(catalog, r.product)?.price ?? r.product.price),
    0,
  )

  const addAll = () => {
    for (const { product } of picks) {
      const variant = firstInStock(catalog, product)
      if (variant) cart.add({ productId: product.id, variantId: variant.id, qty: 1, modifiers: [] })
    }
    setAdded(true)
  }

  const choice = (active: boolean) =>
    cn(
      'min-h-11 shrink-0 rounded-[var(--sf-pill)] px-4 text-sm font-semibold whitespace-nowrap transition',
      active
        ? 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]'
        : 'border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)]',
    )

  return (
    <section aria-labelledby={`${id}-h`} id="routine" className="scroll-mt-24">
      <Heading id={`${id}-h`} title="Find your routine" />
      <div className="sf-card gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] grid grid-cols-1">
        <div className="space-y-5">
          <fieldset className="min-w-0">
            <legend className="text-sm font-bold">1. Your skin type</legend>
            <div className="-mx-5 mt-2 gap-2 px-5 md:mx-0 md:px-0 md:flex-wrap no-scrollbar flex overflow-x-auto">
              {skins.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={skin === s}
                  className={choice(skin === s)}
                  onClick={() => (setSkin(s), setAdded(false))}
                >
                  {s === 'All' ? 'Normal' : s}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="text-sm font-bold">2. What bothers you most</legend>
            <div className="-mx-5 mt-2 gap-2 px-5 md:mx-0 md:px-0 md:flex-wrap no-scrollbar flex overflow-x-auto">
              {CONCERNS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={concernKey === c.key}
                  className={choice(concernKey === c.key)}
                  onClick={() => (setConcernKey(c.key), setAdded(false))}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-[color:var(--sf-muted)]">{concern.text}</p>
          </fieldset>
          <div className="p-4 rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
            <p className="text-sm text-[color:var(--sf-muted)]">Your routine, {picks.length} products</p>
            <p className="sf-display mt-1 text-2xl font-bold">{fmtIdr(total)}</p>
            {added ? (
              <div role="status" className="mt-3 gap-3 text-sm font-semibold flex flex-wrap items-center">
                <Check className="size-4" aria-hidden="true" />
                Added to your cart
                <Link to={paths.cart(store)} className="underline underline-offset-4">
                  View cart
                </Link>
              </div>
            ) : (
              <Button variant="primary" full className="mt-3" onClick={addAll} disabled={!picks.length}>
                Add routine to cart
              </Button>
            )}
          </div>
        </div>
        <ol className="gap-3 md:grid-cols-4 grid grid-cols-2 items-start" aria-label="Routine steps">
          {routine.map(({ step, product }, i) => (
            <li key={step.key} className="min-w-0">
              <p className="sf-kicker">
                {i + 1}. {step.label}
              </p>
              <p className="mb-2 text-[11px] text-[color:var(--sf-muted)]">{step.when}</p>
              {product ? (
                <Link
                  to={paths.product(store, product.id)}
                  className="group p-2 flex flex-col rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)]"
                >
                  <ProductImage
                    product={product}
                    size="sm"
                    className="aspect-square rounded-[var(--sf-tile-radius)]"
                  />
                  <span className="mt-2 text-sm leading-snug font-semibold line-clamp-2">{product.name}</span>
                  <span className="mt-1 text-sm">{fmtIdr(product.price)}</span>
                  {attr(catalog, product, 'key_ingredient') && (
                    <span className="mt-1 text-[11px] text-[color:var(--sf-muted)]">
                      with {attr(catalog, product, 'key_ingredient')}
                    </span>
                  )}
                </Link>
              ) : (
                <p className="p-3 text-xs rounded-[var(--sf-tile-radius)] border border-dashed border-[color:var(--sf-line)] text-[color:var(--sf-muted)]">
                  Nothing in stock for this step yet.
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/** Tiles per skin concern, each a search for the products that treat it. */
export function ConcernTiles({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { catalog, store } = useShop()
  const id = useId()
  return (
    <section aria-labelledby={`${id}-h`}>
      <Heading id={`${id}-h`} title="Shop by skin concern" />
      <ul className={cn(RAIL, 'py-1 lg:py-0', lgCols(CONCERNS.length))}>
        {CONCERNS.map((c, i) => {
          const count = catalog.products.filter((p) => p.tags.includes(c.tag)).length
          return (
            <li key={c.key} className="md:w-[30%] lg:w-auto w-[180px] shrink-0 snap-start">
              <Link
                to={paths.search(store, c.tag)}
                className="sf-card min-h-28 p-4 hover:-translate-y-0.5 flex h-full flex-col transition"
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
                <Droplets className="size-5" aria-hidden="true" />
                <span className="sf-display mt-3 leading-tight font-bold">{c.label}</span>
                <span className="pt-2 text-xs mt-auto opacity-75">{plural(count, 'product')}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const INGREDIENT_NOTE: Record<string, string> = {
  Ceramide: 'Rebuilds the skin barrier so it holds water.',
  'Vitamin C': 'Brightens dull skin and fades dark spots.',
  Centella: 'Soothes redness and irritated skin.',
  Niacinamide: 'Evens tone and calms oil.',
  'Hyaluronic acid': 'Draws water in for plump, hydrated skin.',
  Retinal: 'Smooths fine lines; start slowly, use at night.',
  'Kaolin clay': 'Lifts excess oil from pores.',
  'Salicylic acid': 'Clears oil and flakes on the scalp.',
  'Argan oil': 'Tames frizz and adds shine.',
  Peptides: 'Firms the thin skin around the eyes.',
}

/** One card per key ingredient in the catalog, with what it does and the products that carry it. */
export function IngredientSpotlight({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { catalog, store } = useShop()
  const id = useId()
  const groups = new Map<string, Product[]>()
  for (const p of catalog.products) {
    const key = attr(catalog, p, 'key_ingredient')
    if (key) groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const list = [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 5)
  if (!list.length) return null
  return (
    <section aria-labelledby={`${id}-h`}>
      <Heading id={`${id}-h`} title="Ingredient spotlight" />
      <ul
        className={cn(
          '-mx-4 px-4 gap-3 scroll-px-4 md:-mx-6 md:px-6 md:scroll-px-6 lg:-mx-10 lg:px-10 lg:scroll-px-10 xl:mx-0 xl:px-0 xl:grid xl:overflow-visible no-scrollbar flex snap-x overflow-x-auto',
          ['', 'xl:grid-cols-1', 'xl:grid-cols-2', 'xl:grid-cols-3', 'xl:grid-cols-4', 'xl:grid-cols-5'][
            list.length
          ],
        )}
      >
        {list.map(([name, products]) => (
          <li key={name} className="w-64 xl:w-auto shrink-0 snap-start">
            <div className="sf-card p-4 flex h-full flex-col">
              <span className="size-10 flex items-center justify-center rounded-full bg-[var(--sf-soft)] text-[color:var(--sf-primary)]">
                <FlaskConical className="size-5" aria-hidden="true" />
              </span>
              <p className="sf-display mt-3 text-lg font-bold">{name}</p>
              <p className="mt-1 text-sm text-[color:var(--sf-muted)]">
                {INGREDIENT_NOTE[name] ?? 'A key active in our formulas.'}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {products.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <Link to={paths.product(store, p.id)} className="underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Facts a beauty shopper checks first, counted from the catalog. */
export function TrustBar() {
  const { catalog } = useShop()
  const skincare = catalog.products.filter((p) => attr(catalog, p, 'bpom_number'))
  const free = catalog.products.filter((p) => attr(catalog, p, 'fragrance_free') === 'yes').length
  const items = [
    {
      icon: ShieldCheck,
      title: `${skincare.length} products BPOM registered`,
      text: 'Registration number on every product page',
    },
    { icon: Leaf, title: `${free} fragrance-free formulas`, text: 'Marked on the product and in filters' },
    { icon: BadgeCheck, title: 'Made for tropical skin', text: 'Tested in Bandung heat and humidity' },
    { icon: CalendarHeart, title: 'Free skin consultation', text: 'With a beauty advisor, online' },
  ]
  return (
    <ul aria-label="Why our skincare" className="gap-3 lg:grid-cols-4 grid grid-cols-2">
      {items.map(({ icon: Icon, title, text }) => (
        <li
          key={title}
          className="gap-3 p-4 flex items-start rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]"
        >
          <Icon className="mt-0.5 size-5 shrink-0 text-[color:var(--sf-primary)]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="text-sm font-bold block">{title}</span>
            <span className="mt-0.5 text-xs block text-[color:var(--sf-muted)]">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The loyalty tiers and what it takes to reach each, from the tenant's loyalty settings. */
export function RewardsLadder({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { tenant, store } = useShop()
  const id = useId()
  const { thresholds, pointsPer10k } = tenant.loyalty
  const spend: Record<string, number> = {
    member: 0,
    silver: thresholds.silver,
    gold: thresholds.gold,
    platinum: thresholds.platinum,
  }
  const perk: Record<string, string> = {
    member: `${pointsPer10k} points per Rp 10.000 and a birthday gift`,
    silver: 'Free shipping on every order',
    gold: 'Early access to launches and 5% back',
    platinum: 'A personal beauty advisor and event invitations',
  }
  return (
    <section aria-labelledby={`${id}-h`}>
      <Heading
        id={`${id}-h`}
        title={`${tenant.name.split(' ')[0]} Rewards`}
        action={{ label: 'Join or sign in', to: paths.account(store) }}
      />
      <ol className="gap-3 lg:grid-cols-4 grid grid-cols-2">
        {LOYALTY_TIER_FLOW.map((tier, i) => (
          <li
            key={tier}
            className="sf-card p-4 flex flex-col"
            style={
              i === LOYALTY_TIER_FLOW.length - 1
                ? { background: 'var(--sf-text)', color: 'var(--sf-bg)' }
                : undefined
            }
          >
            <Sparkles className="size-5 text-[color:var(--sf-accent)]" aria-hidden="true" />
            <p className="sf-display mt-3 text-xl font-bold">{LOYALTY_TIER_LABEL[tier]}</p>
            <p className="text-xs opacity-75">
              {spend[tier] ? `From ${fmtIdr(spend[tier])} a year` : 'When you join'}
            </p>
            <p className="mt-3 text-sm">{perk[tier]}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Book the consultation service with one of the tenant's beauty advisors. */
export function ConsultationBand() {
  const { catalog, tenant, store } = useShop()
  const service = catalog.products.find((p) => p.type === 'service')
  const photos = tenantPhotos(tenant.id)
  if (!service) return null
  return (
    <section
      aria-labelledby="consult-h"
      className="sf-card gap-5 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8 md:p-6 grid grid-cols-1 items-center overflow-hidden"
      style={{ background: 'color-mix(in srgb, var(--sf-accent) 14%, var(--sf-bg))' }}
    >
      <div className="p-2">
        <p className="sf-kicker">
          Not sure where to start?
        </p>
        <h2 id="consult-h" className="sf-display mt-2 text-2xl font-bold md:text-3xl text-balance">
          Book a 30-minute skin consultation
        </h2>
        <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
          {service.description} {fmtIdr(service.price)}, credited back on your first order over Rp 500.000.
        </p>
        <ButtonLink to={paths.product(store, service.id)} variant="dark" className="mt-4">
          Book a consultation
        </ButtonLink>
      </div>
      <Photo
        id={photos?.posts[2] ?? photos?.story}
        width={640}
        ratio={0.75}
        className="md:order-none -order-1 aspect-[4/3] rounded-[var(--sf-tile-radius)]"
      />
    </section>
  )
}

/** Customer posts with the product they used, as a #hashtag wall. */
export function GlowWall({ Heading = PlainHeading }: { Heading?: Heading }) {
  const { catalog, tenant, store } = useShop()
  const id = useId()
  const tag = `#${tenant.name.split(' ')[0]}Glow`
  const quotes = quotesFor(tenant.industry)
  const picks = [...catalog.products].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 6)
  return (
    <section aria-labelledby={`${id}-h`} id="testimonials" className="scroll-mt-24">
      <Heading id={`${id}-h`} title={`Real routines ${tag}`} />
      <ul className="gap-3 md:grid-cols-3 lg:grid-cols-6 grid grid-cols-2">
        {picks.map((p, i) => (
          <li key={p.id}>
            <Link to={paths.product(store, p.id)} className="group block">
              <ProductImage product={p} className="aspect-[4/5] rounded-[var(--sf-tile-radius)]" />
              <p className="mt-2 text-xs leading-snug line-clamp-2">“{quotes[i % quotes.length]!.quote}”</p>
              <Pill tone="soft" className="mt-1.5 max-w-full">
                <span className="truncate">{p.name}</span>
              </Pill>
              <p className="mt-1 text-[11px] text-[color:var(--sf-muted)]">
                {quotes[i % quotes.length]!.name}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Product page: what the product suits and how to use it, plus the rest of the routine. */
export function BeautyFacts({ product }: { product: Product }) {
  const { catalog, store } = useShop()
  const skin = attr(catalog, product, 'skin_type')
  const key = attr(catalog, product, 'key_ingredient')
  const use = attr(catalog, product, 'how_to_use')
  const bpom = attr(catalog, product, 'bpom_number')
  const free = attr(catalog, product, 'fragrance_free') === 'yes'
  const concern = CONCERNS.find((c) => product.tags.includes(c.tag)) ?? CONCERNS[0]!
  const others = buildRoutine(catalog, skin ?? 'All', concern).filter(
    (r) => r.product && r.product.id !== product.id,
  )
  if (!skin && !key && !use && !bpom) return null
  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap">
        {skin && <Pill tone="soft">{skin === 'All' ? 'All skin types' : `${skin} skin`}</Pill>}
        {free && <Pill tone="soft">Fragrance-free</Pill>}
        {key && <Pill tone="soft">With {key}</Pill>}
        {bpom && <Pill tone="soft">BPOM {bpom}</Pill>}
      </div>
      {key && INGREDIENT_NOTE[key] && (
        <p className="text-sm">
          <span className="font-bold">{key}:</span> {INGREDIENT_NOTE[key]}
        </p>
      )}
      {use && (
        <div className="p-4 rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
          <p className="text-sm font-bold">How to use</p>
          <p className="mt-1 text-sm text-[color:var(--sf-muted)]">{use}</p>
        </div>
      )}
      {others.length > 0 && product.categoryId === 'cat-aruna-skin' && (
        <div>
          <p className="text-sm font-bold">Complete your routine</p>
          <ul className="mt-2 gap-2 lg:grid lg:grid-cols-3 lg:overflow-visible no-scrollbar flex snap-x overflow-x-auto">
            {others.slice(0, 3).map(({ step, product: p }) => (
              <li key={step.key} className="md:w-[200px] lg:w-auto w-[160px] shrink-0 snap-start">
                <Link
                  to={paths.product(store, p!.id)}
                  className="p-2 block h-full rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)]"
                >
                  <span className="font-bold tracking-widest text-[10px] text-[color:var(--sf-primary)] uppercase">
                    {step.label}
                  </span>
                  <span className="mt-1 text-xs font-semibold line-clamp-2 block">{p!.name}</span>
                  <span className="text-xs">{fmtIdr(p!.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
