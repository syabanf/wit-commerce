import { cn } from '@rc/ui'
import type { ReactNode } from 'react'

/**
 * Actions pinned above the home indicator on detail screens. The note explains a blocker
 * (accent) or adds context (muted). Pair it with `pb-36` on the page.
 */
export function StickyBar({
  note,
  blocked = false,
  children,
}: {
  note?: ReactNode
  blocked?: boolean
  children: ReactNode
}) {
  return (
    <div className="inset-x-0 bottom-0 max-w-md fixed z-30 mx-auto w-full">
      <div
        aria-hidden="true"
        className="h-6 pointer-events-none bg-linear-to-t from-surface to-transparent"
      />
      <div className="px-5 pt-1 bg-surface pb-[max(env(safe-area-inset-bottom),1rem)]">
        {note && (
          <p
            role="status"
            className={cn('mb-2 text-xs font-medium text-center', blocked ? 'text-accent' : 'text-muted')}
          >
            {note}
          </p>
        )}
        <div className="gap-2 flex">{children}</div>
      </div>
    </div>
  )
}
