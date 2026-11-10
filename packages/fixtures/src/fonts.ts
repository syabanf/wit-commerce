import type { BrandConfig } from '@rc/types'
import { BRAND_FONT, BRAND_FONT_STACK } from './brand'

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif"

/** The Google Fonts families a store may use: the css2 axis spec and the system fallback. */
const FAMILIES: Record<string, { axis: string; fallback: string }> = {
  [BRAND_FONT]: { axis: 'ital,opsz,wght@0,9..40,300..800;1,9..40,300..800', fallback: SANS },
  'Playfair Display': { axis: 'wght@400..900', fallback: SERIF },
  'Source Sans 3': { axis: 'wght@200..900', fallback: SANS },
  Nunito: { axis: 'wght@200..1000', fallback: SANS },
  'Cormorant Garamond': { axis: 'wght@400;500;600;700', fallback: SERIF },
  Jost: { axis: 'wght@100..900', fallback: SANS },
}

export interface FontPairing {
  id: string
  label: string
  hint: string
  fonts: BrandConfig['fonts']
}

/** Heading and body pairs for the "Look and feel" panel. Modern is the default of every store. */
export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'modern',
    label: 'Modern',
    hint: 'Clean and clear',
    fonts: { heading: BRAND_FONT, body: BRAND_FONT },
  },
  {
    id: 'classic',
    label: 'Classic',
    hint: 'Serif headings, plain body',
    fonts: { heading: 'Playfair Display', body: 'Source Sans 3' },
  },
  {
    id: 'friendly',
    label: 'Friendly',
    hint: 'Soft, rounded letters',
    fonts: { heading: 'Nunito', body: 'Nunito' },
  },
  {
    id: 'elegant',
    label: 'Elegant',
    hint: 'Fine and refined',
    fonts: { heading: 'Cormorant Garamond', body: 'Jost' },
  },
]

export const pairingOf = (fonts: BrandConfig['fonts'] | undefined) =>
  FONT_PAIRINGS.find((p) => p.fonts.heading === fonts?.heading && p.fonts.body === fonts?.body)

/** A CSS font-family for a stored font name. Names outside the list fall back to DM Sans. */
export function fontStack(name: string | undefined): string {
  const family = name ? FAMILIES[name] : undefined
  return name && family && name !== BRAND_FONT ? `'${name}', ${family.fallback}` : BRAND_FONT_STACK
}

/**
 * The Google Fonts stylesheet for these families, with display=swap. DM Sans and unknown names are
 * left out, because every app's index.html already loads DM Sans. Null when nothing is left.
 */
export function googleFontsHref(names: readonly (string | undefined)[]): string | null {
  const wanted = [...new Set(names)]
    .filter((n): n is string => !!n && n !== BRAND_FONT && n in FAMILIES)
    .sort()
  if (!wanted.length) return null
  const families = wanted.map((n) => `family=${n.replace(/ /g, '+')}:${FAMILIES[n]?.axis}`)
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

/** Points the `<link id>` stylesheet in the document head at these families, adding it when needed. */
export function loadFonts(names: readonly (string | undefined)[], id = 'rc-brand-fonts') {
  if (typeof document === 'undefined') return
  const href = googleFontsHref(names)
  const existing = document.getElementById(id)
  if (!href) return existing?.remove()
  if (existing instanceof HTMLLinkElement) {
    if (existing.href !== href) existing.href = href
    return
  }
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.append(link)
}

/** Every family the pairings use, for the font picker's samples. */
export const PAIRING_FONTS = FONT_PAIRINGS.flatMap((p) => [p.fonts.heading, p.fonts.body])
