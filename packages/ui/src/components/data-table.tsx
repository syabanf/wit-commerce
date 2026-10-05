import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/cn'
import { sameKey } from '../lib/same-key'
import { Button } from './button'
import { EmptyState } from './empty-state'

export type Column<T> = {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null
  align?: 'left' | 'right' | 'center'
  className?: string
  headerClassName?: string
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  width?: string
}

/** Sort and page, for callers that restore a table after it remounts. */
export type DataTableState = { sort: { id: string; desc: boolean } | null; page: number }

export type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  /** Rows per page; 0 turns pagination off. */
  pageSize?: number
  empty?: ReactNode
  initialSort?: { id: string; desc?: boolean }
  rowClassName?: (row: T) => string | undefined
  /** Change it (a filter or search term) to jump back to page 1. */
  resetPageKey?: unknown
  /** Sort and page to start from, such as the ones saved when the user opened a row. Read on mount only. */
  initialState?: DataTableState
  /** Reports every sort and page change, including the jump to page 1 when `resetPageKey` changes. */
  onStateChange?: (state: DataTableState) => void
  className?: string
}

const hideClasses = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const

const alignClasses = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"]'

/** Nulls sort last in both directions; strings compare naturally ("A2" before "A10"). */
function compareValues(a: string | number | null, b: string | number | null, desc: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  const result =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  return desc ? -result : result
}

/** True when the click came from a control inside the row, or from a portal (menus, dialogs) rendered by it. */
function fromNestedControl(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as Element
  if (!event.currentTarget.contains(target)) return true
  const control = target.closest(INTERACTIVE)
  return control !== null && control !== event.currentTarget && event.currentTarget.contains(control)
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  pageSize = 12,
  empty,
  initialSort,
  rowClassName,
  resetPageKey,
  initialState,
  onStateChange,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(() =>
    initialState
      ? initialState.sort
      : initialSort
        ? { id: initialSort.id, desc: initialSort.desc ?? false }
        : null,
  )
  const [pageState, setPageState] = useState({
    page: initialState?.page ?? 0,
    key: resetPageKey,
    count: rows.length,
  })

  let page = pageState.page
  if (!sameKey(pageState.key, resetPageKey) || pageState.count !== rows.length) {
    page = 0
    setPageState({ page: 0, key: resetPageKey, count: rows.length })
  }

  const sorted = useMemo(() => {
    const getValue = sort ? columns.find((column) => column.id === sort.id)?.sortValue : undefined
    if (!sort || !getValue) return rows
    return [...rows].sort((a, b) => compareValues(getValue(a), getValue(b), sort.desc))
  }, [rows, columns, sort])

  const paged = pageSize > 0
  const pageCount = paged ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const safePage = Math.min(page, pageCount - 1)
  const start = paged ? safePage * pageSize : 0
  const visible = paged ? sorted.slice(start, start + pageSize) : sorted

  const setPage = (next: number) => setPageState((s) => ({ ...s, page: next }))

  const report = useEffectEvent((state: DataTableState) => onStateChange?.(state))
  useEffect(() => {
    report({ sort, page: safePage })
  }, [sort, safePage])

  function toggleSort(id: string) {
    setSort((current) => (current?.id === id ? { id, desc: !current.desc } : { id, desc: false }))
    setPage(0)
  }

  return (
    <div className={className}>
      {/* relative: absolutely positioned cell content (sr-only text, switch thumbs) stays inside the scroll box. */}
      <div className="relative overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => {
                const align = column.align ?? 'left'
                const active = sort?.id === column.id
                const SortIcon = active ? (sort.desc ? ChevronDown : ChevronUp) : ChevronsUpDown
                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={
                      column.sortValue
                        ? active
                          ? sort.desc
                            ? 'descending'
                            : 'ascending'
                          : 'none'
                        : undefined
                    }
                    className={cn(
                      'h-10 px-4 text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase',
                      alignClasses[align],
                      column.hideBelow && hideClasses[column.hideBelow],
                      column.headerClassName,
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          '-mx-1.5 gap-1 px-1.5 py-1 tracking-wide inline-flex items-center rounded-full uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                          active && 'text-foreground',
                        )}
                      >
                        {column.header}
                        <SortIcon
                          aria-hidden="true"
                          className={cn('size-3.5 shrink-0', !active && 'opacity-40')}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {empty ?? (
                    <EmptyState compact title="Nothing to show" description="No records match this view." />
                  )}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={getRowKey(row)}
                  data-clickable={onRowClick ? 'true' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={
                    onRowClick
                      ? (event: MouseEvent<HTMLTableRowElement>) => {
                          if (!fromNestedControl(event)) onRowClick(row)
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (event: KeyboardEvent<HTMLTableRowElement>) => {
                          if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick(row)
                        }
                      : undefined
                  }
                  className={cn(
                    'border-b border-border transition-colors last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none data-[clickable=true]:cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        'px-4 py-3 align-middle',
                        alignClasses[column.align ?? 'left'],
                        column.hideBelow && hideClasses[column.hideBelow],
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paged && sorted.length > 0 && (
        <div className="px-4 py-3 text-sm flex items-center justify-between border-t border-border text-muted">
          <span className="tabular-nums">
            {start + 1}-{start + visible.length} of {sorted.length}
          </span>
          <div className="gap-2 flex items-center">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
