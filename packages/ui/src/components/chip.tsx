import type { ComponentProps, ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../lib/cn'

const chipVariants = cva(
  'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-border bg-card px-3.5 text-xs text-body data-[active=false]:hover:bg-surface data-[active=true]:border-accent-strong data-[active=true]:bg-accent-strong data-[active=true]:text-white',
        filter:
          'bg-card px-4 text-sm text-body shadow-card data-[active=false]:hover:bg-surface data-[active=true]:bg-ink data-[active=true]:text-on-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type ChipProps = ComponentProps<'button'> & {
  active?: boolean
  icon?: ReactNode
  count?: number
  variant?: 'default' | 'filter'
}

export function Chip({ active = false, icon, count, variant, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      className={cn(chipVariants({ variant }), className)}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'px-1.5 font-bold leading-4 rounded-full py-px text-[10px] tabular-nums',
            active ? 'bg-white/20' : 'bg-surface text-body',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/** Horizontally scrolling chip row. No negative margins, so it is safe inside the admin scroll box. */
export function ChipRow({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('gap-2 pb-1 no-scrollbar flex overflow-x-auto', className)} {...props} />
}
