import type { PageSection, SectionKind, Template } from '@rc/types'

const COPY: Partial<Record<SectionKind, Pick<PageSection, 'headline' | 'body' | 'ctaLabel'>>> = {
  hero: {
    headline: '',
    body: 'One or two lines on what makes the offer worth a look.',
    ctaLabel: 'Shop now',
  },
  category: { headline: 'Shop by category', body: 'New in · Best sellers · Bundles · Sale', ctaLabel: '' },
  featured_product: { headline: 'Best sellers this week', body: '', ctaLabel: '' },
  collection: { headline: 'The essentials', body: '', ctaLabel: '' },
  promotion: { headline: 'WELCOME10', body: '10% off your first order.', ctaLabel: '' },
  countdown: { headline: 'Offer ends Sunday', body: '', ctaLabel: '' },
  testimonials: { headline: 'What customers say', body: '4.8 average from 2,300 reviews', ctaLabel: '' },
  comparison: { headline: 'Compare the two favourites', body: '', ctaLabel: '' },
  brand_story: {
    headline: 'Made for how you live',
    body: 'A short story about where the brand comes from and who it serves.',
    ctaLabel: '',
  },
  faq: {
    headline: 'Questions',
    body: 'How long does delivery take? Two to four days across Java.',
    ctaLabel: '',
  },
  cta: { headline: 'Not sure which one fits?', body: '', ctaLabel: 'Chat with us' },
}

/** Sample content for a template preview: the tenant tagline in the hero and the first products. */
export function placeholderSections(
  template: Template,
  tagline: string,
  productIds: string[],
): PageSection[] {
  return template.sections.map(({ kind, rule }, i) => {
    const copy = COPY[kind] ?? { headline: '', body: '', ctaLabel: '' }
    return {
      id: `${template.id}-${i}`,
      kind,
      rule,
      hidden: false,
      headline: kind === 'hero' ? tagline : copy.headline,
      body: copy.body,
      ctaLabel: copy.ctaLabel,
      productIds: kind === 'collection' ? productIds.slice(0, 6) : productIds.slice(0, 4),
    }
  })
}
