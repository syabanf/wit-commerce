import type { ComponentProps } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../lib/cn'
import type { Tone } from './icon-tile'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-surface text-body',
        accent: 'bg-accent-strong text-white',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-accent-strong',
        info: 'bg-info-soft text-info',
        muted: 'bg-surface text-muted',
        outline: 'border border-border text-foreground',
        ink: 'bg-ink text-on-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type BadgeProps = ComponentProps<'span'> & {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'outline' | 'ink'
  dot?: boolean
}

export function Badge({ variant, dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export type CountBadgeProps = { count: number; tone?: 'accent' | 'white'; className?: string }

/** Unread counter for nav items and tabs. Renders nothing at 0 and caps at 99+. */
export function CountBadge({ count, tone = 'accent', className }: CountBadgeProps) {
  if (!(count > 0)) return null
  return (
    <span
      className={cn(
        'px-1 font-bold inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] leading-none tabular-nums ring-2',
        tone === 'accent' ? 'text-white bg-accent-strong ring-card' : 'bg-white text-ink ring-ink',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

const dotTones: Record<Tone, string> = {
  default: 'bg-silver',
  danger: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  ink: 'bg-ink',
  accent: 'bg-accent',
}

export type StatusDotProps = { tone: Tone; pulse?: boolean; className?: string }

export function StatusDot({ tone, pulse = false, className }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 inline-block shrink-0 rounded-full',
        dotTones[tone],
        pulse && 'animate-pulse',
        className,
      )}
    />
  )
}
