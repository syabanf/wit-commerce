import { fmtIdr, initials, nowMs, photoUrl, productPhoto } from '@rc/fixtures'
import type { Category, Product } from '@rc/types'
import { cn, toast } from '@rc/ui'
import {
  Apple,
  Cog,
  Droplets,
  Footprints,
  Gift,
  GraduationCap,
  Heart,
  type LucideIcon,
  Mountain,
  Package,
  Palette,
  Shirt,
  Sparkles,
  SprayCan,
  Tag,
  Watch,
  Wind,
  Wrench,
} from 'lucide-react'
import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { tint } from '../lib/brand'
import { type Catalog, compareAtPct, promoFor, quickAddable } from '../lib/catalog'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { SWATCH } from '../lib/palette'

const TONES = ['--sf-primary', '--sf-accent', '--sf-secondary'] as const

function hash(text: string) {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** The brand token a product's placeholder image is tinted with, stable per product. */
export const productTone = (id: string) => TONES[hash(id) % TONES.length]!

const PHOTO_WIDTH = { sm: 320, md: 640, lg: 1200 } as const

/** A sample photo over a brand-tinted block; the block shows while the photo loads or when it fails. */
export function Photo({
  id,
  width,
  ratio = 1,
  className,
  eager,
}: {
  id: string | undefined
  width: number
  ratio?: number
  className?: string
  eager?: boolean
}) {
  return (
    <div aria-hidden="true" className={cn('relative overflow-hidden bg-[var(--sf-soft)]', className)}>
      {id && (
        <img
          src={photoUrl(id, width, ratio)}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="inset-0 absolute size-full object-cover"
        />
      )}
    </div>
  )
}

/** Product photo from the sample set; products without one get a brand-tinted block with their initials. */
export function ProductImage({
  product,
  className,
  size = 'md',
  strength = 16,
}: {
  product: Pick<Product, 'id' | 'name'>
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Tint percentage of the brand colour for the fallback block. */
  strength?: number
}) {
  const photo = productPhoto(product.id)
  if (photo) return <Photo id={photo} width={PHOTO_WIDTH[size]} eager={size === 'lg'} className={className} />
  const tone = productTone(product.id)
  return (
    <div
      aria-hidden="true"
      className={cn('relative flex items-center justify-center overflow-hidden select-none', className)}
      style={{
        background: `linear-gradient(150deg, ${tint(tone, strength + 6)}, ${tint(tone, Math.max(3, strength - 10))})`, // wit-allow: tenant storefront theme glow from the client references
        color: `color-mix(in srgb, var(${tone}) 70%, var(--sf-text))`,
      }}
    >
      <span
        className={cn(
          'sf-display font-bold tracking-tight opacity-60',
          size === 'sm' && 'text-lg',
          size === 'md' && 'text-3xl',
          size === 'lg' && 'text-6xl md:text-7xl',
        )}
      >
        {initials(product.name)}
      </span>
    </div>
  )
}

export function Rating({ product, className }: { product: Product; className?: string }) {
  if (!product.reviewCount) return null
  return (
    <span
      className={cn('gap-1 text-xs inline-flex items-center', className)}
      aria-label={`Rated ${product.rating.toFixed(1)} of 5 from ${product.reviewCount} reviews`}
    >
      <span className="flex text-[color:var(--sf-accent)]" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <svg
            key={i}
            viewBox="0 0 20 20"
            className="size-3.5"
            fill={i < Math.round(product.rating) ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="m10 2.5 2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z" />
          </svg>
        ))}
      </span>
      <span aria-hidden="true" className="font-semibold">
        {product.rating.toFixed(1)}
      </span>
      <span aria-hidden="true" className="text-[color:var(--sf-muted)]">
        ({product.reviewCount})
      </span>
    </span>
  )
}

