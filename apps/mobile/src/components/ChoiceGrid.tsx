import { cn } from '@rc/ui'
import type { KeyboardEvent } from 'react'

/** One answer from a short list, as large touch rows. Arrow keys move the choice. */
export function ChoiceGrid({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly string[]
  value: string | null
  onChange: (value: string) => void
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    const index = (Math.max(0, options.indexOf(value ?? '')) + step + options.length) % options.length
    onChange(options[index]!)
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus()
  }
  const focusable = value ?? options[0]
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="gap-2 grid grid-cols-2">
      {options.map((option) => {
        const selected = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={option === focusable ? 0 : -1}
            onClick={() => onChange(option)}
            className={cn(
              'min-h-12 rounded-2xl px-4 py-2 text-sm font-semibold flex items-center text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]',
              selected ? 'bg-ink text-on-ink' : 'bg-surface text-body',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
