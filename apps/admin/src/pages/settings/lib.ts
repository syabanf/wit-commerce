import { type Permission, ROLE_PERMISSIONS } from '@rc/fixtures'
import { type Courier, type PaymentMethod, ROLE_LABEL, type Role, type Tenant } from '@rc/types'

export const ROLES = Object.keys(ROLE_LABEL) as Role[]

// --- permissions ---

export const PERMISSION_LABEL: Record<Permission, string> = {
  'brand.manage': 'Edit the brand guideline and locks',
  'store.manage': 'Build store pages and templates',
  'product.manage': 'Edit products and prices',
  'inventory.manage': 'Adjust and receive stock',
  'order.fulfil': 'Confirm, pack and ship orders',
  'order.refund': 'Cancel and refund orders',
  'customer.manage': 'Edit customer records',
  'segment.manage': 'Build segments',
  'lead.manage': 'Work leads',
  'ticket.manage': 'Answer support tickets',
  'campaign.manage': 'Create and launch campaigns',
  'automation.manage': 'Build automations',
  'promotion.manage': 'Create promotions and vouchers',
  'seller.manage': 'Manage sellers and personal stores',
  'analytics.view': 'Open analytics',
  'integration.manage': 'Connect and sync integrations',
  'tenant.manage': 'Create and set up tenants',
}

export const PERMISSION_GROUPS: { area: string; permissions: Permission[] }[] = [
  { area: 'Store', permissions: ['brand.manage', 'store.manage'] },
  { area: 'Commerce', permissions: ['product.manage', 'inventory.manage', 'order.fulfil', 'order.refund'] },
  { area: 'Customers', permissions: ['customer.manage', 'segment.manage', 'lead.manage', 'ticket.manage'] },
  {
    area: 'Growth',
    permissions: [
      'campaign.manage',
      'automation.manage',
      'promotion.manage',
      'seller.manage',
      'analytics.view',
    ],
  },
  { area: 'Platform', permissions: ['integration.manage', 'tenant.manage'] },
]

export const PERMISSION_COUNT = ROLE_PERMISSIONS.platform_admin.length

// --- tenants and onboarding ---

/** The ten onboarding steps a tenant goes through, in order (spec section 4). */
export const ONBOARDING_STEPS: { key: string; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'brand', label: 'Brand' },
  { key: 'template', label: 'Store template' },
  { key: 'commerce', label: 'Commerce settings' },
  { key: 'payment', label: 'Payment' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'products', label: 'Products' },
  { key: 'users', label: 'Team' },
  { key: 'preview', label: 'Preview' },
  { key: 'publish', label: 'Publish' },
]

export const isLive = (t: Pick<Tenant, 'domainVerified' | 'onboarding'>) =>
  t.domainVerified || t.onboarding.includes('publish')

export const remainingSteps = (t: Pick<Tenant, 'onboarding'>) =>
  ONBOARDING_STEPS.filter((s) => !t.onboarding.includes(s.key))

export const storeHost = (t: Pick<Tenant, 'domain' | 'subdomain'>) =>
  t.domain ?? `${t.subdomain}.commerceos.id`

export const WIZARD_PAYMENTS: PaymentMethod[] = ['qris', 'va', 'ewallet', 'credit_card', 'paylater', 'cod']
export const WIZARD_COURIERS: Courier[] = ['jne', 'jnt', 'sicepat', 'gojek', 'grab', 'pickup']

/** Uppercase code from the name, made unique against existing codes. */
export function tenantCode(name: string, taken: readonly string[]) {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 10) || 'TENANT'
  let code = base
  for (let n = 2; taken.includes(code); n++) code = `${base}${n}`
  return code
}

export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const parseEmails = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)

export const invalidEmails = (emails: readonly string[]) => emails.filter((e) => !EMAIL_PATTERN.test(e))

// --- app marketplace (spec 57) ---

export type AppIcon =
  | 'reviews'
  | 'search'
  | 'games'
  | 'instagram'
  | 'accounting'
  | 'channels'
  | 'merchant'
  | 'pixel'
  | 'chat'
  | 'shipping'

export interface MarketplaceApp {
  id: string
  name: string
  category: string
  summary: string
  icon: AppIcon
}

export const MARKETPLACE_APPS: MarketplaceApp[] = [
  {
    id: 'app-reviews',
    name: 'Reviews & UGC',
    category: 'Social proof',
    summary: 'Collects photo reviews after delivery and shows them on product pages.',
    icon: 'reviews',
  },
  {
    id: 'app-search',
    name: 'Smart search',
    category: 'Discovery',
    summary: 'Typo-tolerant search with synonyms that cuts zero-result searches.',
    icon: 'search',
  },
  {
    id: 'app-games',
    name: 'Loyalty games',
    category: 'Loyalty',
    summary: 'Spin-the-wheel and check-in streaks that award loyalty points.',
    icon: 'games',
  },
  {
    id: 'app-instagram',
    name: 'Instagram shop',
    category: 'Social commerce',
    summary: 'Tags products in posts and syncs the catalog to Instagram.',
    icon: 'instagram',
  },
  {
    id: 'app-accurate',
    name: 'Accurate sync',
    category: 'Accounting',
    summary: 'Two-way sync of invoices, stock and customers with Accurate Online.',
    icon: 'accounting',
  },
  {
    id: 'app-jubelio',
    name: 'Jubelio',
    category: 'Omnichannel',
    summary: 'Runs marketplace listings and stock from one Jubelio account.',
    icon: 'channels',
  },
  {
    id: 'app-gmc',
    name: 'Google Merchant Center',
    category: 'Ads',
    summary: 'Sends the product feed to Google Shopping every hour.',
    icon: 'merchant',
  },
  {
    id: 'app-meta',
    name: 'Meta pixel',
    category: 'Ads',
    summary: 'Server-side purchase events for Facebook and Instagram ads.',
    icon: 'pixel',
  },
  {
    id: 'app-qiscus',
    name: 'Qiscus chat',
    category: 'Customer service',
    summary: 'Live chat and WhatsApp inbox linked to Customer 360.',
    icon: 'chat',
  },
  {
    id: 'app-shipper',
    name: 'Shipper rate engine',
    category: 'Logistics',
    summary: 'Compares courier rates at checkout and books the cheapest one.',
    icon: 'shipping',
  },
]
