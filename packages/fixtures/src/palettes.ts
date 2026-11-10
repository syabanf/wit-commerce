import type { BrandConfig } from '@rc/types'

export interface Palette {
  id: string
  label: string
  hint: string
  colors: BrandConfig['colors']
}

/**
 * Ready colour sets for the "Look and feel" panel. Each one passes WCAG AA (4.5:1) for text on the
 * background and for button labels on the primary, secondary and accent colours.
 */
export const PALETTES: Palette[] = [
  {
    id: 'fresh',
    label: 'Fresh',
    hint: 'Green and bright',
    colors: {
      primary: '#1f6f5c',
      secondary: '#e3f1ec',
      accent: '#f2a541',
      background: '#ffffff',
      text: '#17201d',
    },
  },
  {
    id: 'earthy',
    label: 'Earthy',
    hint: 'Warm browns and olive',
    colors: {
      primary: '#7a4a2a',
      secondary: '#efe6da',
      accent: '#4f6128',
      background: '#fbf7f1',
      text: '#2a211b',
    },
  },
  {
    id: 'bold',
    label: 'Bold',
    hint: 'Red, black and yellow',
    colors: {
      primary: '#c8102e',
      secondary: '#111111',
      accent: '#ffc22e',
      background: '#ffffff',
      text: '#111111',
    },
  },
  {
    id: 'calm',
    label: 'Calm',
    hint: 'Soft blues',
    colors: {
      primary: '#2f5d8a',
      secondary: '#e6eef5',
      accent: '#8fb8de',
      background: '#f8fafc',
      text: '#1b2733',
    },
  },
  {
    id: 'elegant',
    label: 'Elegant',
    hint: 'Plum and gold',
    colors: {
      primary: '#3d2c3e',
      secondary: '#f1ebe6',
      accent: '#b08d57',
      background: '#fcfaf7',
      text: '#1f1b1d',
    },
  },
  {
    id: 'playful',
    label: 'Playful',
    hint: 'Purple and pink',
    colors: {
      primary: '#6a3fd1',
      secondary: '#fff1d6',
      accent: '#ff6f91',
      background: '#fffdf8',
      text: '#231a33',
    },
  },
]

/** True when two colour sets hold the same five values, ignoring hex case. */
export const sameColors = (a: BrandConfig['colors'], b: BrandConfig['colors']) =>
  (Object.keys(a) as (keyof BrandConfig['colors'])[]).every((k) => a[k].toLowerCase() === b[k].toLowerCase())

/** The ready palette these colours match, or undefined for a custom set. */
export const paletteOf = (colors: BrandConfig['colors']) => PALETTES.find((p) => sameColors(p.colors, colors))
