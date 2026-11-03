import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { IconTile, type Tone } from './icon-tile'
import { CountUp } from './motion'

export type StatCardProps = {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: Tone
  onClick?: () => void
  className?: string
  children?: ReactNode
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'default',
  onClick,
  className,
  children,
}: StatCardProps) {
  const body = (
    <>
      <div className="gap-3 flex w-full items-start">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[0.8125rem] text-body/80">{label}</div>
          <div className="mt-1.5 gap-1 flex items-start">
            <span className="font-extrabold truncate text-[1.75rem] leading-[1.15] tracking-[-0.5px]">
              {typeof value === 'number' && Number.isInteger(value) ? <CountUp value={value} /> : value}
            </span>
            {unit !== undefined && (
              <span className="pt-1.5 text-sm font-semibold shrink-0 text-muted">{unit}</span>
            )}
          </div>
          {hint !== undefined && <div className="mt-1 text-xs text-muted">{hint}</div>}
        </div>
        {icon !== undefined && <IconTile tone={tone}>{icon}</IconTile>}
      </div>
      {children !== undefined && <div className="mt-4 w-full">{children}</div>}
    </>
  )

  const classes = cn('flex flex-col rounded-card bg-card p-5 text-left shadow-card', className)

  if (!onClick)
    return (
      <div data-motion="rise" className={classes}>
        {body}
      </div>
    )
  return (
    <button
      type="button"
      data-motion="rise"
      onClick={onClick}
      className={cn(
        // A fine pointer lifts the tile 4px; touch keeps the press scale only.
        '[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 w-full transition-[color,background-color,translate,scale] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]',
        classes,
      )}
    >
      {body}
    </button>
  )
}
