import type { Role } from '@rc/types'
import { ROLE_LABEL } from '@rc/types'
import {
  Avatar,
  BottomBar,
  BottomBarAction,
  BottomBarItem,
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  cn,
} from '@rc/ui'
import type { LucideIcon } from 'lucide-react'
import {
  ChartColumn,
  ChevronDown,
  Handshake,
  Headset,
  House,
  LayoutGrid,
  LogOut,
  Megaphone,
  Package,
  PanelsTopLeft,
  Plus,
  Search,
  ShoppingBag,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { usePersistentState } from '../lib/storage'
import { CreateMenu } from './CreateMenu'
import { type BadgeKey, NAV, type NavLeaf, sectionFor } from './nav'
import { useNavCounts } from './useNavCounts'

interface Shortcut {
  label: string
  to: string
  icon: LucideIcon
  badge?: BadgeKey
}

const ORDERS: Shortcut = { label: 'Orders', to: '/commerce/orders', icon: ShoppingBag, badge: 'toFulfil' }
const CUSTOMERS: Shortcut = { label: 'Customers', to: '/customers/all', icon: UserRound }
const ANALYTICS: Shortcut = { label: 'Analytics', to: '/analytics', icon: ChartColumn }

/** Three phone shortcuts per role, around the round create button. */
const SHORTCUTS: Record<Role, [Shortcut, Shortcut, Shortcut]> = {
  platform_admin: [ORDERS, CUSTOMERS, ANALYTICS],
  tenant_admin: [ORDERS, CUSTOMERS, ANALYTICS],
  marketing: [
    { label: 'Campaigns', to: '/marketing/campaigns', icon: Megaphone },
    { label: 'Segments', to: '/customers/segments', icon: UsersRound },
    { label: 'Pages', to: '/store/pages', icon: PanelsTopLeft },
  ],
  operations: [ORDERS, { label: 'Products', to: '/commerce/products', icon: Package }, ANALYTICS],
  service: [
    { label: 'Support', to: '/customers/support', icon: Headset, badge: 'openTickets' },
    CUSTOMERS,
    ORDERS,
  ],
  sales: [{ label: 'Leads', to: '/customers/leads', icon: Handshake, badge: 'newLeads' }, CUSTOMERS, ORDERS],
}

/** Phone navigation: floating ink bar plus a dark bottom sheet with every destination. */
export function PhoneNav({
  moreOpen,
  onMoreChange,
}: {
  moreOpen: boolean
  onMoreChange: (open: boolean) => void
}) {
  const { pathname } = useLocation()
  const counts = useNavCounts()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [recent, setRecent] = usePersistentState<string[]>('rc.admin.recent-nav', [])
  const [query, setQuery] = useState('')
  const [openSection, setOpenSection] = useState<string | null>(null)
  if (!user) return null
  const is = (path: string) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
  const current = sectionFor(pathname)
  const leaves: (NavLeaf & { section: string })[] = NAV.flatMap((s) =>
    (s.items ?? [{ to: s.to, label: s.label, icon: s.icon }]).map((i) => ({ ...i, section: s.label })),
  )
  const q = query.trim().toLowerCase()

  const change = (open: boolean) => {
    if (open) {
      setQuery('')
      setOpenSection(current.id)
    }
    onMoreChange(open)
  }
  const choose = (to: string) => {
    setRecent((list) => [to, ...list.filter((x) => x !== to)].slice(0, 4))
    onMoreChange(false)
  }
  const ordered = [current, ...NAV.filter((s) => s.id !== current.id)]

  return (
    <>
      <BottomBar className="print:hidden">
        <BottomBarItem asChild icon={<House />} label="Home" active={is('/')}>
          <Link to="/" />
        </BottomBarItem>
        {SHORTCUTS[user.role].slice(0, 1).map((s) => (
          <BottomBarItem
            key={s.to}
            asChild
            icon={<s.icon />}
            label={s.label}
            active={is(s.to)}
            badge={s.badge ? counts[s.badge] : 0}
          >
            <Link to={s.to} />
          </BottomBarItem>
        ))}
        <CreateMenu
          trigger={
            <BottomBarAction label="Create">
              <Plus />
            </BottomBarAction>
          }
        />
        {SHORTCUTS[user.role].slice(1).map((s) => (
          <BottomBarItem
            key={s.to}
            asChild
            icon={<s.icon />}
            label={s.label}
            active={is(s.to)}
            badge={s.badge ? counts[s.badge] : 0}
          >
            <Link to={s.to} />
          </BottomBarItem>
        ))}
        <BottomBarItem icon={<LayoutGrid />} label="More" active={moreOpen} onClick={() => change(true)} />
      </BottomBar>

      <Sheet open={moreOpen} onOpenChange={change}>
        <SheetContent side="bottom" tone="dark" hideClose aria-describedby={undefined} className="pt-0">
          <SheetTitle className="sr-only">All destinations</SheetTitle>
          <div className="top-0 px-4 pb-3 pt-4 sticky z-10 bg-ink">
            <label className="h-11 gap-2 rounded-2xl bg-white/10 px-3 flex items-center">
              <Search className="size-4 text-on-ink-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a page"
                aria-label="Find a page"
                className="min-w-0 text-base text-white flex-1 bg-transparent outline-none placeholder:text-on-ink-muted"
              />
            </label>
          </div>
          {!q && recent.length > 0 && (
            <div className="px-5 pb-2">
              <p className="font-semibold tracking-wider text-[0.6875rem] text-on-ink-muted uppercase">Recent</p>
              <div className="mt-2 gap-2 flex flex-wrap">
                {recent.map((to) => {
                  const leaf = leaves.find((l) => l.to === to)
                  return leaf ? (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => choose(to)}
                      className="bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20 rounded-full"
                    >
                      {leaf.label}
                    </Link>
                  ) : null
                })}
              </div>
            </div>
          )}
          {ordered.map((section) => {
            const items = (
              section.items ?? [{ to: section.to, label: section.label, icon: section.icon }]
            ).filter(
              (i) => !q || i.label.toLowerCase().includes(q) || section.label.toLowerCase().includes(q),
            )
            if (!items.length) return null
            const open = !!q || openSection === section.id
            return (
              <div key={section.id || 'home'}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenSection(open ? null : section.id)}
                  className="px-5 py-3 font-semibold tracking-wider hover:text-white flex w-full items-center justify-between text-left text-[0.6875rem] text-on-ink-muted uppercase"
                >
                  {section.label}
                  <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="gap-2 px-3 pb-2 grid grid-cols-3">
                    {items.map((d) => {
                      const Icon = d.icon
                      const active = is(d.to)
                      const badge = 'badge' in d && d.badge ? counts[d.badge] : 0
                      return (
                        <Link
                          key={d.to}
                          to={d.to}
                          onClick={() => choose(d.to)}
                          className="gap-2 rounded-2xl p-3 hover:bg-white/10 flex flex-col items-center text-center transition-colors"
                        >
                          <span
                            className={cn(
                              'size-11 rounded-2xl bg-white/10 [&_svg]:size-5 relative flex items-center justify-center',
                              active && 'text-white bg-accent shadow-glow',
                            )}
                          >
                            <Icon />
                            {badge > 0 && (
                              <span className="-right-1 -top-1 bg-white px-1 font-bold absolute flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full text-[0.625rem] text-ink">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </span>
                          <span className="text-xs font-medium leading-tight">{d.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          <div className="mt-3 gap-3 border-white/10 px-5 pt-4 flex items-center border-t">
            <Avatar name={user.name} color={user.color} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs truncate text-on-ink-muted">{ROLE_LABEL[user.role]}</p>
            </div>
            <Button
              variant="onInk"
              size="sm"
              onClick={() => {
                onMoreChange(false)
                signOut()
                navigate('/login')
              }}
            >
              <LogOut />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
