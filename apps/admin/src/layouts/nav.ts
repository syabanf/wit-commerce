import type { Role } from '@rc/types'
import type { LucideIcon } from 'lucide-react'
import {
  BadgePercent,
  Blocks,
  Bot,
  Boxes,
  CreditCard,
  ReceiptText,
  Library,
  FolderTree,
  ListPlus,
  SlidersHorizontal,
  Building2,
  ChartColumn,
  ChartNoAxesCombined,
  Crown,
  Gem,
  Globe,
  Handshake,
  Headset,
  KeyRound,
  LayoutGrid,
  Mail,
  Megaphone,
  Network,
  Package,
  Palette,
  Plug,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  Users,
  UsersRound,
  Workflow,
} from 'lucide-react'

/** Counts shown on navigation items. */
export type BadgeKey = 'toFulfil' | 'newLeads' | 'openTickets' | 'lowStock'

export interface NavLeaf {
  to: string
  /** The transaction code: type it in quick search to open this page. */
  code: string
  label: string
  icon: LucideIcon
  badge?: BadgeKey
  /** Shown to platform admins only. */
  platformOnly?: boolean
}

/** Separate daily selling work from catalog and payment configuration. */
export type NavGroup = 'Daily work' | 'Selling' | 'Master data' | 'Growth' | 'Insights & setup'

export interface NavSection {
  id: string
  /** The transaction code of a section with no sub-pages. */
  code?: string
  label: string
  icon: LucideIcon
  to: string
  group: NavGroup
  /** Count for a section with no sub-pages. */
  badge?: BadgeKey
  items?: NavLeaf[]
}

export const NAV: NavSection[] = [
  { id: 'home', code: 'HOM', label: 'Home', icon: LayoutGrid, to: '/', group: 'Daily work' },
  {
    id: 'orders',
    code: 'ORD',
    label: 'Orders',
    icon: ShoppingBag,
    to: '/commerce/orders',
    group: 'Selling',
    badge: 'toFulfil',
  },
  {
    id: 'payments',
    code: 'PAY',
    label: 'Payment history',
    icon: ReceiptText,
    to: '/commerce/payments',
    group: 'Selling',
  },
  {
    id: 'agents',
    code: 'AGT',
    label: 'AI agents',
    icon: Bot,
    to: '/commerce/agents',
    group: 'Selling',
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    to: '/customers/all',
    group: 'Selling',
    items: [
      { to: '/customers/all', code: 'CUS', label: 'All customers', icon: UserRound },
      { to: '/customers/support', code: 'SUP', label: 'Support', icon: Headset, badge: 'openTickets' },
      { to: '/customers/segments', code: 'SEG', label: 'Segments', icon: UsersRound },
      { to: '/customers/loyalty', code: 'LOY', label: 'Loyalty', icon: Crown },
    ],
  },
  {
    id: 'inventory',
    code: 'INV',
    label: 'Inventory',
    icon: Boxes,
    to: '/commerce/inventory',
    group: 'Selling',
    badge: 'lowStock',
  },
  {
    id: 'store',
    label: 'Online store',
    icon: Store,
    to: '/store/brand',
    group: 'Selling',
    items: [
      { to: '/store/brand', code: 'BRD', label: 'Brand guideline', icon: Palette },
      { to: '/store/domains', code: 'DOM', label: 'Domains & SEO', icon: Globe },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    icon: Package,
    to: '/commerce/products',
    group: 'Master data',
    items: [
      { to: '/commerce/products', code: 'PRD', label: 'Products', icon: Package },
      { to: '/commerce/categories', code: 'CAT', label: 'Categories', icon: FolderTree },
      { to: '/commerce/collections', code: 'COL', label: 'Collections', icon: Library },
      { to: '/commerce/attributes', code: 'ATR', label: 'Attributes', icon: SlidersHorizontal },
      { to: '/commerce/modifiers', code: 'MOD', label: 'Modifiers', icon: ListPlus },
    ],
  },
  {
    id: 'payment-types',
    code: 'PMT',
    label: 'Payment types',
    icon: CreditCard,
    to: '/settings/payment-types',
    group: 'Master data',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    to: '/marketing/campaigns',
    group: 'Growth',
    items: [
      { to: '/marketing/campaigns', code: 'CMP', label: 'Campaigns', icon: Megaphone },
      { to: '/marketing/promotions', code: 'PRM', label: 'Promotions', icon: BadgePercent },
      { to: '/marketing/automations', code: 'AUT', label: 'Automations', icon: Workflow },
    ],
  },
  {
    id: 'sales',
    label: 'Sales network',
    icon: Network,
    to: '/customers/leads',
    group: 'Growth',
    items: [
      { to: '/customers/leads', code: 'LED', label: 'Leads', icon: Handshake, badge: 'newLeads' },
      { to: '/sales/sellers', code: 'SLR', label: 'Sellers', icon: Gem },
      { to: '/sales/performance', code: 'PRF', label: 'Performance', icon: ChartNoAxesCombined },
    ],
  },
  {
    id: 'analytics',
    code: 'ANL',
    label: 'Analytics',
    icon: ChartColumn,
    to: '/analytics',
    group: 'Insights & setup',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    to: '/integrations',
    group: 'Insights & setup',
    items: [
      { to: '/integrations', code: 'INT', label: 'Connections', icon: Plug },
      { to: '/integrations/credentials', code: 'API', label: 'API credentials', icon: KeyRound },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings2,
    to: '/settings/users',
    group: 'Insights & setup',
    items: [
      { to: '/settings/users', code: 'USR', label: 'Users & roles', icon: ShieldCheck },
      { to: '/settings/tenants', code: 'TEN', label: 'Tenants', icon: Building2 },
      { to: '/settings/apps', code: 'APP', label: 'App marketplace', icon: Blocks },
      { to: '/settings/email', code: 'EML', label: 'Email', icon: Mail, platformOnly: true },
    ],
  },
]

const STAFF_NAV: NavSection[] = NAV.map((section) =>
  section.items?.some((i) => i.platformOnly)
    ? { ...section, items: section.items.filter((i) => !i.platformOnly) }
    : section,
)

/** The navigation a role sees: platform-only pages stay out of everyone else's menus. */
export const navFor = (role: Role | undefined) => (role === 'platform_admin' ? NAV : STAFF_NAV)

/** Codes of the create actions: the page's code and a plus. */
export const CREATE_CODE = {
  product: 'PRD+',
  customer: 'CUS+',
  lead: 'LED+',
  segment: 'SEG+',
  campaign: 'CMP+',
  promotion: 'PRM+',
  seller: 'SLR+',
} as const

const matches = (pathname: string, to: string) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)

/** The section a path belongs to: the one whose page or section link matches the longest prefix. */
export function sectionFor(pathname: string): NavSection {
  let best: NavSection = NAV[0]!
  let length = -1
  for (const section of NAV) {
    for (const to of [section.to, ...(section.items ?? []).map((i) => i.to)]) {
      if (matches(pathname, to) && to.length > length) {
        best = section
        length = to.length
      }
    }
  }
  return best
}

/** The section item a path belongs to (longest matching prefix). */
export function leafFor(pathname: string): NavLeaf | undefined {
  const items = sectionFor(pathname).items ?? []
  return [...items].sort((a, b) => b.to.length - a.to.length).find((i) => matches(pathname, i.to))
}

/** The transaction code of the page a path belongs to. */
export const codeFor = (pathname: string) => leafFor(pathname)?.code ?? sectionFor(pathname).code
