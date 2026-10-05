import type { LucideIcon } from 'lucide-react'
import { House, Store, Target, Users } from 'lucide-react'
import { paths } from '../lib/paths'

export type TabId = 'home' | 'leads' | 'customers' | 'store'

export interface TabDef {
  id: TabId
  to: string
  label: string
  icon: LucideIcon
}

export const TABS: TabDef[] = [
  { id: 'home', to: paths.home, label: 'Home', icon: House },
  { id: 'leads', to: paths.leads(), label: 'Leads', icon: Target },
  { id: 'customers', to: paths.customers, label: 'Customers', icon: Users },
  { id: 'store', to: paths.store, label: 'Store', icon: Store },
]

const TAB_ROOTS = new Set(TABS.map((t) => t.to))

/** Tab roots show the bottom bar; every other route is a detail screen with a back button. */
export const isTabRoot = (pathname: string) => TAB_ROOTS.has(pathname)
