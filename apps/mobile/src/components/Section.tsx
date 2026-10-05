import { cn } from '@rc/ui'
import type { ReactNode } from 'react'

/** A titled block on a phone screen: bold heading, optional count and action, then the content. */
export function Section({
  id,
  title,
  count,
  action,
  className,
  children,
}: {
  id?: string
  title: string
  count?: number
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={cn('scroll-mt-4 space-y-3', className)}>
      <div className="min-h-8 gap-2 flex items-center justify-between">
        <h2 className="gap-2 text-base font-bold flex items-center">
          {title}
          {count !== undefined && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-card text-body tabular-nums shadow-card">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The accent text link a Section header carries, sized for touch. */
export const sectionLinkClass =
  'flex h-11 items-center rounded-full px-1 text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
