import type { Page, PageKind, PageSection, PageStatus, Seller } from '../../packages/types/src/index.ts'
import { templates, isoDaysAgo } from './master.ts'
import { rng } from './rng.ts'

interface Copy {
  headline?: string
  body?: string
  productIds?: string[]
  cta?: string
}

function sectionsFor(
  templateId: string,
  pageId: string,
  copy: Partial<Record<PageSection['kind'], Copy>>,
  hide: PageSection['kind'][] = [],
): PageSection[] {
  const template = templates.find((t) => t.id === templateId)!
  return template.sections.map((s, i) => ({
    id: `${pageId}-s${i + 1}`,
    kind: s.kind,
    rule: s.rule,
    hidden: hide.includes(s.kind),
    headline: copy[s.kind]?.headline ?? '',
    body: copy[s.kind]?.body ?? '',
    productIds: copy[s.kind]?.productIds ?? [],
    ctaLabel: copy[s.kind]?.cta ?? '',
  }))
}

interface PageSpec {
  id: string
  tenantId: string
  title: string
  slug: string
  kind: PageKind
  templateId: string
  status: PageStatus
  copy: Partial<Record<PageSection['kind'], Copy>>
  hide?: PageSection['kind'][]
  updated: number
  by: string
  views: number
  scheduled?: number
}

const SPECS: PageSpec[] = [
  {
    id: 'page-lari-home',
    tenantId: 'ten-lari',
    title: 'Homepage',
    slug: '/',
    kind: 'home',
    templateId: 'tpl-minimal',
    status: 'published',
    updated: 3,
    by: 'usr-maya',
    views: 48_200,
    copy: {
      hero: {
        headline: 'Gear for every kilometre.',
        body: 'Shoes fitted to your pace, from first 5K to marathon PR.',
        cta: 'Shop running shoes',
      },
      category: { headline: 'Shop by distance', body: '5K · 10K · Half · Full · Trail' },
      featured_product: {
        headline: 'Best sellers this week',
        productIds: ['prd-lr-102', 'prd-lr-103', 'prd-lr-101', 'prd-lr-115'],
      },
      collection: { headline: 'Your first 10K', productIds: ['prd-lr-103', 'prd-lr-110', 'prd-lr-123'] },
      brand_story: {
        headline: 'Built with Jakarta runners',
        body: 'Every shoe is tested in the heat and rain of our own city.',
      },
      testimonials: { headline: 'Runners say', body: '4.8 average from 2,300 reviews' },
    },
  },
  {
    id: 'page-lari-runmonth',
    tenantId: 'ten-lari',
    title: 'Running Month',
    slug: '/running-month',
    kind: 'campaign',
    templateId: 'tpl-conversion',
    status: 'published',
    updated: 4,
    by: 'usr-maya',
    views: 12_900,
    copy: {
      hero: {
        headline: 'Running Month: 15% off road shoes',
        body: 'October is race season. Get race-ready for less.',
        cta: 'Claim RUNMONTH15',
      },
      countdown: { headline: 'Ends 31 October' },
      promotion: { headline: 'RUNMONTH15', body: '15% off every road running shoe.' },
      featured_product: {
        headline: 'Race-ready picks',
        productIds: ['prd-lr-101', 'prd-lr-102', 'prd-lr-105'],
      },
      faq: { headline: 'Questions', body: 'Can I combine vouchers? One voucher per order.' },
      cta: { headline: 'Not sure which shoe?', cta: 'Chat with a fitter' },
    },
    hide: ['testimonials'],
  },
  {
    id: 'page-lari-trail',
    tenantId: 'ten-lari',
    title: 'Summit Ultra launch',
    slug: '/summit-ultra',
    kind: 'landing',
    templateId: 'tpl-launch',
    status: 'scheduled',
    updated: 1,
    by: 'usr-maya',
    views: 0,
    scheduled: -9,
    copy: {
      hero: {
        headline: 'Summit Ultra. Built for the long way up.',
        body: 'Our most protective trail shoe, out 14 October.',
        cta: 'Get early access',
      },
      brand_story: { headline: 'Tested on Rinjani', body: 'Two seasons of testing by our trail team.' },
      countdown: { headline: 'Drops in 9 days' },
      featured_product: { headline: 'The trail kit', productIds: ['prd-lr-109', 'prd-lr-117', 'prd-lr-107'] },
      cta: { headline: 'Be first on the trail', cta: 'Notify me' },
    },
  },
  {
    id: 'page-lari-about',
    tenantId: 'ten-lari',
    title: 'About Lari',
    slug: '/about',
    kind: 'about',
    templateId: 'tpl-editorial',
    status: 'published',
    updated: 60,
    by: 'usr-andi',
    views: 3_100,
    copy: {
      hero: { headline: 'Run your city.', body: 'Since 2019, from a single store in Senayan.' },
      brand_story: { headline: 'Our story', body: 'Three friends, one running club and a lot of blisters.' },
    },
  },
  {
    id: 'page-lari-faq',
    tenantId: 'ten-lari',
    title: 'Shipping & returns FAQ',
    slug: '/faq',
    kind: 'faq',
    templateId: 'tpl-catalog',
    status: 'draft',
    updated: 2,
    by: 'usr-sari',
    views: 0,
    copy: {
      hero: { headline: 'Shipping, returns and sizing', body: 'Answers to what runners ask us most.' },
      category: { headline: 'Topics', body: 'Shipping · Returns · Sizing · Payment' },
      faq: { headline: 'Frequently asked', body: 'Free returns within 14 days.' },
    },
  },
  {
    id: 'page-aruna-home',
    tenantId: 'ten-aruna',
    title: 'Homepage',
    slug: '/',
    kind: 'home',
    templateId: 'tpl-editorial',
    status: 'published',
    updated: 6,
    by: 'usr-maya',
    views: 31_400,
    copy: {
      hero: {
        headline: 'Skin that tells your story.',
        body: 'Gentle formulas for Indonesian skin and climate.',
        cta: 'Find your routine',
      },
      brand_story: {
        headline: 'Made in Bandung',
        body: 'Formulated with dermatologists, tested on tropical skin.',
      },
      featured_product: {
        headline: 'Loved this month',
        productIds: ['prd-ar-101', 'prd-ar-104', 'prd-ar-108'],
      },
    },
  },
  {
    id: 'page-aruna-glow',
    tenantId: 'ten-aruna',
    title: 'Glow Week',
    slug: '/glow-week',
    kind: 'campaign',
    templateId: 'tpl-conversion',
    status: 'published',
    updated: 6,
    by: 'usr-maya',
    views: 8_700,
    copy: {
      hero: {
        headline: 'Glow Week: 20% off brightening',
        body: 'Vitamin C, toner and SPF to glow into 11.11.',
        cta: 'Shop Glow Week',
      },
      promotion: { headline: 'GLOWWEEK', body: '20% off skincare.' },
      featured_product: {
        headline: 'The glow routine',
        productIds: ['prd-ar-102', 'prd-ar-106', 'prd-ar-104'],
      },
      cta: { headline: 'Not sure where to start?', cta: 'Book a consultation' },
    },
  },
  {
    id: 'page-tek-home',
    tenantId: 'ten-teknika',
    title: 'Homepage',
    slug: '/',
    kind: 'home',
    templateId: 'tpl-catalog',
    status: 'draft',
    updated: 1,
    by: 'usr-hendra',
    views: 0,
    copy: {
      hero: {
        headline: 'Machines that keep your line running.',
        body: 'CNC, compressed air and the parts to keep them up.',
        cta: 'Talk to sales',
      },
      category: { headline: 'What we supply', body: 'CNC machines · Compressed air · Spare parts · Service' },
      comparison: { headline: 'Compare VMC models', productIds: ['prd-tk-101', 'prd-tk-103'] },
      cta: { headline: 'Need a quote?', cta: 'Talk to sales' },
    },
  },
]

