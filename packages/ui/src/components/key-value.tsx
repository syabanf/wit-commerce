import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

const labelWidths = {
  sm: 'grid-cols-[96px_minmax(0,1fr)]',
  md: 'grid-cols-[120px_minmax(0,1fr)]',
  lg: 'grid-cols-[150px_minmax(0,1fr)]',
} as const

export type KeyValueItem = { label: ReactNode; value: ReactNode; hidden?: boolean }

export type KeyValueProps = {
  items: KeyValueItem[]
  labelWidth?: keyof typeof labelWidths
  /** Render only the list, for use inside a CardContent. */
  bare?: boolean
  className?: string
}

export function KeyValue({ items, labelWidth = 'sm', bare = false, className }: KeyValueProps) {
  return (
    <dl
      className={cn(
        'divide-y divide-border',
        !bare && 'px-5 py-1 rounded-card bg-card shadow-card',
        className,
      )}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item, index) => (
          <div key={index} className={cn('gap-3 py-3 text-sm grid', labelWidths[labelWidth])}>
            <dt className="text-muted">{item.label}</dt>
            <dd className="min-w-0 break-words">{item.value}</dd>
          </div>
        ))}
    </dl>
  )
}
