import type { Tenant } from '@rc/types'
import { cn } from '@rc/ui'
import type { JSX } from 'react'

/**
 * Logos of the demo brands, drawn as SVG on the tenant's own tokens. A tenant without a drawn
 * logo gets its initial on a primary tile. `inverse` flips the colours for a primary-coloured bar.
 */

type Mark = (props: { tile: string; glyph: string }) => JSX.Element

/** Lari: a forward-leaning L with three speed lines. */
const LariMark: Mark = ({ tile, glyph }) => (
  <>
    <rect width="40" height="40" rx="11" fill={tile} />
    <path d="M17.5 10h5.6l-3.4 15h9.1l-1.2 5H13.2l4.3-20Z" fill={glyph} />
    <path d="M7 15.5h6.5M5 20.5h8M7.5 25.5h4.5" stroke={glyph} strokeWidth="2.4" strokeLinecap="round" />
  </>
)

/** Aruna (dawn): a half sun on the horizon with three short rays. */
const ArunaMark: Mark = ({ tile, glyph }) => (
  <>
    <circle cx="20" cy="20" r="20" fill={tile} />
    <path d="M13 26.5a7 7 0 0 1 14 0Z" fill={glyph} />
    <path
      d="M9.5 26.5h21M20 11.5v3.5M11.8 15.3l2.4 2.4M28.2 15.3l-2.4 2.4"
      stroke={glyph}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </>
)

/** Teknika: a hex nut with a T cut through it. */
const TeknikaMark: Mark = ({ tile, glyph }) => (
  <>
    <path d="M20 1.5 36 10.75v18.5L20 38.5 4 29.25v-18.5L20 1.5Z" fill={tile} />
    <path d="M12 12.5h16v4.2h-5.9V29h-4.2V16.7H12v-4.2Z" fill={glyph} />
    <circle cx="27.5" cy="26" r="2" fill={glyph} />
  </>
)

const BRANDS: Record<string, { mark: Mark; word: string; sub: string; wordClass: string }> = {
  'ten-lari': {
    mark: LariMark,
    word: 'lari',
    sub: 'Running Co.',
    wordClass: 'font-black italic tracking-tight',
  },
  'ten-aruna': { mark: ArunaMark, word: 'aruna', sub: 'Beauty', wordClass: 'font-medium tracking-wide' },
  'ten-teknika': {
    mark: TeknikaMark,
    word: 'TEKNIKA',
    sub: 'Industrial',
    wordClass: 'font-extrabold tracking-[0.14em]',
  },
}

export function BrandMark({
  tenant,
  inverse,
  className,
}: {
  tenant: Pick<Tenant, 'id' | 'name'>
  inverse?: boolean
  className?: string
}) {
  const tile = inverse ? 'var(--sf-bg)' : 'var(--sf-primary)'
  const glyph = inverse ? 'var(--sf-primary)' : 'var(--sf-on-primary)'
  const Drawn = BRANDS[tenant.id]?.mark
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" fill="none" className={cn('size-9 shrink-0', className)}>
      {Drawn ? (
        <Drawn tile={tile} glyph={glyph} />
      ) : (
        <>
          <rect width="40" height="40" rx="11" fill={tile} />
          <text x="20" y="27" textAnchor="middle" fontSize="20" fontWeight="700" fill={glyph}>
            {tenant.name[0]}
          </text>
        </>
      )}
    </svg>
  )
}

/** Mark plus wordmark. The tenant name stays readable to screen readers. */
export function BrandLogo({
  tenant,
  inverse,
  className,
}: {
  tenant: Pick<Tenant, 'id' | 'name'>
  inverse?: boolean
  className?: string
}) {
  const brand = BRANDS[tenant.id]
  return (
    <span className={cn('gap-2.5 min-w-0 inline-flex items-center', className)}>
      <BrandMark tenant={tenant} inverse={inverse} />
      <span className="sr-only">{tenant.name}</span>
      {brand ? (
        <span aria-hidden="true" className="min-w-0 leading-none">
          <span className={cn('sf-heading text-xl block', brand.wordClass)}>{brand.word}</span>
          <span className="mt-0.5 font-semibold block text-[9px] tracking-[0.28em] uppercase opacity-70">
            {brand.sub}
          </span>
        </span>
      ) : (
        <span aria-hidden="true" className="sf-heading text-lg font-bold truncate">
          {tenant.name}
        </span>
      )}
    </span>
  )
}
