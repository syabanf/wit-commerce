import type {
  Automation,
  Campaign,
  Customer,
  CustomerEvent,
  Lead,
  LeadStage,
  Order,
  Promotion,
  Segment,
  Ticket,
} from '../../packages/types/src/index.ts'
import { DAY, HOUR, toIso, toMs } from '../../packages/fixtures/src/dates.ts'
import { CAMPAIGN_SPECS } from './growth-specs.ts'
import { NOW, isoDaysAgo } from './master.ts'
import { rng } from './rng.ts'

const seg = (s: Omit<Segment, 'createdAt'> & { daysAgo?: number }): Segment => ({
  ...s,
  createdAt: isoDaysAgo(s.daysAgo ?? 180),
})

export const segments: Segment[] = [
  seg({
    id: 'seg-lari-first',
    tenantId: 'ten-lari',
    name: 'First buyers',
    description: 'Bought exactly once.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'orders', op: 'eq', value: '1' }],
  }),
  seg({
    id: 'seg-lari-repeat',
    tenantId: 'ten-lari',
    name: 'Repeat customers',
    description: 'Two or more orders.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'orders', op: 'gt', value: '1' }],
  }),
  seg({
    id: 'seg-lari-high',
    tenantId: 'ten-lari',
    name: 'High spenders',
    description: 'Lifetime spend above Rp 5 jt.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'spend', op: 'gt', value: '5000000' }],
  }),
  seg({
    id: 'seg-lari-vip',
    tenantId: 'ten-lari',
    name: 'VIP',
    description: 'Customers in the VIP lifecycle stage.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'stage', op: 'eq', value: 'vip' }],
  }),
  seg({
    id: 'seg-lari-atrisk',
    tenantId: 'ten-lari',
    name: 'At risk',
    description: 'No purchase for 90 to 150 days.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'stage', op: 'eq', value: 'at_risk' }],
  }),
  seg({
    id: 'seg-lari-dormant',
    tenantId: 'ten-lari',
    name: 'Dormant',
    description: 'No purchase for more than 150 days.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'stage', op: 'eq', value: 'dormant' }],
  }),
  seg({
    id: 'seg-lari-cart',
    tenantId: 'ten-lari',
    name: 'Cart abandoners',
    description: 'Left a checkout in the last 7 days.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'abandoned_cart', op: 'eq', value: 'yes' }],
  }),
  seg({
    id: 'seg-lari-running',
    tenantId: 'ten-lari',
    name: 'Road runners',
    description: 'Interested in road shoes, or spent over Rp 8 jt.',
    builtIn: false,
    match: 'any',
    rules: [
      { field: 'interest', op: 'eq', value: 'cat-lari-road' },
      { field: 'spend', op: 'gt', value: '8000000' },
    ],
    daysAgo: 40,
  }),
  seg({
    id: 'seg-lari-trail',
    tenantId: 'ten-lari',
    name: 'Trail runners',
    description: 'Interested in trail shoes.',
    builtIn: false,
    match: 'all',
    rules: [{ field: 'interest', op: 'eq', value: 'cat-lari-trail' }],
    daysAgo: 20,
  }),
  seg({
    id: 'seg-lari-loyal',
    tenantId: 'ten-lari',
    name: 'Loyal runners',
    description: 'More than 5 orders, over Rp 10 jt, bought in the last 60 days.',
    builtIn: false,
    match: 'all',
    rules: [
      { field: 'orders', op: 'gt', value: '5' },
      { field: 'spend', op: 'gt', value: '10000000' },
      { field: 'days_since_purchase', op: 'lt', value: '60' },
    ],
    daysAgo: 30,
  }),
  seg({
    id: 'seg-lari-jkt-gold',
    tenantId: 'ten-lari',
    name: 'Jakarta Gold members',
    description: 'Gold tier customers in Jakarta.',
    builtIn: false,
    match: 'all',
    rules: [
      { field: 'tier', op: 'eq', value: 'gold' },
      { field: 'city', op: 'eq', value: 'Jakarta' },
    ],
    daysAgo: 12,
  }),
  seg({
    id: 'seg-aruna-first',
    tenantId: 'ten-aruna',
    name: 'First buyers',
    description: 'Bought exactly once.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'orders', op: 'eq', value: '1' }],
  }),
  seg({
    id: 'seg-aruna-repeat',
    tenantId: 'ten-aruna',
    name: 'Repeat customers',
    description: 'Two or more orders.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'orders', op: 'gt', value: '1' }],
  }),
  seg({
    id: 'seg-aruna-cart',
    tenantId: 'ten-aruna',
    name: 'Cart abandoners',
    description: 'Left a checkout in the last 7 days.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'abandoned_cart', op: 'eq', value: 'yes' }],
  }),
  seg({
    id: 'seg-aruna-sensitive',
    tenantId: 'ten-aruna',
    name: 'Skincare lovers',
    description: 'Interested in skincare.',
    builtIn: false,
    match: 'all',
    rules: [{ field: 'interest', op: 'eq', value: 'cat-aruna-skin' }],
    daysAgo: 50,
  }),
  seg({
    id: 'seg-tek-repeat',
    tenantId: 'ten-teknika',
    name: 'Repeat buyers',
    description: 'Plants that reorder consumables.',
    builtIn: true,
    match: 'all',
    rules: [{ field: 'orders', op: 'gt', value: '1' }],
  }),
]

