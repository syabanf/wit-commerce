import { fmtDate, fmtWeekday } from '@rc/fixtures'
import { ROLE_LABEL } from '@rc/types'
import { ActionMenu, Avatar, Button } from '@rc/ui'
import { LogOut, Menu, Plus, Search, Store, UserRoundCog } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { storefrontUrl } from '../lib/storefront'
import { useNow } from '../state/scoped'
import { CreateMenu } from './CreateMenu'
import { GlobalSearch } from './GlobalSearch'
import { leafFor, sectionFor } from './nav'
import { NotificationsButton } from './notifications'

export function Header({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const { tenant } = useAuth()
  const now = useNow(60_000)
  const [searchOpen, setSearchOpen] = useState(false)
  const section = sectionFor(pathname)
  const leaf = leafFor(pathname)

  return (
    <>
      <header className="h-14 gap-3 flex shrink-0 items-center print:hidden">
        <Button variant="card" size="icon-lg" className="md:hidden" aria-label="Open menu" onClick={onMenu}>
          <Menu />
        </Button>
        <div className="min-w-0 md:block md:max-w-[14rem] lg:max-w-[18rem] hidden shrink-0">
          <h2 className="text-lg font-bold leading-tight truncate">{leaf?.label ?? section.label}</h2>
          <p className="text-xs truncate text-muted">
            {tenant?.name} · {fmtWeekday(now)} {fmtDate(now)}
          </p>
        </div>
        <GlobalSearch className="min-w-0 md:ml-4 md:block md:max-w-md hidden flex-1" />
        <div className="gap-2 ml-auto flex shrink-0 items-center">
          <Button
            variant="card"
            size="icon-lg"
            className="md:hidden"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search />
          </Button>
          <CreateMenu
            trigger={
              <Button className="sm:inline-flex hidden">
                <Plus />
                Create
              </Button>
            }
          />
          {tenant && (
            <Button asChild variant="card" size="icon-lg" className="md:inline-flex hidden">
              <a
                href={storefrontUrl(tenant.subdomain)}
                target="_blank"
                rel="noreferrer"
                aria-label={`View ${tenant.name} store`}
                title="View store"
              >
                <Store />
              </a>
            </Button>
          )}
          <NotificationsButton />
          <UserMenu />
        </div>
      </header>
      {searchOpen && (
        <div className="-mt-2 md:hidden">
          <GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} />
        </div>
      )}
    </>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  const leave = () => {
    signOut()
    navigate('/login')
  }
  return (
    <ActionMenu
      title={`${user.name} · ${ROLE_LABEL[user.role]}`}
      trigger={
        <button
          type="button"
          aria-label={`Account: ${user.name}`}
          className="h-11 gap-2.5 p-1.5 xl:pr-4 flex items-center rounded-full bg-card shadow-card transition-colors hover:bg-surface-2"
        >
          <Avatar name={user.name} color={user.color} size="sm" />
          <span className="min-w-0 xl:block hidden text-left">
            <span className="text-sm font-semibold leading-tight block max-w-[10rem] truncate">
              {user.name}
            </span>
            <span className="block max-w-[10rem] truncate text-[11px] text-muted">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
        </button>
      }
      items={[
        {
          key: 'switch',
          label: 'Switch demo user',
          description: 'Try another role',
          icon: <UserRoundCog />,
          onSelect: leave,
        },
        { key: 'out', label: 'Sign out', icon: <LogOut />, onSelect: leave },
      ]}
    />
  )
}
