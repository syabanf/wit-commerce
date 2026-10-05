import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Slot } from 'radix-ui'
import { cn } from '../lib/cn'
import { CountBadge } from './badge'
import { Tooltip } from './tooltip'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
// Pushes rail tooltips past the rail's edge so the ink bubble sits on the canvas.
const TOOLTIP_OFFSET = 22

export type RailProps = {
  expanded: boolean
  header: ReactNode
  action?: ReactNode
  workspace?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/** Floating dark rail: header, create action, scrolling nav, workspace switcher, footer. */
export function Rail({ expanded, header, action, workspace, footer, children, className }: RailProps) {
  return (
    <aside
      data-expanded={expanded}
      className={cn(
        'py-4 flex h-full flex-col rounded-hero bg-ink text-on-ink shadow-float transition-[width] duration-200',
        expanded ? 'w-60 px-3' : 'w-[4.75rem] items-center',
        className,
      )}
    >
      <div className="flex w-full shrink-0 justify-center">{header}</div>
      {action !== undefined && <div className="mt-4 flex w-full shrink-0 justify-center">{action}</div>}
      {/* mt-3 plus p-1 keeps the 16px gap while leaving room for focus rings inside the scroll box. */}
      <nav
        aria-label="Main"
        className={cn(
          'mt-3 min-h-0 gap-1 p-1 no-scrollbar flex w-full flex-1 flex-col overflow-y-auto',
          !expanded && 'items-center',
        )}
      >
        {children}
      </nav>
      {workspace !== undefined && <div className="mt-3 flex w-full shrink-0 justify-center">{workspace}</div>}
      {footer !== undefined && (
        <div className={cn('mt-3 gap-1 flex w-full shrink-0 flex-col', !expanded && 'items-center')}>
          {footer}
        </div>
      )}
    </aside>
  )
}

export type RailItemProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon?: ReactNode
  label: ReactNode
  active?: boolean
  expanded: boolean
  badge?: number
  sub?: boolean
  trailing?: ReactNode
  asChild?: boolean
  children?: ReactNode
}

/**
 * Nav entry. With `asChild`, pass one element (a router link) as the child: it receives the
 * classes and props, and its content is replaced by icon, label and badge.
 *
 *   <RailItem asChild icon={<Wrench />} label="Assets" expanded={expanded} active={isActive}>
 *     <NavLink to="/assets" />
 *   </RailItem>
 */
export function RailItem({
  icon,
  label,
  active = false,
  expanded,
  badge = 0,
  sub = false,
  trailing,
  asChild = false,
  children,
  className,
  ...props
}: RailItemProps) {
  const classes = cn(
    'relative flex shrink-0 items-center rounded-2xl text-on-ink-muted transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-5 [&_svg]:shrink-0',
    focusRing,
    'data-[active=true]:bg-accent data-[active=true]:text-white data-[active=true]:shadow-glow',
    !expanded
      ? 'size-11 justify-center'
      : sub
        ? 'h-9 w-full gap-3 pl-11 pr-3 text-[0.8125rem] font-medium'
        : 'h-11 w-full gap-3 px-3 text-sm font-medium',
    className,
  )

  const content = expanded ? (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {trailing}
      <CountBadge count={badge} tone="white" className="ring-0" />
      {!asChild && children}
    </>
  ) : (
    <>
      {icon}
      <span className="sr-only">{label}</span>
      <CountBadge count={badge} tone="white" className="-right-1 -top-1 absolute" />
    </>
  )

  const shared = {
    'data-active': active,
    'aria-current': active ? ('page' as const) : undefined,
    className: classes,
  }

  const element =
    asChild && isValidElement(children) ? (
      <Slot.Root {...shared} {...props}>
        {cloneElement(children, undefined, content)}
      </Slot.Root>
    ) : (
      <button type="button" {...shared} {...props}>
        {content}
      </button>
    )

  return (
    <Tooltip content={label} side="right" sideOffset={TOOLTIP_OFFSET} disabled={expanded}>
      {element}
    </Tooltip>
  )
}

export type RailActionProps = ComponentProps<'button'> & { label: string; expanded: boolean }

/** Round accent create button. Forwards ref and props, so it works as a menu trigger (`asChild`). */
export function RailAction({ label, expanded, className, children, ...props }: RailActionProps) {
  return (
    <Tooltip content={label} side="right" sideOffset={TOOLTIP_OFFSET} disabled={expanded}>
      <button
        type="button"
        aria-label={expanded ? undefined : label}
        className={cn(
          'text-white [&_svg]:size-5 inline-flex shrink-0 items-center justify-center bg-accent shadow-glow transition-colors hover:bg-accent-strong active:scale-[0.98] [&_svg]:shrink-0',
          focusRing,
          expanded
            ? 'h-11 gap-2 px-4 text-sm font-semibold w-full rounded-full'
            : 'size-11 rounded-full hover:-translate-y-px hover:scale-105',
          className,
        )}
        {...props}
      >
        {children}
        {expanded && <span className="truncate">{label}</span>}
      </button>
    </Tooltip>
  )
}

export type RailWorkspaceProps = ComponentProps<'button'> & {
  icon: ReactNode
  kicker: ReactNode
  name: ReactNode
  expanded: boolean
}

/** Tenant switcher card. Forwards ref and props for use as a DropdownMenuTrigger child. */
export function RailWorkspace({ icon, kicker, name, expanded, className, ...props }: RailWorkspaceProps) {
  if (!expanded) {
    return (
      <Tooltip content={name} side="right" sideOffset={TOOLTIP_OFFSET}>
        <button
          type="button"
          className={cn(
            'size-11 rounded-2xl [&_svg]:size-5 flex shrink-0 items-center justify-center bg-card text-ink transition-colors hover:bg-surface active:scale-[0.98]',
            focusRing,
            className,
          )}
          {...props}
        >
          {icon}
          <span className="sr-only">
            {kicker} {name}
          </span>
        </button>
      </Tooltip>
    )
  }
  return (
    <button
      type="button"
      className={cn(
        'gap-3 rounded-2xl border-white/10 p-2.5 flex w-full items-center border bg-ink-2 text-left transition-colors hover:bg-ink-3 active:scale-[0.98]',
        focusRing,
        className,
      )}
      {...props}
    >
      <span className="size-9 rounded-xl flex shrink-0 items-center justify-center bg-card text-ink [&_svg]:size-[1.125rem]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold block truncate text-[0.6562rem] text-on-ink-muted">{kicker}</span>
        <span className="font-bold text-white block truncate text-[0.7812rem]">{name}</span>
      </span>
      <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-on-ink-muted" />
    </button>
  )
}

export type RailCollapseProps = { expanded: boolean; onToggle: () => void; className?: string }

export function RailCollapse({ expanded, onToggle, className }: RailCollapseProps) {
  if (expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={true}
        className={cn(
          'h-10 gap-2 rounded-2xl border-white/10 text-xs font-semibold hover:bg-white/10 hover:text-white [&_svg]:size-4 flex w-full items-center justify-center border text-on-ink-muted transition-colors',
          focusRing,
          className,
        )}
      >
        <PanelLeftClose aria-hidden="true" />
        Collapse menu
      </button>
    )
  }
  return (
    <Tooltip content="Expand menu" side="right" sideOffset={TOOLTIP_OFFSET}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand menu"
        aria-expanded={false}
        className={cn(
          'size-11 rounded-2xl hover:bg-white/10 hover:text-white [&_svg]:size-5 flex items-center justify-center text-on-ink-muted transition-colors',
          focusRing,
          className,
        )}
      >
        <PanelLeftOpen aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
