import { type Permission, can } from '@rc/fixtures'
import type { Role } from '@rc/types'
import type { LucideIcon } from 'lucide-react'
import { t } from '../i18n'
import {
  BadgePercent,
  Blocks,
  Bot,
  Boxes,
  CreditCard,
  ReceiptText,
  ScrollText,
  Library,
  FolderTree,
  ListPlus,
  SlidersHorizontal,
  Building2,
  ChartColumn,
  ChartNoAxesCombined,
  CircleUser,
  Coins,
  Crown,
  Gem,
  Globe,
  Handshake,
  Headset,
  Images,
  House,
  KeyRound,
  LayoutGrid,
  ListChecks,
  Mail,
  Megaphone,
  Network,
  Package,
  Palette,
  PencilRuler,
  Plug,
  Scale,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  Users,
  Undo2,
  UsersRound,
  Workflow,
  Gauge,
  WalletCards,
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
  /** The page is for a role holding any of these permissions. */
  needs?: Permission[]
}

/** The sidebar's two menus: running the brand, and what a person does for themselves. */
export type NavArea = 'backoffice' | 'employee'

/** Separate daily selling work from catalog and payment configuration. */
export type NavGroup = 'Daily work' | 'Selling' | 'Master data' | 'Growth' | 'Insights & setup'

