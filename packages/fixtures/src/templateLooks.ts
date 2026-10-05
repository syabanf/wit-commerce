/**
 * How a page template looks in the storefront, on top of its section order: the hero, the spacing
 * between sections and how product sections lay out. The storefront renders it and the admin draws
 * template thumbnails from it, so switching a template visibly switches the page.
 */
export interface TemplateLook {
  /** `theme` keeps the theme's own hero; the others are shared variants. */
  hero: 'theme' | 'immersive' | 'offer' | 'compact'
  spacing: 'airy' | 'regular' | 'dense'
  /** Rail: one scrolling row; feature: one large product beside smaller ones; grid: a dense block. */
  products: 'rail' | 'feature' | 'grid'
}

const DEFAULT_LOOK: TemplateLook = { hero: 'theme', spacing: 'regular', products: 'rail' }

const LOOKS: Record<string, TemplateLook> = {
  'tpl-minimal': DEFAULT_LOOK,
  'tpl-editorial': { hero: 'theme', spacing: 'airy', products: 'feature' },
  'tpl-catalog': { hero: 'compact', spacing: 'dense', products: 'grid' },
  'tpl-conversion': { hero: 'offer', spacing: 'regular', products: 'rail' },
  'tpl-launch': { hero: 'immersive', spacing: 'airy', products: 'feature' },
  'tpl-sales-pro': { hero: 'theme', spacing: 'airy', products: 'feature' },
  'tpl-personal-store': DEFAULT_LOOK,
  'tpl-specialist': { hero: 'theme', spacing: 'dense', products: 'grid' },
}

export const lookFor = (templateId?: string | null): TemplateLook =>
  (templateId && LOOKS[templateId]) || DEFAULT_LOOK

export const LOOK_HERO_LABEL: Record<TemplateLook['hero'], string> = {
  theme: 'Theme hero',
  immersive: 'Full-photo hero',
  offer: 'Offer-first hero',
  compact: 'Slim banner',
}

export const LOOK_PRODUCTS_LABEL: Record<TemplateLook['products'], string> = {
  rail: 'product rows',
  feature: 'large product feature',
  grid: 'dense product grid',
}
