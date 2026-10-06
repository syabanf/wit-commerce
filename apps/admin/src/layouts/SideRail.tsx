import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Rail,
  RailAction,
  RailCollapse,
  RailItem,
  RailWorkspace,
  cn,
} from '@rc/ui'
import { Building2, Check, ChevronDown, LogOut, Plus } from 'lucide-react'
import { Fragment } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { CreateMenu } from './CreateMenu'
import { LogoMark } from './LogoMark'
import { NAV, leafFor, sectionFor } from './nav'
import { useNavCounts } from './useNavCounts'

export function SideRail({
  expanded,
  canExpand,
  onToggle,
}: {
  expanded: boolean
  canExpand: boolean
  onToggle: () => void
}) {
  const { pathname } = useLocation()
  const counts = useNavCounts()
  const current = sectionFor(pathname)
  const leaf = leafFor(pathname)

  return (
    <Rail
      expanded={expanded}
      header={
        <Link
          to="/"
          className={cn('gap-3 rounded-2xl flex items-center', expanded && 'px-1 w-full')}
          aria-label="Home"
        >
          <span className="size-11 rounded-2xl bg-white/5 flex shrink-0 items-center justify-center">
            <LogoMark className="size-7" />
          </span>
          {expanded && (
            <span className="min-w-0">
              <span className="font-bold leading-tight tracking-tight block text-[0.9375rem]">
                Commerce OS
              </span>
              <span className="block text-[0.6875rem] text-on-ink-muted">Brand · Commerce · CRM</span>
            </span>
          )}
        </Link>
      }
      action={
        <CreateMenu
          side="right"
          align="start"
          trigger={
            <RailAction label="Create" expanded={expanded}>
              <Plus />
            </RailAction>
          }
        />
      }
      workspace={<WorkspaceMenu expanded={expanded} />}
      footer={canExpand ? <RailCollapse expanded={expanded} onToggle={onToggle} /> : undefined}
    >
      {NAV.map((section, index) => {
        const Icon = section.icon
        const firstInGroup = NAV[index - 1]?.group !== section.group
        const isCurrent = section.id === current.id
        const open = expanded && isCurrent && !!section.items
        const badge = section.badge
          ? counts[section.badge]
          : (section.items?.reduce((sum, item) => sum + (item.badge ? counts[item.badge] : 0), 0) ?? 0)
        return (
          <Fragment key={section.id}>
            {firstInGroup &&
              (expanded ? (
                <p className="px-3 pb-1 pt-3 font-semibold tracking-wider text-[0.6562rem] text-on-ink-muted uppercase">
                  {section.group}
                </p>
              ) : (
                <span aria-hidden className="my-1.5 w-6 bg-white/10 mx-auto h-px shrink-0" />
              ))}
            <RailItem
              asChild
              expanded={expanded}
              active={isCurrent && !open}
              icon={<Icon />}
              label={section.label}
              badge={open ? 0 : badge}
              className={open ? 'text-white' : undefined}
              trailing={
                expanded && section.items ? (
                  <ChevronDown className={cn('!size-4 transition-transform', open && 'rotate-180')} />
                ) : undefined
              }
            >
              <NavLink to={section.to} end={section.to === '/'} />
            </RailItem>
            {open &&
              section.items!.map((item) => (
                <RailItem
                  key={item.to}
                  asChild
                  sub
                  expanded
                  active={leaf?.to === item.to}
                  label={item.label}
                  badge={item.badge ? counts[item.badge] : 0}
                >
                  <NavLink to={item.to} />
                </RailItem>
              ))}
          </Fragment>
        )
      })}
    </Rail>
  )
}

function WorkspaceMenu({ expanded }: { expanded: boolean }) {
  const { tenant, tenants, switchTenant, signOut } = useAuth()
  const navigate = useNavigate()
  if (!tenant) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RailWorkspace
          icon={<Building2 />}
          kicker="Brand"
          name={tenant.name}
          expanded={expanded}
          aria-label={`Brand: ${tenant.name}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={expanded ? 'top' : 'right'}
        align={expanded ? 'start' : 'end'}
        className="w-64"
      >
        <DropdownMenuLabel>Switch brand</DropdownMenuLabel>
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => switchTenant(t.id)}>
            <Building2 />
            <span className="flex-1">
              {t.name}
              <span className="text-xs block text-muted">{t.domain ?? `${t.subdomain}.commerceos.id`}</span>
            </span>
            {t.id === tenant.id && <Check className="text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut()
            navigate('/login')
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
