import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

const columns = ['grid-cols-2', 'grid-cols-2', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'] as const

export type SplitStatsProps = { items: { label: ReactNode; value: ReactNode }[]; className?: string }

/** Card footer of 2 to 4 equal cells. Place it last inside a `p-5` CardContent so it sits flush with the edge. */
export function SplitStats({ items, className }: SplitStatsProps) {
  return (
    <div
      className={cn(
        '-mx-5 -mb-5 mt-auto grid divide-x divide-border border-t border-border',
        columns[Math.min(items.length, 4)],
        className,
      )}
    >
      {items.map((item, index) => (
        <div key={index} className="min-w-0 px-2 py-3 text-center">
          <span className="font-medium block truncate text-[0.6562rem] text-muted">{item.label}</span>
          <span className="font-extrabold block truncate text-[0.9375rem] tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  )
}
