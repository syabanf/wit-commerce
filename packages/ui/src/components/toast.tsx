import { useSyncExternalStore } from 'react'
import { CircleAlert, Check, X } from 'lucide-react'
import { cn } from '../lib/cn'

type ToastTone = 'default' | 'success' | 'danger'

export type ToastOptions = {
  tone?: ToastTone
  description?: string
  action?: { label: string; onClick: () => void }
}

type ToastEntry = ToastOptions & { id: number; message: string }

const DURATION = 3500
const MAX_VISIBLE = 3

let entries: ToastEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function dismiss(id: number) {
  const next = entries.filter((entry) => entry.id !== id)
  if (next.length === entries.length) return
  entries = next
  emit()
}

/** Shows a short ink notification. Mount `<Toaster />` once for it to render. */
export function toast(message: string, opts: ToastOptions = {}): void {
  const id = nextId++
  entries = [...entries, { ...opts, id, message }].slice(-MAX_VISIBLE)
  emit()
  setTimeout(() => dismiss(id), DURATION)
}

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => entries)

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="inset-x-0 bottom-24 gap-2 px-4 md:inset-x-auto md:bottom-4 md:right-4 md:items-end md:px-0 pointer-events-none fixed z-[60] flex flex-col items-center"
    >
      {items.map((entry) => (
        <div
          key={entry.id}
          className="max-w-sm gap-3 rounded-2xl px-4 py-3 text-sm pointer-events-auto flex w-full animate-in items-start bg-ink text-on-ink shadow-float fade-in-0 slide-in-from-bottom-2"
        >
          {entry.tone === 'success' || entry.tone === 'danger' ? (
            <span
              className={cn(
                'size-5 text-white [&_svg]:size-3 mt-px flex shrink-0 items-center justify-center rounded-full',
                entry.tone === 'success' ? 'bg-success' : 'bg-accent',
              )}
            >
              {entry.tone === 'success' ? (
                <Check aria-hidden="true" strokeWidth={3} />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{entry.message}</p>
            {entry.description !== undefined && (
              <p className="mt-0.5 text-xs text-on-ink-muted">{entry.description}</p>
            )}
          </div>
          {entry.action && (
            <button
              type="button"
              onClick={() => {
                entry.action?.onClick()
                dismiss(entry.id)
              }}
              className="bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
            >
              {entry.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(entry.id)}
            className="-mr-1 size-6 hover:bg-white/10 hover:text-white [&_svg]:size-3.5 flex shrink-0 items-center justify-center rounded-full text-on-ink-muted transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
