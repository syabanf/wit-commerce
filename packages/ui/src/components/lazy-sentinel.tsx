import { cn } from '../lib/cn'

export type LazySentinelProps = {
  remaining: number
  onLoad: () => void
  sentinelRef: (el: Element | null) => void
  className?: string
}

/** The "N more · Load" row under a lazy list. Pair it with `useLazyList`. */
export function LazySentinel({ remaining, onLoad, sentinelRef, className }: LazySentinelProps) {
  if (remaining <= 0) return null
  return (
    <div
      ref={sentinelRef}
      className={cn('gap-2 py-4 text-xs flex items-center justify-center text-muted', className)}
    >
      <span className="tabular-nums">{remaining} more</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onLoad}
        className="px-1 font-semibold rounded-full text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
      >
        Load
      </button>
    </div>
  )
}