type PromoSeed = Pick<Promotion, 'id' | 'tenantId' | 'code' | 'name' | 'kind' | 'status'> &
  Partial<Promotion> & { from: number; to: number }
const promo = ({ from, to, ...p }: PromoSeed): Promotion => ({
  trigger: 'code',
  value: 0,
  maxDiscount: null,
  buyQty: null,
  getQty: null,
  getDiscountPct: null,
  minSpend: 0,
  segmentId: null,
  categoryIds: [],
  productIds: [],
  paymentTypeIds: [],
  usageLimit: null,
  used: 0,
  revenue: 0,
  sellerId: null,
  startAt: isoDaysAgo(from, 0),
  endAt: isoDaysAgo(to, 23, 59),
  ...p,
})

export const promotions: Promotion[] = [
  // Discount by product category, with a code.
  promo({
    id: 'promo-lari-runmonth',
    tenantId: 'ten-lari',
    code: 'RUNMONTH15',
    name: 'Running Month 15% off road shoes',
    kind: 'percentage',
    value: 15,
    maxDiscount: 400_000,
    categoryIds: ['cat-lari-road'],
    status: 'active',
    from: 4,
    to: -26,
    usageLimit: 2000,
  }),
  // Discount by product category, applied automatically.
  promo({
    id: 'promo-lari-apparel',
    tenantId: 'ten-lari',
    code: 'APPAREL20',
    name: 'Apparel week: 20% off',
    kind: 'percentage',
    trigger: 'automatic',
    value: 20,
    categoryIds: ['cat-lari-apparel'],
    status: 'active',
    from: 2,
    to: -5,
  }),
  promo({
    id: 'promo-lari-freeship',
    tenantId: 'ten-lari',
    code: 'FREESHIP',
    name: 'Free shipping over Rp 750 rb',
    kind: 'free_shipping',
    trigger: 'automatic',
    minSpend: 750_000,
    status: 'active',
    from: 120,
    to: -60,
  }),
  // Buy X get Y.
  promo({
    id: 'promo-lari-socks',
    tenantId: 'ten-lari',
    code: 'SOCKS3',
    name: 'Socks: buy 2, get 1 free',
    kind: 'bxgy',
    trigger: 'automatic',
    buyQty: 2,
    getQty: 1,
    getDiscountPct: 100,
    productIds: ['prd-lr-115'],
    status: 'active',
    from: 30,
    to: -30,
  }),
  promo({
    id: 'promo-lari-gel',
    tenantId: 'ten-lari',
    code: 'GEL2',
    name: 'Gels: buy 1, get the 2nd at 50% off',
    kind: 'bxgy',
    trigger: 'automatic',
    buyQty: 1,
    getQty: 1,
    getDiscountPct: 50,
    categoryIds: ['cat-lari-nutri'],
    status: 'active',
    from: 10,
    to: -20,
  }),
  promo({
    id: 'promo-lari-welcome',
    tenantId: 'ten-lari',
    code: 'WELCOME10',
    name: '10% off a first order',
    kind: 'percentage',
    value: 10,
    maxDiscount: 150_000,
    minSpend: 300_000,
    status: 'active',
    from: 200,
    to: -160,
  }),
  // Nominal discount.
  promo({
    id: 'promo-lari-payday',
    tenantId: 'ten-lari',
    code: 'PAYDAY100',
    name: 'Payday Rp 100 rb off',
    kind: 'fixed',
    value: 100_000,
    minSpend: 1_000_000,
    segmentId: 'seg-lari-repeat',
    status: 'expired',
    from: 11,
    to: 7,
    usageLimit: 500,
  }),
  promo({
    id: 'promo-lari-welcomeback',
    tenantId: 'ten-lari',
    code: 'COMEBACK20',
    name: 'Welcome back 20%',
    kind: 'percentage',
    value: 20,
    maxDiscount: 250_000,
    minSpend: 500_000,
    segmentId: 'seg-lari-atrisk',
    status: 'active',
    from: 20,
    to: -10,
    usageLimit: 300,
  }),
  promo({
    id: 'promo-lari-fahmi',
    tenantId: 'ten-lari',
    code: 'FAHMI10',
    name: "Fahmi's runners 10%",
    kind: 'percentage',
    value: 10,
    minSpend: 1_000_000,
    sellerId: 'sel-fahmi',
    status: 'active',
    from: 60,
    to: -30,
    usageLimit: 100,
  }),
  // Discount by payment type.
  promo({
    id: 'promo-lari-qris',
    tenantId: 'ten-lari',
    code: 'QRIS5',
    name: '5% off when you pay with QRIS',
    kind: 'percentage',
    trigger: 'automatic',
    value: 5,
    maxDiscount: 50_000,
    paymentTypeIds: ['pay-lari-qris'],
    status: 'active',
    from: 45,
    to: -45,
  }),
  promo({
    id: 'promo-lari-bca',
    tenantId: 'ten-lari',
    code: 'BCA150',
    name: 'Rp 150 rb off with a BCA card',
    kind: 'fixed',
    value: 150_000,
    minSpend: 1_500_000,
    paymentTypeIds: ['pay-lari-card'],
    status: 'active',
    from: 15,
    to: -15,
    usageLimit: 400,
  }),
  promo({
    id: 'promo-lari-vip',
    tenantId: 'ten-lari',
    code: 'VIPFIRST',
    name: 'VIP early access bundle',
    kind: 'bundle',
    value: 2_499_000,
    segmentId: 'seg-lari-vip',
    productIds: ['prd-lr-127', 'prd-lr-115'],
    status: 'scheduled',
    from: -20,
    to: -34,
    usageLimit: 150,
  }),
  promo({
    id: 'promo-aruna-glow',
    tenantId: 'ten-aruna',
    code: 'GLOWWEEK',
    name: 'Glow Week 20% off skincare',
    kind: 'percentage',
    value: 20,
    categoryIds: ['cat-aruna-skin'],
    status: 'active',
    from: 6,
    to: -8,
    usageLimit: 1500,
  }),
  promo({
    id: 'promo-aruna-lip',
    tenantId: 'ten-aruna',
    code: 'LIP3',
    name: 'Lips: buy 2, get 1 free',
    kind: 'bxgy',
    trigger: 'automatic',
    buyQty: 2,
    getQty: 1,
    getDiscountPct: 100,
    productIds: ['prd-ar-108'],
    status: 'active',
    from: 5,
    to: -25,
  }),
  promo({
    id: 'promo-aruna-gopay',
    tenantId: 'ten-aruna',
    code: 'GOPAY25',
    name: 'Rp 25 rb off with GoPay',
    kind: 'fixed',
    trigger: 'automatic',
    value: 25_000,
    minSpend: 250_000,
    paymentTypeIds: ['pay-aruna-gopay'],
    status: 'active',
    from: 12,
    to: -18,
  }),
  promo({
    id: 'promo-aruna-freeship',
    tenantId: 'ten-aruna',
    code: 'ONGKIR0',
    name: 'Free shipping over Rp 300 rb',
    kind: 'free_shipping',
    trigger: 'automatic',
    minSpend: 300_000,
    status: 'active',
    from: 150,
    to: -30,
  }),
  promo({
    id: 'promo-tek-va',
    tenantId: 'ten-teknika',
    code: 'VA1',
    name: '1% off spare parts paid by virtual account',
    kind: 'percentage',
    trigger: 'automatic',
    value: 1,
    categoryIds: ['cat-tek-parts'],
    paymentTypeIds: ['pay-teknika-va'],
    status: 'active',
    from: 30,
    to: -60,
  }),
]

