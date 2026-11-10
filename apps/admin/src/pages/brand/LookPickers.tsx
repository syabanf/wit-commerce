import {
  FONT_PAIRINGS,
  PAIRING_FONTS,
  PALETTES,
  fontStack,
  loadFonts,
  pairingOf,
  paletteOf,
} from '@rc/fixtures'
import type { BrandConfig, ButtonStyle, RadiusScale } from '@rc/types'
import { BUTTON_STYLE_LABEL, RADIUS_SCALE_LABEL } from '@rc/types'
import { cn } from '@rc/ui'
import { Check, ChevronDown } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { contrastRatio } from './lib'

const RADII = Object.keys(RADIUS_SCALE_LABEL) as RadiusScale[]
const BUTTONS = Object.keys(BUTTON_STYLE_LABEL) as ButtonStyle[]
// Scaled-down copies of the storefront card and button radii.
const CARD_CORNER: Record<RadiusScale, string> = { sharp: '4px', soft: '12px', round: '20px' }
const BUTTON_CORNER: Record<RadiusScale, string> = { sharp: '4px', soft: '12px', round: '9999px' }

/** The background or text colour, whichever reads better on `fill`, as the storefront picks it. */
const labelOn = (fill: string, colors: BrandConfig['colors']) =>
  contrastRatio(fill, colors.background) >= contrastRatio(fill, colors.text) ? colors.background : colors.text

function OptionCard({
  active,
  disabled,
  onClick,
  label,
  hint,
  children,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'gap-2.5 rounded-2xl p-3 min-w-0 flex flex-col text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed',
        active ? 'bg-card ring-2 ring-ink' : 'bg-surface-2 hover:bg-surface',
      )}
    >
      {children}
      <span className="gap-2 flex items-start justify-between">
        <span className="min-w-0">
          <span className="text-sm font-semibold block">{label}</span>
          {hint && <span className="text-xs block text-muted">{hint}</span>}
        </span>
        {active && <Check className="size-4 shrink-0" aria-hidden />}
      </span>
    </button>
  )
}

export function PalettePicker({
  colors,
  disabled,
  onPick,
}: {
  colors: BrandConfig['colors']
  disabled: boolean
  onPick: (colors: BrandConfig['colors']) => void
}) {
  const current = paletteOf(colors)?.id
  return (
    <div role="radiogroup" aria-label="Colours" className="gap-3 sm:grid-cols-3 grid grid-cols-2">
      {PALETTES.map((p) => (
        <OptionCard
          key={p.id}
          active={current === p.id}
          disabled={disabled}
          onClick={() => onPick({ ...p.colors })}
          label={p.label}
          hint={p.hint}
        >
          <span
            aria-hidden
            className="gap-2 rounded-xl p-2.5 flex items-center justify-between ring-1 ring-border"
            style={{ background: p.colors.background }}
          >
            <span className="gap-1 flex">
              {[p.colors.secondary, p.colors.accent, p.colors.text].map((c, i) => (
                <span
                  key={i}
                  className="size-3.5 ring-black/5 rounded-full ring-1"
                  style={{ background: c }}
                />
              ))}
            </span>
            <span
              className="px-2 py-1 font-semibold rounded-md text-[11px]"
              style={{ background: p.colors.primary, color: labelOn(p.colors.primary, p.colors) }}
            >
              Shop
            </span>
          </span>
        </OptionCard>
      ))}
    </div>
  )
}

export function FontPicker({
  fonts,
  storeName,
  disabled,
  onPick,
}: {
  fonts: BrandConfig['fonts'] | undefined
  storeName: string
  disabled: boolean
  onPick: (fonts: BrandConfig['fonts']) => void
}) {
  // The samples render in their own fonts, so the admin loads every pair once.
  useEffect(() => {
    loadFonts(PAIRING_FONTS, 'rc-font-samples')
  }, [])
  const current = pairingOf(fonts)?.id
  return (
    <div role="radiogroup" aria-label="Fonts" className="gap-3 sm:grid-cols-2 grid grid-cols-1">
      {FONT_PAIRINGS.map((p) => (
        <OptionCard
          key={p.id}
          active={current === p.id}
          disabled={disabled}
          onClick={() => onPick({ ...p.fonts })}
          label={p.label}
          hint={p.hint}
        >
          <span aria-hidden className="rounded-xl px-3 py-2.5 block bg-card ring-1 ring-border">
            <span
              className="text-xl font-semibold leading-tight block truncate"
              style={{ fontFamily: fontStack(p.fonts.heading) }}
            >
              {storeName}
            </span>
            <span
              className="mt-0.5 text-xs block truncate text-muted"
              style={{ fontFamily: fontStack(p.fonts.body) }}
            >
              New arrivals, picked for you.
            </span>
          </span>
        </OptionCard>
      ))}
    </div>
  )
}

export function CornerPicker({
  value,
  disabled,
  onPick,
}: {
  value: RadiusScale
  disabled: boolean
  onPick: (radius: RadiusScale) => void
}) {
  return (
    <div role="radiogroup" aria-label="Corners" className="gap-2 grid grid-cols-3">
      {RADII.map((r) => (
        <OptionCard
          key={r}
          active={value === r}
          disabled={disabled}
          onClick={() => onPick(r)}
          label={RADIUS_SCALE_LABEL[r]}
        >
          <span aria-hidden className="h-10 block bg-ink/15" style={{ borderRadius: CARD_CORNER[r] }} />
        </OptionCard>
      ))}
    </div>
  )
}

export function ButtonPicker({
  value,
  radius,
  disabled,
  onPick,
}: {
  value: ButtonStyle
  radius: RadiusScale
  disabled: boolean
  onPick: (style: ButtonStyle) => void
}) {
  return (
    <div role="radiogroup" aria-label="Buttons" className="gap-2 grid grid-cols-3">
      {BUTTONS.map((b) => (
        <OptionCard
          key={b}
          active={value === b}
          disabled={disabled}
          onClick={() => onPick(b)}
          label={BUTTON_STYLE_LABEL[b]}
        >
          <span aria-hidden className="h-10 flex items-center justify-center">
            <span
              className={cn(
                'px-3 py-1.5 text-xs font-semibold',
                b === 'outline' ? 'text-ink ring-2 ring-ink ring-inset' : 'text-white bg-ink',
              )}
              style={{ borderRadius: b === 'pill' ? '9999px' : BUTTON_CORNER[radius] }}
            >
              Buy
            </span>
          </span>
        </OptionCard>
      ))}
    </div>
  )
}

/** A closed-by-default section for settings most owners never need. */
export function Advanced({ label = 'Advanced', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl bg-surface-2">
      <summary className="gap-2 px-3 py-2.5 text-sm font-medium rounded-2xl flex cursor-pointer list-none items-center justify-between focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  )
}
