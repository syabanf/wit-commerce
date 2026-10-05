import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '../lib/cn'

export type EmptyStateProps = {
  /** Defaults to an inbox icon; pass `null` for none. */
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const tile = icon === undefined ? <Inbox /> : icon
  return (
    <div
      className={cn(
        'gap-2 flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-8' : 'px-6 py-12',
        className,
      )}
    >
      {tile !== null && (
        <div className="mb-1 size-12 [&_svg]:size-6 flex items-center justify-center rounded-full bg-surface text-muted">
          {tile}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description !== undefined && <p className="max-w-xs text-sm text-muted">{description}</p>}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  )
}