/** Price, or "Talk to sales" for assisted products, with the compare-at price struck. */
export function PriceTag({
  product,
  price,
  className,
  priceClassName,
}: {
  product: Product
  /** Overrides the product price, for a chosen variant. */
  price?: number
  className?: string
  priceClassName?: string
}) {
  if (product.assisted)
    return (
      <span className={cn('font-bold text-[color:var(--sf-primary)]', className, priceClassName)}>
        Talk to sales
      </span>
    )
  return (
    <span className={cn('gap-x-2 inline-flex flex-wrap items-baseline', className)}>
      <span className={cn('sf-price font-bold', priceClassName)}>{fmtIdr(price ?? product.price)}</span>
      {product.compareAt && product.compareAt > product.price && (
        <span className="text-xs text-[color:var(--sf-muted)] line-through">
          <span className="sr-only">Was </span>
          {fmtIdr(product.compareAt)}
        </span>
      )}
    </span>
  )
}

/** "-12%" from compare-at, or an automatic category offer. Code offers are left to the deals strip. */
export function discountFor(catalog: Catalog, product: Product): number | null {
  const pct = compareAtPct(product)
  if (pct) return pct
  const promo = promoFor(catalog, product, nowMs())
  return promo?.trigger === 'automatic' ? promo.value : null
}

export function HeartButton({
  product,
  className,
  tone = 'outline',
}: {
  product: Product
  className?: string
  tone?: 'outline' | 'dark' | 'bare'
}) {
  const { wishlist } = useShop()
  const saved = wishlist.has(product.id)
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      onClick={(e) => {
        e.preventDefault()
        const added = wishlist.toggle(product.id)
        toast(added ? 'Saved to wishlist' : 'Removed from wishlist', { description: product.name })
      }}
      className={cn(
        'size-11 inline-flex shrink-0 items-center justify-center rounded-full transition',
        tone === 'outline' &&
          'border border-[color:var(--sf-line)] bg-[var(--sf-bg)] text-[color:var(--sf-text)]',
        tone === 'dark' && 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]',
        tone === 'bare' && 'text-[color:var(--sf-text)]',
        className,
      )}
    >
      <Heart className={cn('size-5', saved && 'fill-current')} aria-hidden="true" />
    </button>
  )
}

/** Adds a simple product straight to the cart; anything with choices opens its page instead. */
export function useQuickAdd() {
  const { catalog, cart, store } = useShop()
  const navigate = useNavigate()
  return useCallback(
    (product: Product) => {
      if (!quickAddable(catalog, product)) {
        navigate(paths.product(store, product.id))
        return
      }
      cart.add({ productId: product.id, variantId: product.variants[0]!.id, qty: 1, modifiers: [] })
      toast('Added to cart', {
        tone: 'success',
        description: `${product.name}, ${fmtIdr(product.variants[0]!.price)}`,
      })
    },
    [catalog, cart, navigate, store],
  )
}

const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/trail/i, Mountain],
  [/shoe|running/i, Footprints],
  [/apparel|tee|shirt/i, Shirt],
  [/accessor|watch/i, Watch],
  [/nutrition|food/i, Apple],
  [/coach|event|class/i, GraduationCap],
  [/skin|face/i, Droplets],
  [/makeup/i, Palette],
  [/hair/i, Sparkles],
  [/fragrance|parfum/i, SprayCan],
  [/gift|set/i, Gift],
  [/cnc|machine/i, Cog],
  [/air|compress/i, Wind],
  [/part/i, Package],
  [/service|contract/i, Wrench],
]

export function CategoryIcon({
  category,
  className,
}: {
  category: Pick<Category, 'name'>
  className?: string
}) {
  const Icon = CATEGORY_ICONS.find(([re]) => re.test(category.name))?.[1] ?? Tag
  return <Icon className={cn('size-5', className)} aria-hidden="true" />
}

export const swatchColour = (value: string) => SWATCH[value.toLowerCase().replace(/^\d+\s+/, '')] ?? null
