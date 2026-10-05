import type { BrandConfig, RadiusScale } from '@rc/types'
import type { CSSProperties } from 'react'
import { BRAND_FONT_STACK } from '@rc/fixtures'

export type SfStyle = CSSProperties & Partial<Record<`--sf-${string}`, string>>

const CARD_RADIUS: Record<RadiusScale, string> = { sharp: '8px', soft: '24px', round: '28px' }
const TILE_RADIUS: Record<RadiusScale, string> = { sharp: '4px', soft: '16px', round: '20px' }
const BUTTON_RADIUS: Record<RadiusScale, string> = { sharp: '4px', soft: '12px', round: '9999px' }

/** Tints mix a brand token with the page background, so they read on any palette. */
export const tint = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, var(--sf-bg))`

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The brand's own background or text colour, whichever reads better on `fill`. */
function readableOn(fill: string, brand: BrandConfig): string {
  const { background, text } = brand.colors
  return contrast(fill, background) >= contrast(fill, text) ? 'var(--sf-bg)' : 'var(--sf-text)'
}

/**
 * Brand tokens as CSS variables. Every colour in the storefront reads these, so class strings
 * carry structure only and a tenant's palette reaches the page as data.
 */
export function brandVars(brand: BrandConfig): SfStyle {
  const outline = brand.buttonStyle === 'outline'
  return {
    '--sf-primary': brand.colors.primary,
    '--sf-secondary': brand.colors.secondary,
    '--sf-accent': brand.colors.accent,
    '--sf-bg': brand.colors.background,
    '--sf-text': brand.colors.text,
    '--sf-on-primary': readableOn(brand.colors.primary, brand),
    '--sf-on-secondary': readableOn(brand.colors.secondary, brand),
    '--sf-on-accent': readableOn(brand.colors.accent, brand),
    '--sf-radius': CARD_RADIUS[brand.radius],
    '--sf-radius-sm': TILE_RADIUS[brand.radius],
    '--sf-btn-radius': brand.buttonStyle === 'pill' ? '9999px' : BUTTON_RADIUS[brand.radius],
    '--sf-btn-bg': outline ? 'transparent' : 'var(--sf-primary)',
    '--sf-btn-fg': outline ? 'var(--sf-primary)' : 'var(--sf-on-primary)',
    // Every storefront sets in DM Sans, whatever an older guideline stored.
    '--sf-heading': BRAND_FONT_STACK,
    '--sf-body': BRAND_FONT_STACK,
    '--sf-serif': BRAND_FONT_STACK,
  }
}