const step = (id: string, kind: Automation['steps'][number]['kind'], detail: string) => ({ id, kind, detail })

export const automations: Automation[] = [
  {
    id: 'aut-lari-welcome',
    tenantId: 'ten-lari',
    name: 'Welcome journey',
    description: 'Greets new members and nudges a first purchase.',
    status: 'active',
    trigger: 'registered',
    triggerDetail: 'Any channel',
    steps: [
      step('s1', 'send_email', 'Welcome to Lari'),
      step('s2', 'wait', '3 days'),
      step('s3', 'condition', 'Has no order yet'),
      step('s4', 'give_voucher', 'WELCOME10, valid 14 days'),
      step('s5', 'send_whatsapp', 'Voucher reminder'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(40),
  },
  {
    id: 'aut-lari-cart',
    tenantId: 'ten-lari',
    name: 'Abandoned cart',
    description: 'Recovers checkouts left at payment.',
    status: 'active',
    trigger: 'cart_abandoned',
    triggerDetail: 'After 1 hour',
    steps: [
      step('s1', 'send_whatsapp', 'Your cart is waiting'),
      step('s2', 'wait', '24 hours'),
      step('s3', 'condition', 'Still no purchase'),
      step('s4', 'give_voucher', 'Rp 50 rb off, 48 hours'),
      step('s5', 'notify_sales', 'Assigned seller, if any'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(25),
  },
  {
    id: 'aut-lari-review',
    tenantId: 'ten-lari',
    name: 'Post purchase review',
    description: 'Asks for a review three days after delivery.',
    status: 'active',
    trigger: 'order_delivered',
    triggerDetail: 'Every order',
    steps: [
      step('s1', 'wait', '3 days'),
      step('s2', 'send_email', 'How are your new shoes?'),
      step('s3', 'condition', 'Review submitted'),
      step('s4', 'add_points', '+50 points'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(70),
  },
  {
    id: 'aut-lari-winback',
    tenantId: 'ten-lari',
    name: 'Win back',
    description: 'Personal offer after 90 quiet days.',
    status: 'active',
    trigger: 'no_purchase',
    triggerDetail: '90 days',
    steps: [
      step('s1', 'add_tag', 'at-risk'),
      step('s2', 'send_whatsapp', 'We miss you on the road'),
      step('s3', 'give_voucher', 'COMEBACK20'),
      step('s4', 'wait', '7 days'),
      step('s5', 'notify_sales', 'Call if still quiet'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(20),
  },
  {
    id: 'aut-lari-birthday',
    tenantId: 'ten-lari',
    name: 'Birthday treat',
    description: 'Double points in the birthday week.',
    status: 'paused',
    trigger: 'birthday',
    triggerDetail: '3 days before',
    steps: [
      step('s1', 'send_email', 'Happy birthday from Lari'),
      step('s2', 'add_points', 'Double points for 7 days'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(9),
  },
  {
    id: 'aut-lari-tier',
    tenantId: 'ten-lari',
    name: 'Gold welcome',
    description: 'Celebrates customers who reach Gold.',
    status: 'draft',
    trigger: 'tier_upgraded',
    triggerDetail: 'To Gold or higher',
    steps: [
      step('s1', 'send_whatsapp', 'You are Gold now'),
      step('s2', 'give_voucher', 'Free shipping for 30 days'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(2),
  },
  {
    id: 'aut-aruna-welcome',
    tenantId: 'ten-aruna',
    name: 'Welcome journey',
    description: 'Skin quiz and a first-order offer.',
    status: 'active',
    trigger: 'registered',
    triggerDetail: 'Any channel',
    steps: [
      step('s1', 'send_email', 'Take the skin quiz'),
      step('s2', 'wait', '2 days'),
      step('s3', 'give_voucher', '10% first order'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(60),
  },
  {
    id: 'aut-aruna-cart',
    tenantId: 'ten-aruna',
    name: 'Abandoned cart',
    description: 'Gentle reminder with a mini sample.',
    status: 'active',
    trigger: 'cart_abandoned',
    triggerDetail: 'After 2 hours',
    steps: [
      step('s1', 'send_whatsapp', 'Still thinking?'),
      step('s2', 'wait', '24 hours'),
      step('s3', 'give_voucher', 'Free mini sample'),
    ],
    enrolled30d: 0,
    converted30d: 0,
    revenue30d: 0,
    updatedAt: isoDaysAgo(33),
  },
]

/** Fills the campaign funnels and automation results from the generated orders and customers. */
export function buildCampaigns(orders: Order[], customers: Customer[], events: CustomerEvent[]): Campaign[] {
  return CAMPAIGN_SPECS.map((c) => {
    const attributed = orders.filter(
      (o) =>
        o.campaignId === c.id &&
        ['paid', 'processing', 'packed', 'shipped', 'delivered', 'completed'].includes(o.status),
    )
    // Built from the purchases backwards, so every step converts at a believable rate.
    const started = c.status === 'running' || c.status === 'completed' || c.status === 'paused'
    const purchased = attributed.length
    const checkout = Math.round(purchased * rng.float(1.5, 1.9))
    const carted = Math.round(checkout * rng.float(1.9, 2.5))
    const visited = Math.round(carted * rng.float(2.6, 3.4))
    const clicked = Math.round(visited * rng.float(1.05, 1.2))
    const opened = Math.round(clicked * rng.float(3.2, 4.5))
    const delivered = started
      ? Math.max(
          Math.round(opened * rng.float(2.2, 2.8)),
          Math.round(customers.filter((x) => x.tenantId === c.tenantId).length * 0.3),
        )
      : 0
    const sent = Math.round(delivered * rng.float(1.02, 1.06))
    for (const o of attributed.slice(0, 40)) {
      events.push({
        id: `ev-cc-${o.id}`,
        tenantId: o.tenantId,
        customerId: o.customerId,
        kind: 'campaign_click',
        at: toIso(toMs(o.createdAt) - rng.int(1, 6) * HOUR),
        label: `Clicked ${c.name}`,
        productId: null,
        orderId: null,
        campaignId: c.id,
        by: null,
      })
    }
    return {
      id: c.id,
      tenantId: c.tenantId,
      code: `CMP-${c.id.split('-').at(-1)!.toUpperCase()}`,
      name: c.name,
      goal: c.goal,
      status: c.status,
      channels: c.channels,
      segmentId: c.segmentId,
      promotionId: c.promotionId,
      pageId: c.pageId,
      startAt: isoDaysAgo(c.start, 9),
      endAt: isoDaysAgo(c.end, 23, 59),
      budget: c.budget,
      funnel: { sent, delivered, opened, clicked, visited, carted, checkout, purchased },
      revenue: attributed.reduce((s, o) => s + o.total, 0),
      createdBy: c.createdBy,
    }
  })
}

export function finishGrowth(orders: Order[]) {
  for (const p of promotions) {
    const used = orders.filter((o) => o.voucherCode === p.code)
    p.used = used.length
    p.revenue = used.reduce((s, o) => s + o.total, 0)
  }
  const recent = orders.filter((o) => toMs(o.createdAt) > NOW - 30 * DAY)
  for (const a of automations) {
    if (a.status === 'draft') continue
    const pool = recent.filter((o) => o.tenantId === a.tenantId)
    const share =
      a.trigger === 'order_delivered'
        ? 0.9
        : a.trigger === 'registered'
          ? 0.35
          : a.trigger === 'cart_abandoned'
            ? 0.25
            : 0.12
    a.enrolled30d = Math.round(pool.length * share * rng.float(1.5, 3))
    const converted = Math.round(a.enrolled30d * rng.float(0.06, 0.18))
    a.converted30d = converted
    a.revenue30d = Math.round(converted * (pool.reduce((s, o) => s + o.total, 0) / Math.max(1, pool.length)))
    if (a.status === 'paused') {
      a.enrolled30d = Math.round(a.enrolled30d * 0.3)
      a.converted30d = Math.round(a.converted30d * 0.3)
      a.revenue30d = Math.round(a.revenue30d * 0.3)
    }
  }
}

const LEAD_SPECS: {
  tenantId: string
  name: string
  company: string
  product: string | null
  value: number
  stage: LeadStage
  source: Lead['source']
  seller: string | null
  days: number
  touched: number
  note: string
}[] = [
  {
    tenantId: 'ten-teknika',
    name: 'Budi Hartono',
    company: 'PT Presisi Logam',
    product: 'prd-tk-101',
    value: 1_850_000_000,
    stage: 'negotiation',
    source: 'talk_to_sales',
    seller: 'sel-rizky',
    days: 34,
    touched: 1,
    note: 'Two VMC-850 for the new mould line. Wants 10% off and free commissioning.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Lia Gunawan',
    company: 'PT Astra Komponen',
    product: 'prd-tk-103',
    value: 2_400_000_000,
    stage: 'proposal',
    source: 'event',
    seller: 'sel-rizky',
    days: 21,
    touched: 3,
    note: 'Met at Manufacturing Indonesia. Needs a twin-pallet HMC by Q1.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Hadi Susanto',
    company: 'PT Sinar Teknik',
    product: 'prd-tk-102',
    value: 640_000_000,
    stage: 'qualified',
    source: 'personal_store',
    seller: 'sel-rizky',
    days: 12,
    touched: 2,
    note: "Came from Rizky's page. Budget approved for one lathe.",
  },
  {
    tenantId: 'ten-teknika',
    name: 'Rina Kusuma',
    company: 'PT Batam Precision',
    product: 'prd-tk-101',
    value: 925_000_000,
    stage: 'proposal',
    source: 'referral',
    seller: 'sel-wulan',
    days: 18,
    touched: 9,
    note: 'Referred by PT Global Fittings. Proposal sent, no reply yet.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Yusuf Pratama',
    company: 'PT Garuda Press',
    product: 'prd-tk-104',
    value: 186_000_000,
    stage: 'new',
    source: 'talk_to_sales',
    seller: null,
    days: 1,
    touched: 1,
    note: 'Asked for a quote on a 37 kW compressor.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Sinta Wibowo',
    company: 'CV Mitra Mould',
    product: 'prd-tk-101',
    value: 925_000_000,
    stage: 'new',
    source: 'whatsapp',
    seller: 'sel-agus',
    days: 2,
    touched: 2,
    note: 'WhatsApp enquiry from Surabaya.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Andreas Lim',
    company: 'PT Surya Otomotif',
    product: 'prd-tk-111',
    value: 144_000_000,
    stage: 'won',
    source: 'referral',
    seller: 'sel-agus',
    days: 40,
    touched: 15,
    note: 'Service contracts for four machines.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Maria Siregar',
    company: 'PT Delta Fabrikasi',
    product: 'prd-tk-102',
    value: 640_000_000,
    stage: 'lost',
    source: 'event',
    seller: 'sel-rizky',
    days: 45,
    touched: 20,
    note: 'Chose a cheaper import.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Joko Purnomo',
    company: 'PT Prima Gear',
    product: 'prd-tk-105',
    value: 85_000_000,
    stage: 'qualified',
    source: 'personal_store',
    seller: 'sel-wulan',
    days: 9,
    touched: 8,
    note: 'Two dryers for the paint shop.',
  },
  {
    tenantId: 'ten-teknika',
    name: 'Eko Setiawan',
    company: 'PT Kencana Tool',
    product: 'prd-tk-101',
    value: 0,
    stage: 'new',
    source: 'talk_to_sales',
    seller: null,
    days: 0,
    touched: 0,
    note: 'Asked for a brochure and a visit.',
  },
  {
    tenantId: 'ten-lari',
    name: 'Dina Hapsari',
    company: 'Bank Mandala Running Club',
    product: 'prd-lr-128',
    value: 48_000_000,
    stage: 'proposal',
    source: 'personal_store',
    seller: 'sel-rizky-lari',
    days: 14,
    touched: 2,
    note: "120 club singlets and shorts with logo for the bank's 10K.",
  },
  {
    tenantId: 'ten-lari',
    name: 'Taufik Hidayat',
    company: 'PT Telko Nusantara',
    product: 'prd-lr-128',
    value: 96_000_000,
    stage: 'negotiation',
    source: 'talk_to_sales',
    seller: 'sel-rizky-lari',
    days: 25,
    touched: 4,
    note: 'Corporate wellness run, 300 kits.',
  },
  {
    tenantId: 'ten-lari',
    name: 'Grace Halim',
    company: 'Jakarta Trail Series',
    product: 'prd-lr-126',
    value: 35_000_000,
    stage: 'qualified',
    source: 'event',
    seller: 'sel-sherlyn',
    days: 10,
    touched: 10,
    note: 'Race-pack bundles for 70 finishers.',
  },
  {
    tenantId: 'ten-lari',
    name: 'Reza Fauzi',
    company: 'SMA Harapan',
    product: 'prd-lr-114',
    value: 12_500_000,
    stage: 'new',
    source: 'whatsapp',
    seller: 'sel-fahmi',
    days: 3,
    touched: 3,
    note: 'School athletics team singlets.',
  },
  {
    tenantId: 'ten-lari',
    name: 'Mega Lestari',
    company: 'Startup Run Club',
    product: null,
    value: 18_000_000,
    stage: 'won',
    source: 'referral',
    seller: 'sel-fahmi',
    days: 30,
    touched: 12,
    note: 'Gait analysis day plus shoe fitting for 40 staff.',
  },
  {
    tenantId: 'ten-lari',
    name: 'Kevin Tanoto',
    company: 'Hotel Grand Senayan',
    product: 'prd-lr-128',
    value: 22_000_000,
    stage: 'new',
    source: 'talk_to_sales',
    seller: null,
    days: 1,
    touched: 1,
    note: 'Staff fun-run kits.',
  },
]

export const leads: Lead[] = LEAD_SPECS.map((l, i) => ({
  id: `lead-${String(i + 1).padStart(3, '0')}`,
  tenantId: l.tenantId,
  code: `LD-${String(301 + i)}`,
  name: l.name,
  company: l.company,
  phone: `+62 81${rng.int(1, 9)} ${rng.int(1000, 9999)} ${rng.int(1000, 9999)}`,
  productId: l.product,
  value: l.value,
  stage: l.stage,
  source: l.source,
  sellerId: l.seller,
  customerId: null,
  note: l.note,
  createdAt: isoDaysAgo(l.days, rng.int(8, 17)),
  updatedAt: isoDaysAgo(l.touched, rng.int(8, 17)),
  lostReason: l.stage === 'lost' ? 'Price: chose a cheaper import' : null,
}))

const SUBJECTS: [Ticket['kind'], string][] = [
  ['question', 'Which size for wide feet?'],
  ['complaint', 'Parcel arrived with a torn box'],
  ['return', 'Shoes too small, want to exchange'],
  ['refund', 'Charged twice through QRIS'],
  ['question', 'When does the pre-order ship?'],
  ['complaint', 'Courier marked delivered but nothing came'],
  ['return', 'Wrong colour sent'],
  ['question', 'Can I combine two vouchers?'],
  ['refund', 'Cancelled order, refund not received'],
  ['complaint', 'Sole started peeling after 3 weeks'],
]

export function buildTickets(orders: Order[], events: CustomerEvent[]): Ticket[] {
  const tickets: Ticket[] = []
  const plan: [string, number][] = [
    ['ten-lari', 22],
    ['ten-aruna', 12],
  ]
  for (const [tenantId, count] of plan) {
    const pool = orders.filter((o) => o.tenantId === tenantId && o.status !== 'new')
    for (let i = 0; i < count; i++) {
      const order = pool[pool.length - 1 - rng.int(0, Math.min(pool.length - 1, 160))]!
      const [kind, subject] = rng.pick(SUBJECTS)
      const ageH = i < 3 ? rng.int(30, 60) : rng.int(1, 24 * 20)
      const created = NOW - ageH * HOUR
      const resolved = ageH > 72 && rng.chance(0.85)
      const status: Ticket['status'] = resolved
        ? 'resolved'
        : ageH < 4
          ? 'open'
          : rng.weighted([
              ['open', 50],
              ['pending', 50],
            ] as const)
      tickets.push({
        id: `tic-${tenantId.slice(4)}-${i + 1}`,
        tenantId,
        code: `TK-${tenantId === 'ten-lari' ? 'L' : 'A'}${String(5001 + i)}`,
        customerId: order.customerId,
        orderId: rng.chance(0.85) ? order.id : null,
        kind,
        status,
        subject,
        channel: rng.weighted([
          ['whatsapp', 60],
          ['chat', 25],
          ['email', 15],
        ] as const),
        assigneeId: status === 'open' && rng.chance(0.4) ? null : 'usr-sari',
        createdAt: toIso(created),
        slaDueAt: toIso(created + (kind === 'refund' ? 24 : 48) * HOUR),
        resolvedAt: resolved ? toIso(created + rng.int(3, 40) * HOUR) : null,
      })
      events.push({
        id: `ev-tic-${tenantId}-${i}`,
        tenantId,
        customerId: order.customerId,
        kind: 'support',
        at: toIso(created),
        label: subject,
        productId: null,
        orderId: order.id,
        campaignId: null,
        by: null,
      })
    }
  }
  return tickets
}
