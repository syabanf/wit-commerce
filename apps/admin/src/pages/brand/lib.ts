import type { BrandConfig, BrandLockKey, ButtonStyle, RadiusScale } from '@rc/types'
import { BUTTON_STYLE_LABEL } from '@rc/types'

export type ColorKey = keyof BrandConfig['colors']

export const COLOR_ROWS: { key: ColorKey; label: string; token: string; hint: string }[] = [
  { key: 'primary', label: 'Primary', token: 'brand.primary', hint: 'Buttons, prices and highlights' },
  { key: 'secondary', label: 'Secondary', token: 'brand.secondary', hint: 'Collection and footer tints' },
  { key: 'accent', label: 'Accent', token: 'brand.accent', hint: 'Ratings and small marks' },
  { key: 'background', label: 'Background', token: 'background.primary', hint: 'Page background' },
  { key: 'text', label: 'Text', token: 'text.primary', hint: 'Body copy and headings' },
]

export const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** WCAG contrast ratio of two #rrggbb colours, 1 to 21. Pure white has luminance 1. */
export function contrastRatio(a: string, b: string | 'white'): number {
  const la = luminance(a)
  const lb = b === 'white' ? 1 : luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export const AA = 4.5

/** Token scale behind the radius choice, in pixels. The storefront uses radius.medium. */
export const RADIUS_TOKENS: Record<RadiusScale, { small: number; medium: number; large: number }> = {
  sharp: { small: 0, medium: 2, large: 4 },
  soft: { small: 6, medium: 12, large: 20 },
  round: { small: 12, medium: 24, large: 32 },
}

const BUTTON_TOKEN: Record<ButtonStyle, string> = {
  solid: 'brand.primary fill, background text, radius.medium',
  outline: 'brand.primary border and text, no fill',
  pill: 'brand.primary fill, background text, fully round',
}

export interface TokenRow {
  token: string
  value: string
  swatch?: string
}

export function designTokens(brand: BrandConfig): TokenRow[] {
  const r = RADIUS_TOKENS[brand.radius]
  return [
    ...COLOR_ROWS.map((row) => ({
      token: row.token,
      value: brand.colors[row.key].toUpperCase(),
      swatch: brand.colors[row.key],
    })),
    { token: 'font.heading', value: brand.fonts.heading },
    { token: 'font.body', value: brand.fonts.body },
    { token: 'radius.small', value: `${r.small}px` },
    { token: 'radius.medium', value: `${r.medium}px` },
    { token: 'radius.large', value: `${r.large}px` },
    {
      token: 'button.primary',
      value: `${BUTTON_STYLE_LABEL[brand.buttonStyle]}: ${BUTTON_TOKEN[brand.buttonStyle]}`,
    },
    { token: 'button.secondary', value: 'Outline: text.primary border, no fill' },
  ]
}

/** What a lock means for sellers and campaign pages. */
export const LOCK_HINT: Record<BrandLockKey, { locked: string; unlocked: string }> = {
  logo: { locked: 'Every store shows the tenant logo.', unlocked: 'Sellers may upload their own logo.' },
  primary_color: {
    locked: 'Every store uses brand.primary.',
    unlocked: 'Sellers may pick their own primary colour.',
  },
  button_style: {
    locked: 'Every store uses the tenant button style.',
    unlocked: 'Sellers may change the button style.',
  },
  hero_image: {
    locked: 'Sellers use the tenant hero image.',
    unlocked: 'Sellers may upload their own hero image.',
  },
  headline: {
    locked: 'Sellers now use the tenant headline.',
    unlocked: 'Sellers may write their own headline.',
  },
  featured_product: {
    locked: 'Sellers show the tenant featured products.',
    unlocked: 'Sellers may pick their own featured products.',
  },
  layout: {
    locked: 'Sellers keep the template section order.',
    unlocked: 'Sellers may choose another allowed template.',
  },
}

/** Brand fields the guideline form edits. Locks save on their own, so they never count as a change. */
export const sameGuideline = (a: BrandConfig, b: BrandConfig) =>
  JSON.stringify({ ...a, locks: null }) === JSON.stringify({ ...b, locks: null })