export function buildPages(sellers: Seller[]): Page[] {
  const pages: Page[] = SPECS.map((s) => {
    const sections = sectionsFor(s.templateId, s.id, s.copy, s.hide)
    const updatedAt = isoDaysAgo(s.updated, rng.int(9, 17))
    const revisions = [
      {
        id: `${s.id}-r3`,
        at: updatedAt,
        by: s.by,
        note: s.status === 'published' ? 'Published' : 'Saved draft',
        sections,
        templateId: s.templateId,
      },
      {
        id: `${s.id}-r2`,
        at: isoDaysAgo(s.updated + 6, 11),
        by: s.by,
        note: 'Updated hero copy',
        sections,
        templateId: s.templateId,
      },
      {
        id: `${s.id}-r1`,
        at: isoDaysAgo(s.updated + 20, 10),
        by: s.by,
        note: 'Created from template',
        sections,
        templateId: s.templateId,
      },
    ]
    return {
      id: s.id,
      tenantId: s.tenantId,
      title: s.title,
      slug: s.slug,
      kind: s.kind,
      templateId: s.templateId,
      sellerId: null,
      status: s.status,
      sections,
      seo: {
        title: `${s.title} · ${s.tenantId === 'ten-lari' ? 'Lari Running Co.' : s.tenantId === 'ten-aruna' ? 'Aruna Beauty' : 'Teknika Industrial'}`,
        description: s.copy.hero?.body ?? '',
      },
      updatedAt,
      updatedBy: s.by,
      publishedAt: s.status === 'published' ? updatedAt : null,
      scheduledAt: s.scheduled !== undefined ? isoDaysAgo(s.scheduled, 9) : null,
      revisions,
      views30d: s.views,
    }
  })
  for (const seller of sellers) {
    const id = `page-${seller.id}`
    const sections = sectionsFor(seller.templateId, id, {
      hero: { headline: seller.headline || seller.name, body: seller.bio, cta: 'Chat on WhatsApp' },
      featured_product: {
        headline: `${seller.name.split(' ')[0]}'s picks`,
        productIds: seller.featuredProductIds,
      },
      testimonials: { headline: 'What my customers say', body: 'Helpful, honest, fast replies.' },
      comparison: { headline: 'Which one fits you?', productIds: seller.featuredProductIds.slice(0, 2) },
      cta: { headline: 'Questions before you buy?', cta: 'Message me' },
      promotion: {
        headline: seller.id === 'sel-fahmi' ? 'FAHMI10' : '',
        body: seller.id === 'sel-fahmi' ? '10% off over Rp 1 jt' : '',
      },
      brand_story: { headline: 'Why I recommend these', body: seller.bio },
    })
    const updatedAt = isoDaysAgo(rng.int(1, 30), rng.int(9, 20))
    pages.push({
      id,
      tenantId: seller.tenantId,
      title: `${seller.name} · personal store`,
      slug: `/${seller.slug}`,
      kind: 'personal',
      templateId: seller.templateId,
      sellerId: seller.id,
      status: seller.status === 'active' ? 'published' : 'draft',
      sections,
      seo: { title: `${seller.name} · ${seller.headline}`, description: seller.bio },
      updatedAt,
      updatedBy: seller.userId ?? 'usr-andi',
      publishedAt: seller.status === 'active' ? updatedAt : null,
      scheduledAt: null,
      revisions: [
        {
          id: `${id}-r1`,
          at: updatedAt,
          by: seller.userId ?? 'usr-andi',
          note: 'Published',
          sections,
          templateId: seller.templateId,
        },
      ],
      views30d: 0,
    })
  }
  return pages
}
