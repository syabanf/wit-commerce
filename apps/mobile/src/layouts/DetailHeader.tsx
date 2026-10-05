import { cn } from '@rc/ui'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

/** True when the router has an earlier entry from this app session to go back to. */
const cameFromInsideApp = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0

/**
 * Detail screen header: a round back button, the title and a muted context line. Back goes back
 * in history when the user came from inside the app, otherwise to the parent tab (a shared link, a reload).
 */
export function DetailHeader({
  title,
  subtitle,
  fallback,
  mono = false,
}: {
  title: string
  subtitle?: ReactNode
  fallback: string
  mono?: boolean
}) {
  const navigate = useNavigate()
  return (
    <header className="gap-3 pt-3 flex items-center">
      <button
        type="button"
        aria-label="Back"
        onClick={() => (cameFromInsideApp() ? navigate(-1) : navigate(fallback, { replace: true }))}
        className="size-11 flex shrink-0 items-center justify-center rounded-full bg-card shadow-card transition-transform focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-95"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className={cn('text-lg font-bold leading-tight truncate', mono && 'text-base font-mono')}>
          {title}
        </h1>
        {subtitle !== undefined && <p className="text-xs truncate text-muted">{subtitle}</p>}
      </div>
    </header>
  )
}
