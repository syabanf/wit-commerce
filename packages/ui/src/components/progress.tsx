import { cn } from '../lib/cn'

const fills = {
  ink: 'bg-ink',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  white: 'bg-white',
} as const

const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const

export type ProgressBarProps = {
  /** Fraction from 0 to 1. */
  value: number
  tone?: keyof typeof fills
  size?: keyof typeof heights
  className?: string
  'aria-label'?: string
}

export function ProgressBar({
  value,
  tone = 'ink',
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: ProgressBarProps) {
  const percent = Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn(
        'w-full overflow-hidden rounded-full',
        tone === 'white' ? 'bg-white/25' : 'bg-surface',
        heights[size],
        className,
      )}
    >
      <div className={cn('h-full rounded-full', fills[tone])} style={{ width: `${percent}%` }} />
    </div>
  )
}

export type SegmentBarProps = {
  segments: { key: string; value: number; className: string; label: string }[]
  size?: 'sm' | 'md'
  className?: string
}

/** Stacked horizontal bar with a 2px gap between segments. Zero-value segments are skipped. */
export function SegmentBar({ segments, size = 'md', className }: SegmentBarProps) {
  const visible = segments.filter((segment) => segment.value > 0)
  return (
    <div
      role="img"
      aria-label={visible.map((segment) => `${segment.label}: ${segment.value}`).join(', ') || 'No data'}
      className={cn(
        'gap-0.5 flex w-full overflow-hidden rounded-full',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
        visible.length === 0 && 'bg-surface',
        className,
      )}
    >
      {visible.map((segment) => (
        <div
          key={segment.key}
          title={`${segment.label}: ${segment.value}`}
          className={cn('min-w-1 h-full', segment.className)}
          style={{ flexGrow: segment.value, flexBasis: 0 }}
        />
      ))}
    </div>
  )
}
