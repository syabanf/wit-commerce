import { fmtDate, fmtWeekday } from '@rc/fixtures'
import { ROLE_LABEL } from '@rc/types'
import { ActionMenu, Avatar, Button, ChangePasswordDialog, type ActionMenuItem, toast } from '@rc/ui'
import { Check, Hash, KeyRound, LogOut, Menu, Plus, Search, Store, UserRoundCog } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError } from '@rc/api'
import { useAuth } from '../auth/auth'
import { HTTP, api } from '../lib/api'
import { storefrontUrl } from '../lib/storefront'
import { useNow } from '../state/scoped'
import { CreateMenu } from './CreateMenu'
import { codeFor, leafFor, sectionFor } from './nav'
import { NotificationsButton } from './notifications'

export function Header({
  onMenu,
  onSearch,
  showCodes,
  onShowCodes,
}: {
  onMenu: () => void
  onSearch: () => void
  showCodes: boolean
  onShowCodes: (show: boolean) => void
}) {
  const { pathname } = useLocation()
  const { tenant } = useAuth()
  const now = useNow(60_000)
  const section = sectionFor(pathname)
  const leaf = leafFor(pathname)
  const code = codeFor(pathname)

  return (
    <header className="h-14 gap-3 flex shrink-0 items-center print:hidden">
      <Button variant="card" size="icon-lg" className="md:hidden" aria-label="Open menu" onClick={onMenu}>
        <Menu />
      </Button>
      <div className="min-w-0 md:block md:max-w-[14rem] lg:max-w-[18rem] hidden shrink-0">
        <h2 className="text-lg font-bold leading-tight gap-2 flex items-baseline">
          <span className="truncate">{leaf?.label ?? section.label}</span>
          {showCodes && code && <span className="text-xs font-medium font-mono text-muted">{code}</span>}
        </h2>
        <p className="text-xs truncate text-muted">
          {tenant?.name} · {fmtWeekday(now)} {fmtDate(now)}
        </p>
      </div>
      <button
        type="button"
        onClick={onSearch}
        aria-keyshortcuts="Meta+K Control+K /"
        className="h-11 min-w-0 gap-2 px-4 text-sm md:ml-4 md:flex md:max-w-md [&_svg]:size-4 hidden flex-1 items-center rounded-full bg-card text-muted shadow-card transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none [&_svg]:shrink-0"
      >
        <Search />
        <span className="min-w-0 flex-1 truncate text-left">What do you want to do?</span>
        <kbd className="rounded-md px-1.5 py-0.5 font-semibold border border-border bg-surface text-[0.625rem]">
          ⌘K
        </kbd>
      </button>
      <div className="gap-2 ml-auto flex shrink-0 items-center">
        <Button
          variant="card"
          size="icon-lg"
          className="md:hidden"
          aria-label="Quick search"
          onClick={onSearch}
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
        <UserMenu showCodes={showCodes} onShowCodes={onShowCodes} />
      </div>
    </header>
  )
}

function UserMenu({ showCodes, onShowCodes }: { showCodes: boolean; onShowCodes: (show: boolean) => void }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [changing, setChanging] = useState(false)
  if (!user) return null
  const changePassword = async (current: string, next: string) => {
    try {
      await api.changePassword(current, next)
      toast('Password changed', { tone: 'success' })
      return null
    } catch (err) {
      return err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.'
    }
  }
  const passwordItem: ActionMenuItem[] = HTTP
    ? [{ key: 'password', label: 'Change password', icon: <KeyRound />, onSelect: () => setChanging(true) }]
    : []
  const leave = () => {
    signOut()
    navigate('/login')
  }
  return (
    <>
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} onChange={changePassword} />
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
              <span className="block max-w-[10rem] truncate text-[0.6875rem] text-muted">
                {ROLE_LABEL[user.role]}
              </span>
            </span>
          </button>
        }
        items={[
          {
            key: 'codes',
            label: (
              <span className="gap-2 flex items-center justify-between">
                Show transaction codes
                {showCodes && <Check className="size-4 text-accent" aria-label="On" />}
              </span>
            ),
            description: 'Beside each page in the menu and the header',
            icon: <Hash />,
            onSelect: () => onShowCodes(!showCodes),
          },
          ...passwordItem,
          {
            key: 'switch',
            label: 'Switch user',
            description: 'Sign in with another account',
            icon: <UserRoundCog />,
            onSelect: leave,
          },
          { key: 'out', label: 'Sign out', icon: <LogOut />, onSelect: leave },
        ]}
      />
    </>
  )
}
