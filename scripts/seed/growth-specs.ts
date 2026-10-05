import type { MessageChannel } from '../../packages/types/src/index.ts'

/** Campaign windows, shared by order attribution and the campaign records. */
export interface CampaignSpec {
  id: string
  tenantId: string
  name: string
  goal: string
  /** Days ago the campaign started (negative: in the future). */
  start: number
  end: number
  channels: MessageChannel[]
  segmentId: string | null
  promotionId: string | null
  pageId: string | null
  budget: number
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed'
  createdBy: string
}

export const CAMPAIGN_SPECS: CampaignSpec[] = [
  {
    id: 'cmp-lari-runmonth',
    tenantId: 'ten-lari',
    name: 'Running Month',
    goal: 'Lift running shoe sales during October race season.',
    start: 4,
    end: -26,
    channels: ['email', 'whatsapp', 'web_banner', 'landing_page'],
    segmentId: 'seg-lari-running',
    promotionId: 'promo-lari-runmonth',
    pageId: 'page-lari-runmonth',
    budget: 45_000_000,
    status: 'running',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-lari-10k',
    tenantId: 'ten-lari',
    name: '10K Race Prep',
    goal: 'Sell beginner bundles before the Jakarta 10K.',
    start: 62,
    end: 34,
    channels: ['email', 'push'],
    segmentId: 'seg-lari-first',
    promotionId: null,
    pageId: null,
    budget: 18_000_000,
    status: 'completed',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-lari-payday',
    tenantId: 'ten-lari',
    name: 'Payday Sale September',
    goal: 'Payday traffic spike, all categories.',
    start: 11,
    end: 7,
    channels: ['email', 'whatsapp', 'sms'],
    segmentId: 'seg-lari-repeat',
    promotionId: 'promo-lari-payday',
    pageId: null,
    budget: 12_000_000,
    status: 'completed',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-lari-winback',
    tenantId: 'ten-lari',
    name: 'Win back: 90 days quiet',
    goal: 'Bring at-risk runners back with a personal offer.',
    start: 20,
    end: -10,
    channels: ['whatsapp', 'email'],
    segmentId: 'seg-lari-atrisk',
    promotionId: 'promo-lari-welcomeback',
    pageId: null,
    budget: 6_000_000,
    status: 'running',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-lari-trail',
    tenantId: 'ten-lari',
    name: 'Trail Season Launch',
    goal: 'Launch Summit Ultra to trail runners.',
    start: -9,
    end: -30,
    channels: ['email', 'push', 'landing_page'],
    segmentId: 'seg-lari-trail',
    promotionId: null,
    pageId: 'page-lari-trail',
    budget: 30_000_000,
    status: 'scheduled',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-lari-vip',
    tenantId: 'ten-lari',
    name: 'VIP early access: Velocity Pro 4',
    goal: 'Pre-orders from VIP runners before public launch.',
    start: -20,
    end: -34,
    channels: ['whatsapp'],
    segmentId: null,
    promotionId: null,
    pageId: null,
    budget: 2_000_000,
    status: 'draft',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-aruna-glow',
    tenantId: 'ten-aruna',
    name: 'Glow Week',
    goal: 'Brightening routine push for 11.11 warm-up.',
    start: 6,
    end: -8,
    channels: ['email', 'whatsapp', 'web_banner'],
    segmentId: 'seg-aruna-repeat',
    promotionId: 'promo-aruna-glow',
    pageId: null,
    budget: 20_000_000,
    status: 'running',
    createdBy: 'usr-maya',
  },
  {
    id: 'cmp-aruna-sensitive',
    tenantId: 'ten-aruna',
    name: 'Sensitive Skin Starter',
    goal: 'Convert first-time buyers with the starter set.',
    start: 48,
    end: 20,
    channels: ['email', 'push'],
    segmentId: 'seg-aruna-first',
    promotionId: null,
    pageId: null,
    budget: 9_000_000,
    status: 'completed',
    createdBy: 'usr-maya',
  },
]
