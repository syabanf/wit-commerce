import { cn } from '@rc/ui'
import type { KeyboardEvent } from 'react'
import { AREA_LABEL, type NavArea } from './nav'

const AREAS: NavArea[] = ['backoffice', 'employee']

/** The pill that switches the menu between the back office and the employee area, on an ink surface. */
export function AreaTabs({
  value,
  onChange,
  className,
}: {
  value: NavArea
  onChange: (area: NavArea) => void
  className?: string
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const next =
      e.key === 'Home' ? AREAS[0]! : e.key === 'End' ? AREAS[1]! : AREAS.find((area) => area !== value)!
    onChange(next)
    e.currentTarget.querySelector<HTMLElement>(`[data-area="${next}"]`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Menu area"
      onKeyDown={onKeyDown}
      className={cn('min-w-0 gap-1 p-1 bg-white/10 flex flex-1 rounded-full', className)}
    >
      {AREAS.map((area) => {
        const selected = area === value
        return (
          <button
            key={area}
            type="button"
            role="tab"
            data-area={area}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(area)}
            className={cn(
              'h-8 min-w-0 px-1.5 text-xs font-semibold flex-auto truncate rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
              selected ? 'bg-card text-ink shadow-card' : 'hover:text-white text-on-ink-muted',
            )}
          >
            {AREA_LABEL[area]}
          </button>
        )
      })}
    </div>
  )
}
