import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { rovingIndex } from '../lib/roving'

export type TabItem = {
  value: string
  label: ReactNode
  count?: number
  icon?: ReactNode
  disabled?: boolean
}

export type TabsProps = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  size?: 'sm' | 'md'
  className?: string
}

type Variant = 'pill' | 'underline' | 'segmented'

const listClasses: Record<Variant, string> = {
  pill: 'no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-card',
  // An inset shadow draws the baseline so the active underline is not clipped by the scroll box.
  underline: 'no-scrollbar flex w-full overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)]',
  segmented: 'flex w-full gap-1 rounded-full bg-card p-1 shadow-card',
}

const tabSizes: Record<Variant, Record<'sm' | 'md', string>> = {
  pill: { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm' },
  underline: { sm: 'px-2.5 py-2 text-xs', md: 'px-3 py-2.5 text-sm' },
  segmented: { sm: 'h-8 px-2 text-xs', md: 'h-10 px-2 text-xs' },
}

// Active styling keys off data-state (and data-urgent for the segmented variant).
const tabClasses: Record<Variant, string> = {
  pill: 'rounded-full text-muted data-[state=inactive]:hover:text-foreground data-[state=active]:bg-ink data-[state=active]:text-on-ink',
  underline:
    'border-b-2 border-transparent text-muted focus-visible:ring-inset data-[state=inactive]:hover:text-foreground data-[state=active]:border-accent data-[state=active]:text-foreground',
  segmented:
    'min-w-0 flex-1 shrink rounded-full text-muted data-[state=inactive]:hover:text-foreground data-[state=active]:bg-ink data-[state=active]:text-on-ink data-[urgent=true]:data-[state=active]:bg-accent data-[urgent=true]:data-[state=active]:text-white',
}

const countClasses: Record<Variant, string> = {
  pill: 'bg-surface text-body group-data-[state=active]:bg-white/20 group-data-[state=active]:text-current',
  underline: 'bg-surface text-muted',
  segmented:
    'bg-surface text-body group-data-[state=active]:bg-white/20 group-data-[state=active]:text-current',
}

function TabList({
  variant,
  items,
  value,
  onValueChange,
  size = 'md',
  className,
  urgentValue,
}: TabsProps & { variant: Variant; urgentValue?: string }) {
  const selectedIndex = items.findIndex((item) => item.value === value)
  const focusIndex = selectedIndex >= 0 ? selectedIndex : items.findIndex((item) => !item.disabled)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = rovingIndex(event.key, selectedIndex, items.length, (i) => !items[i]?.disabled)
    const item = next === null ? undefined : items[next]
    if (next === null || !item) return
    event.preventDefault()
    onValueChange(item.value)
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className={cn('min-w-0 relative', variant === 'pill' ? 'w-fit max-w-full' : 'w-full', className)}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={cn(listClasses[variant], variant !== 'segmented' && 'pr-6')}
      >
        {items.map((item, index) => {
          const selected = index === selectedIndex
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={index === focusIndex ? 0 : -1}
              disabled={item.disabled}
              data-state={selected ? 'active' : 'inactive'}
              data-urgent={item.value === urgentValue || undefined}
              onClick={() => onValueChange(item.value)}
              className={cn(
                'group gap-1.5 font-semibold [&_svg]:size-4 inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
                tabSizes[variant][size],
                tabClasses[variant],
              )}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={cn(
                    'px-1.5 font-bold leading-4 rounded-full py-px text-[10px] tabular-nums',
                    countClasses[variant],
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {variant !== 'segmented' && (
        <span
          aria-hidden="true"
          className="inset-y-0 right-0 w-7 pointer-events-none absolute bg-linear-to-l from-card to-transparent"
        />
      )}
    </div>
  )
}

/** View switcher: white pill track, active tab in ink. */
export function PillTabs(props: TabsProps) {
  return <TabList variant="pill" {...props} />
}

/** Tabs inside cards: accent underline on the active tab. */
export function UnderlineTabs(props: TabsProps) {
  return <TabList variant="underline" {...props} />
}

/** Equal-width mobile list tabs. The tab matching `urgentValue` turns accent when active. */
export function SegmentedTabs({ urgentValue, ...props }: TabsProps & { urgentValue?: string }) {
  return <TabList variant="segmented" urgentValue={urgentValue} {...props} />
}