export interface NavSection {
  id: string
  /** The transaction code of a section with no sub-pages. */
  code?: string
  label: string
  icon: LucideIcon
  to: string
  /** The heading a back-office section sits under. Employee pages form a flat list. */
  group?: NavGroup
  /** The section, with every page in it, is for a role holding any of these permissions. */
  needs?: Permission[]
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
    needs: ['order.fulfil', 'order.refund', 'customer.manage'],
  },
  {
    id: 'returns',
    code: 'RET',
    label: 'Returns',
    icon: Undo2,
    to: '/commerce/returns',
    group: 'Selling',
    needs: ['order.refund', 'order.fulfil', 'ticket.manage'],
  },
  {
    id: 'payments',
    code: 'PAY',
    label: 'Payment history',
    icon: ReceiptText,
    to: '/commerce/payments',
    group: 'Selling',
    needs: ['order.fulfil', 'order.refund'],
  },
  {
    id: 'agents',
    code: 'AGT',
    label: 'AI agents',
    icon: Bot,
    to: '/commerce/agents',
    group: 'Selling',
    needs: ['integration.manage', 'store.manage'],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    to: '/customers/all',
    group: 'Selling',
    items: [
      {
        to: '/customers/all',
        code: 'CUS',
        label: 'All customers',
        icon: UserRound,
        needs: ['customer.manage'],
      },
      {
        to: '/customers/support',
        code: 'SUP',
        label: 'Support',
        icon: Headset,
        badge: 'openTickets',
        needs: ['ticket.manage'],
      },
      {
        to: '/customers/segments',
        code: 'SEG',
        label: 'Segments',
        icon: UsersRound,
        needs: ['segment.manage'],
      },
      { to: '/customers/loyalty', code: 'LOY', label: 'Loyalty', icon: Crown, needs: ['customer.manage'] },
      {
        to: '/customers/privacy',
        code: 'PRV',
        label: 'Privacy requests',
        icon: ShieldCheck,
        needs: ['privacy.manage'],
      },
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
    needs: ['inventory.manage'],
  },
  {
    id: 'store',
    label: 'Online store',
    icon: Store,
    to: '/store/editor',
    group: 'Selling',
    items: [
      { to: '/store/editor', code: 'EDT', label: 'Store editor', icon: PencilRuler, needs: ['store.manage'] },
      { to: '/store/brand', code: 'BRD', label: 'Look and feel', icon: Palette, needs: ['brand.manage'] },
      { to: '/store/domains', code: 'DOM', label: 'Domains & SEO', icon: Globe, needs: ['brand.manage'] },
      { to: '/store/legal', code: 'LGL', label: 'Legal & policies', icon: Scale, needs: ['brand.manage'] },
      { to: '/store/media', code: 'MED', label: 'Media', icon: Images, needs: ['store.manage', 'product.manage'] },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    icon: Package,
    to: '/commerce/products',
    group: 'Master data',
    needs: ['product.manage'],
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
    needs: ['integration.manage'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    to: '/marketing/campaigns',
    group: 'Growth',
    items: [
      {
        to: '/marketing/campaigns',
        code: 'CMP',
        label: 'Campaigns',
        icon: Megaphone,
        needs: ['campaign.manage'],
      },
      {
        to: '/marketing/promotions',
        code: 'PRM',
        label: 'Promotions',
        icon: BadgePercent,
        needs: ['promotion.manage'],
      },
      {
        to: '/marketing/automations',
        code: 'AUT',
        label: 'Automations',
        icon: Workflow,
        needs: ['automation.manage'],
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales network',
    icon: Network,
    to: '/customers/leads',
    group: 'Growth',
    items: [
      {
        to: '/customers/leads',
        code: 'LED',
        label: 'Leads',
        icon: Handshake,
        badge: 'newLeads',
        needs: ['lead.manage'],
      },
      { to: '/sales/sellers', code: 'SLR', label: 'Sellers', icon: Gem, needs: ['seller.manage'] },
      {
        to: '/sales/performance',
        code: 'PRF',
        label: 'Performance',
        icon: ChartNoAxesCombined,
        needs: ['seller.manage'],
      },
    ],
  },
  {
    id: 'analytics',
    code: 'ANL',
    label: 'Analytics',
    icon: ChartColumn,
    to: '/analytics',
    group: 'Insights & setup',
    needs: ['analytics.view'],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    to: '/integrations',
    group: 'Insights & setup',
    needs: ['integration.manage'],
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
      {
        to: '/settings/users',
        code: 'USR',
        label: 'Users & roles',
        icon: ShieldCheck,
        needs: ['user.manage'],
      },
      {
        to: '/settings/tenants',
        code: 'TEN',
        label: 'Tenants',
        icon: Building2,
        needs: ['tenant.manage', 'brand.manage'],
      },
      {
        to: '/settings/apps',
        code: 'APP',
        label: 'App marketplace',
        icon: Blocks,
        needs: ['integration.manage'],
      },
      { to: '/settings/email', code: 'EML', label: 'Email', icon: Mail, platformOnly: true },
      { to: '/settings/currencies', code: 'FXR', label: 'Currencies', icon: Coins, platformOnly: true },
      { to: '/settings/plan', code: 'PLU', label: 'Plan & usage', icon: Gauge, needs: ['user.manage'] },
      { to: '/settings/plans', code: 'PLN', label: 'Plans', icon: WalletCards, platformOnly: true },
      { to: '/settings/assistant-log', code: 'ASL', label: 'Assistant log', icon: ScrollText, needs: ['user.manage'] },
    ],
  },
]

/** What a person does for themselves. Everyone who signs in has these pages. */
export const EMPLOYEE_NAV: NavSection[] = [
  { id: 'me', code: 'MEH', label: t.navigation.myHome, icon: House, to: '/me' },
  { id: 'me-tasks', code: 'MET', label: t.navigation.myTasks, icon: ListChecks, to: '/me/tasks' },
  { id: 'me-account', code: 'MEA', label: t.navigation.myAccount, icon: CircleUser, to: '/me/account' },
]

export const AREA_LABEL: Record<NavArea, string> = {
  backoffice: t.navigation.backOffice,
  employee: t.navigation.employee,
}

export const AREA_HOME: Record<NavArea, string> = { backoffice: '/', employee: '/me' }

const allowed = (role: Role, page: { needs?: Permission[]; platformOnly?: boolean }) =>
  (!page.platformOnly || role === 'platform_admin') &&
  (!page.needs || page.needs.some((permission) => can(role, permission)))

/**
 * The back-office menu a role sees: the sections and pages its permissions make useful, each
 * section opening on its first page. Home is there for anyone with at least one other section.
 */
export function navFor(role: Role | undefined): NavSection[] {
  if (!role) return []
  const sections = NAV.flatMap((section): NavSection[] => {
    if (!allowed(role, section)) return []
    if (!section.items) return [section]
    const items = section.items.filter((item) => allowed(role, item))
    return items.length ? [{ ...section, items, to: items[0]!.to }] : []
  })
  return sections.length > 1 ? sections : []
}

/** The areas a role has. Everyone has the employee area; the sidebar shows tabs only for two. */
export const areasFor = (role: Role | undefined): NavArea[] =>
  navFor(role).length ? ['backoffice', 'employee'] : ['employee']

/** The menu of one area for a role. */
export const areaNav = (role: Role | undefined, area: NavArea) =>
  area === 'employee' ? EMPLOYEE_NAV : navFor(role)

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

/** The area a path belongs to: everything under /me is the employee area. */
export const areaOfPath = (pathname: string): NavArea =>
  matches(pathname, AREA_HOME.employee) ? 'employee' : 'backoffice'

const ALL_SECTIONS = [...NAV, ...EMPLOYEE_NAV]

/** The section a path belongs to: the one whose page or section link matches the longest prefix. */
export function sectionFor(pathname: string): NavSection {
  let best: NavSection = NAV[0]!
  let length = -1
  for (const section of ALL_SECTIONS) {
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

/** Whether a role's menu holds the page a path (or link) belongs to. */
export function mayOpen(role: Role | undefined, to: string): boolean {
  const pathname = to.split('?')[0]!
  if (areaOfPath(pathname) === 'employee') return true
  const section = navFor(role).find((s) => s.id === sectionFor(pathname).id)
  if (!section) return false
  const leaf = leafFor(pathname)
  return !leaf || !!section.items?.some((item) => item.to === leaf.to)
}
