import type { LucideIcon } from 'lucide-react'
import {
  BadgePercent,
  Blocks,
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
  LayoutGrid,
  LayoutTemplate,
  Megaphone,
  Network,
  Package,
  Palette,
  PanelsTopLeft,
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
  label: string
  icon: LucideIcon
  badge?: BadgeKey
}

/** Separate daily selling work from catalog and payment configuration. */
export type NavGroup = 'Daily work' | 'Selling' | 'Master data' | 'Growth' | 'Insights & setup'

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon
  to: string
  group: NavGroup
  /** Count for a section with no sub-pages. */
  badge?: BadgeKey
  items?: NavLeaf[]
}

export const NAV: NavSection[] = [
  { id: 'home', label: 'Home', icon: LayoutGrid, to: '/', group: 'Daily work' },
  {
    id: 'orders',
    label: 'Orders',
    icon: ShoppingBag,
    to: '/commerce/orders',
    group: 'Selling',
    badge: 'toFulfil',
  },
  {
    id: 'payments',
    label: 'Payment history',
    icon: ReceiptText,
    to: '/commerce/payments',
    group: 'Selling',
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    to: '/customers/all',
    group: 'Selling',
    items: [
      { to: '/customers/all', label: 'All customers', icon: UserRound },
      { to: '/customers/support', label: 'Support', icon: Headset, badge: 'openTickets' },
      { to: '/customers/segments', label: 'Segments', icon: UsersRound },
      { to: '/customers/loyalty', label: 'Loyalty', icon: Crown },
    ],
  },
  {
    id: 'inventory',
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
    to: '/store/pages',
    group: 'Selling',
    items: [
      { to: '/store/pages', label: 'Pages', icon: PanelsTopLeft },
      { to: '/store/templates', label: 'Templates', icon: LayoutTemplate },
      { to: '/store/brand', label: 'Brand guideline', icon: Palette },
      { to: '/store/domains', label: 'Domains & SEO', icon: Globe },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    icon: Package,
    to: '/commerce/products',
    group: 'Master data',
    items: [
      { to: '/commerce/products', label: 'Products', icon: Package },
      { to: '/commerce/categories', label: 'Categories', icon: FolderTree },
      { to: '/commerce/collections', label: 'Collections', icon: Library },
      { to: '/commerce/attributes', label: 'Attributes', icon: SlidersHorizontal },
      { to: '/commerce/modifiers', label: 'Modifiers', icon: ListPlus },
    ],
  },
  {
    id: 'payment-types',
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
      { to: '/marketing/campaigns', label: 'Campaigns', icon: Megaphone },
      { to: '/marketing/promotions', label: 'Promotions', icon: BadgePercent },
      { to: '/marketing/automations', label: 'Automations', icon: Workflow },
    ],
  },
  {
    id: 'sales',
    label: 'Sales network',
    icon: Network,
    to: '/customers/leads',
    group: 'Growth',
    items: [
      { to: '/customers/leads', label: 'Leads', icon: Handshake, badge: 'newLeads' },
      { to: '/sales/sellers', label: 'Sellers', icon: Gem },
      { to: '/sales/performance', label: 'Performance', icon: ChartNoAxesCombined },
    ],
  },
  { id: 'analytics', label: 'Analytics', icon: ChartColumn, to: '/analytics', group: 'Insights & setup' },
  { id: 'integrations', label: 'Integrations', icon: Plug, to: '/integrations', group: 'Insights & setup' },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings2,
    to: '/settings/users',
    group: 'Insights & setup',
    items: [
      { to: '/settings/users', label: 'Users & roles', icon: ShieldCheck },
      { to: '/settings/tenants', label: 'Tenants', icon: Building2 },
      { to: '/settings/apps', label: 'App marketplace', icon: Blocks },
    ],
  },
]

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
