import type { ReactNode } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '../lib/cn'
import { Button } from './button'
import { Chip, ChipRow } from './chip'
import { EmptyState } from './empty-state'
import { Input } from './input'
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'

export type TableFiltersProps = {
  query: string
  onQueryChange: (query: string) => void
  /** Names the searched fields, e.g. "Order, customer or note". */
  searchPlaceholder: string
  /** Accessible name of the search box, e.g. "Search stock moves". */
  searchLabel: string
  /** Rows left after every filter, and rows before any. */
  shown: number
  total: number
  /** Active filters, the search included; the caption and the Clear button appear above 0. */
  activeCount: number
  onClear: () => void
  /** Chips stay in view at every width. */
  chips?: ReactNode
  /** Pickers sit inline from `md` and move into a bottom sheet below it. */
  pickers?: ReactNode
  /** Active pickers, shown on the phone's "Filters" button. */
  activePickers?: number
  className?: string
}

/** The filter bar of a table inside a card: search, chips, pickers, a "12 of 52" caption and Clear. */
export function TableFilters({
  query,
  onQueryChange,
  searchPlaceholder,
  searchLabel,
  shown,
  total,
  activeCount,
  onClear,
  chips,
  pickers,
  activePickers = 0,
  className,
}: TableFiltersProps) {
  return (
    <div className={cn('space-y-2 px-5 pb-3', className)}>
      <div className="gap-2 flex flex-wrap items-center">
        <Input
          type="search"
          variant="soft"
          className="sm:w-56 w-full"
          inputClassName="h-10 rounded-full"
          leftIcon={<Search />}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {pickers && (
          <>
            <div className="md:contents hidden">{pickers}</div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="md:hidden">
                  <SlidersHorizontal />
                  Filters{activePickers ? ` · ${activePickers}` : ''}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" aria-describedby={undefined}>
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <SheetBody className="gap-3 flex flex-col">{pickers}</SheetBody>
                <SheetFooter>
                  <Button variant="outline" onClick={onClear}>
                    Clear
                  </Button>
                  <SheetClose asChild>
                    <Button>Show {shown} results</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </>
        )}
        {activeCount > 0 && (
          <div className="gap-1 text-xs flex items-center text-muted">
            <span className="tabular-nums">
              {shown} of {total}
            </span>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear {activeCount === 1 ? 'filter' : `${activeCount} filters`}
            </Button>
          </div>
        )}
      </div>
      {chips && <ChipRow className="max-w-full">{chips}</ChipRow>}
      <p className="sr-only" aria-live="polite">
        {activeCount > 0 ? `${shown} results` : ''}
      </p>
    </div>
  )
}

export type FilterChipsProps<V extends string> = {
  options: ReadonlyArray<{ value: V; label: string }>
  value: V | null
  onChange: (value: V | null) => void
  /** Rows per option with every other filter applied. */
  counts: Partial<Record<V, number>>
  /** Rows for "All", with every other filter applied. */
  total: number
  variant?: 'default' | 'filter'
}

/** "All" plus one chip per option with its count; a second click on the active chip clears it. */
export function FilterChips<V extends string>({
  options,
  value,
  onChange,
  counts,
  total,
  variant,
}: FilterChipsProps<V>) {
  return (
    <>
      <Chip variant={variant} active={value === null} count={total} onClick={() => onChange(null)}>
        All
      </Chip>
      {options.map((option) => (
        <Chip
          key={option.value}
          variant={variant}
          active={value === option.value}
          count={counts[option.value] ?? 0}
          onClick={() => onChange(value === option.value ? null : option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </>
  )
}

/** The empty state of a filtered table: says nothing matches and offers Clear filters. */
export function NoMatch({
  title,
  description,
  onClear,
}: {
  title: string
  description?: string
  onClear: () => void
}) {
  return (
    <EmptyState
      compact
      title={title}
      description={description ?? 'Clear the search and filters to see every row.'}
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  )
}
