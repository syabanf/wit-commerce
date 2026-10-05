import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { Slot } from 'radix-ui'
import { cn } from '../lib/cn'
import { CountBadge } from './badge'

/** Phone navigation: a floating ink bar, hidden from `md` up. */
export function BottomBar({ className, ...props }: ComponentProps<'nav'>) {
  return (
    <nav
      className={cn(
        'inset-x-3 bottom-3 px-3 md:hidden fixed z-40 mb-[env(safe-area-inset-bottom)] flex h-[68px] items-center justify-between rounded-[22px] bg-ink shadow-float',
        className,
      )}
      {...props}
    />
  )
}

export type BottomBarItemProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon: ReactNode
  label: string
  active?: boolean
  badge?: number
  asChild?: boolean
  children?: ReactNode
}

/**
 * Icon-only slot. With `asChild`, pass one link element as the child; its content is replaced
 * by the icon and badge (same pattern as RailItem).
 */
export function BottomBarItem({
  icon,
  label,
  active = false,
  badge = 0,
  asChild = false,
  children,
  className,
  ...props
}: BottomBarItemProps) {
  const shared = {
    'aria-label': badge > 0 ? `${label}, ${badge}` : label,
    'aria-current': active ? ('page' as const) : undefined,
    'data-active': active,
    className: cn(
      'relative flex size-11 shrink-0 items-center justify-center rounded-2xl text-on-ink-muted transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98] [&_svg]:size-5 [&_svg]:shrink-0',
      'data-[active=true]:bg-accent-strong data-[active=true]:text-white data-[active=true]:shadow-glow',
      className,
    ),
  }
  const content = (
    <>
      {icon}
      <CountBadge count={badge} tone="white" className="-right-1 -top-1 absolute" />
    </>
  )

  if (asChild && isValidElement(children)) {
    return (
      <Slot.Root {...shared} {...props}>
        {cloneElement(children, undefined, content)}
      </Slot.Root>
    )
  }
  return (
    <button type="button" {...shared} {...props}>
      {content}
    </button>
  )
}

export type BottomBarActionProps = ComponentProps<'button'> & { label: string }

/** Round accent create button in the middle of the bar. Pass the icon as children. */
export function BottomBarAction({ label, className, children, ...props }: BottomBarActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'size-12 text-white [&_svg]:size-5 flex shrink-0 items-center justify-center rounded-full bg-accent-strong shadow-glow transition-colors hover:bg-accent-dark focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
