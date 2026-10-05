import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { cva } from 'class-variance-authority'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '../lib/cn'
import { useIsPhone } from '../lib/use-media-query'
import { Button } from './button'
import { useFieldControl } from './form-field'
import { invalidClass } from './input'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet'

type ComboboxBaseProps<T> = {
  items: T[]
  getKey: (item: T) => string
  getLabel: (item: T) => string
  getDescription?: (item: T) => string | undefined
  getKeywords?: (item: T) => string[]
  renderIcon?: (item: T) => ReactNode
  getDisabledReason?: (item: T) => string | null
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  variant?: 'default' | 'soft' | 'inline'
  createLabel?: (query: string) => string
  onCreate?: (query: string) => void
  className?: string
  id?: string
  'aria-label'?: string
}

export type ComboboxProps<T> = ComboboxBaseProps<T> & {
  value: string | null
  onChange: (value: string | null) => void
  clearable?: boolean
}

export type MultiComboboxProps<T> = ComboboxBaseProps<T> & {
  values: string[]
  onChange: (values: string[]) => void
}

type Selection =
  | { multi: false; value: string | null; onChange: (value: string | null) => void; clearable: boolean }
  | { multi: true; values: string[]; onChange: (values: string[]) => void }

type RootProps<T> = ComboboxBaseProps<T> & { selection: Selection }

type Row<T> =
  | { id: string; kind: 'clear' }
  | { id: string; kind: 'create' }
  | { id: string; kind: 'option'; key: string; item: T; reason: string | null }

const COUNTER_THRESHOLD = 20

const triggerVariants = cva(
  'flex min-w-0 items-center gap-2 text-left text-sm text-foreground transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        default:
          'h-11 w-full rounded-2xl border border-border bg-card px-4 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 data-[state=open]:border-accent disabled:bg-surface',
        soft: 'h-11 w-full rounded-2xl bg-surface px-4 focus-visible:ring-2 focus-visible:ring-accent/20',
        inline:
          'h-8 max-w-full rounded-full px-3 font-medium hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:bg-black/5',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

/** Searchable single-select. The panel is a popover from `md` up and a bottom sheet on phones. */
export function Combobox<T>({ value, onChange, clearable = false, ...base }: ComboboxProps<T>) {
  return <ComboboxRoot {...base} selection={{ multi: false, value, onChange, clearable }} />
}

/** Searchable multi-select with checkbox rows; the panel stays open while toggling. */
export function MultiCombobox<T>({ values, onChange, ...base }: MultiComboboxProps<T>) {
  return <ComboboxRoot {...base} selection={{ multi: true, values, onChange }} />
}

function ComboboxRoot<T>(props: RootProps<T>) {
  const {
    items,
    getKey,
    getLabel,
    renderIcon,
    placeholder = 'Select…',
    disabled = false,
    invalid = false,
    variant = 'default',
    className,
    id,
    'aria-label': ariaLabel,
    selection,
  } = props
  const [open, setOpen] = useState(false)
  const isPhone = useIsPhone()
  const listId = useId()
  const field = useFieldControl(id)
  const isInvalid = invalid || field.invalid
  const label = ariaLabel ?? placeholder

  const trigger = (
    <button
      type="button"
      id={field.id}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      // A combobox takes no name from its content. A field label names it through `id`; otherwise the placeholder does.
      aria-label={ariaLabel ?? (id ? undefined : placeholder)}
      aria-describedby={field.describedBy}
      aria-invalid={isInvalid || undefined}
      disabled={disabled}
      className={cn(triggerVariants({ variant }), isInvalid && invalidClass(variant), className)}
    >
      <span className="min-w-0 gap-2 flex flex-1 items-center">
        <TriggerValue
          items={items}
          getKey={getKey}
          getLabel={getLabel}
          renderIcon={renderIcon}
          placeholder={placeholder}
          variant={variant}
          selection={selection}
        />
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 opacity-60" />
    </button>
  )

  const panel = (
    <ComboboxPanel
      {...props}
      label={label}
      listId={listId}
      inSheet={isPhone}
      onClose={() => setOpen(false)}
    />
  )

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          hideClose
          aria-describedby={undefined}
          className="flex max-h-[70dvh] flex-col overflow-hidden pb-[max(env(safe-area-inset-bottom),0.5rem)]"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>
    )
  }

  // Modal so the list scrolls inside a Dialog (the dialog's scroll lock would swallow the wheel otherwise).
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="w-72 rounded-2xl z-50 flex max-w-[calc(100vw-1.5rem)] min-w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden border border-border bg-card text-foreground shadow-float outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {panel}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function TriggerValue<T>({
  items,
  getKey,
  getLabel,
  renderIcon,
  placeholder,
  variant,
  selection,
}: Pick<RootProps<T>, 'items' | 'getKey' | 'getLabel' | 'renderIcon' | 'selection'> & {
  placeholder: string
  variant: 'default' | 'soft' | 'inline'
}) {
  const keys = selection.multi ? selection.values : selection.value === null ? [] : [selection.value]
  const selected = items.filter((item) => keys.includes(getKey(item)))
  const first = selected[0]
  if (first === undefined) return <span className="truncate text-muted">{placeholder}</span>

  if (!selection.multi) {
    return (
      <>
        {renderIcon && <span className="[&_svg]:size-4 flex shrink-0">{renderIcon(first)}</span>}
        <span className="truncate">{getLabel(first)}</span>
      </>
    )
  }

  if (variant === 'inline') {
    return (
      <>
        <span className="truncate">{getLabel(first)}</span>
        {selected.length > 1 && <span className="shrink-0 text-muted">+{selected.length - 1}</span>}
      </>
    )
  }

  const chip = cn(
    'inline-flex h-6 min-w-0 shrink items-center rounded-full px-2 text-xs font-medium',
    variant === 'soft' ? 'bg-card' : 'bg-surface',
  )
  return (
    <span className="min-w-0 gap-1 flex items-center overflow-hidden">
      {selected.slice(0, 3).map((item) => (
        <span key={getKey(item)} className={cn(chip, 'max-w-[10rem]')}>
          <span className="truncate">{getLabel(item)}</span>
        </span>
      ))}
      {selected.length > 3 && <span className={cn(chip, 'shrink-0')}>+{selected.length - 3}</span>}
    </span>
  )
}

function matches(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token))
}

/** Keeps `el` visible inside the scrolling `container` without scrolling the page. */
function scrollIntoContainer(container: HTMLElement, el: HTMLElement) {
  const top = el.offsetTop
  const bottom = top + el.offsetHeight
  if (top < container.scrollTop) container.scrollTop = top - 4
  else if (bottom > container.scrollTop + container.clientHeight)
    container.scrollTop = bottom - container.clientHeight + 4
}

function ComboboxPanel<T>({
  items,
  getKey,
  getLabel,
  getDescription,
  getKeywords,
  renderIcon,
  getDisabledReason,
  searchPlaceholder = 'Search…',
  emptyText = 'No options',
  createLabel,
  onCreate,
  selection,
  label,
  listId,
  inSheet,
  onClose,
}: RootProps<T> & { label: string; listId: string; inSheet: boolean; onClose: () => void }) {
  // The panel unmounts on close, so the query and highlight reset with it.
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(() =>
    !selection.multi && selection.value !== null ? `o:${selection.value}` : null,
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPending = useRef(true)

  const trimmed = query.trim()
  const q = trimmed.toLowerCase()

  const filtered = useMemo(() => {
    const tokens = q.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return items
    return items.filter((item) =>
      matches(
        [getLabel(item), getDescription?.(item) ?? '', ...(getKeywords?.(item) ?? [])]
          .join(' ')
          .toLowerCase(),
        tokens,
      ),
    )
    // Getters are treated as pure functions of the item, so only data and query changes re-filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q])

  const isSelected = (key: string) =>
    selection.multi ? selection.values.includes(key) : selection.value === key

  const rows: Row<T>[] = []
  if (!selection.multi && selection.clearable && selection.value !== null) {
    rows.push({ id: 'clear', kind: 'clear' })
  }
  for (const item of filtered) {
    const key = getKey(item)
    rows.push({ id: `o:${key}`, kind: 'option', key, item, reason: getDisabledReason?.(item) ?? null })
  }
  const createRow: Row<T> | null =
    onCreate !== undefined && q !== '' && !filtered.some((item) => getLabel(item).trim().toLowerCase() === q)
      ? { id: 'create', kind: 'create' }
      : null
  const allRows = createRow ? [...rows, createRow] : rows

  const enabled = allRows.filter((row) => row.kind !== 'option' || row.reason === null)
  const fallback = enabled.find((row) => row.kind === 'option') ?? enabled[0]
  const current = enabled.some((row) => row.id === activeId) ? activeId : (fallback?.id ?? null)
  const activeIndex = allRows.findIndex((row) => row.id === current)
  const domId = (index: number) => `${listId}-${index}`

  useEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    const container = scrollRef.current
    const el = activeIndex >= 0 ? document.getElementById(domId(activeIndex)) : null
    if (container && el && container.contains(el)) scrollIntoContainer(container, el)
  })

  function move(step: 1 | -1) {
    if (enabled.length === 0) return
    const index = enabled.findIndex((row) => row.id === current)
    const next =
      index === -1 ? (step === 1 ? 0 : enabled.length - 1) : (index + step + enabled.length) % enabled.length
    scrollPending.current = true
    setActiveId(enabled[next]?.id ?? null)
  }

  function pick(row: Row<T>) {
    if (row.kind === 'clear') {
      if (!selection.multi) selection.onChange(null)
      onClose()
    } else if (row.kind === 'create') {
      onCreate?.(trimmed)
      onClose()
    } else if (row.reason === null) {
      if (!selection.multi) {
        selection.onChange(row.key)
        onClose()
        return
      }
      const { values, onChange } = selection
      onChange(values.includes(row.key) ? values.filter((v) => v !== row.key) : [...values, row.key])
      setActiveId(row.id)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = allRows[activeIndex]
      if (row) pick(row)
    }
  }

  const rowClass = cn(
    'flex w-full cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors data-[active=true]:bg-surface',
    inSheet && 'min-h-12',
  )

  function renderRow(row: Row<T>, index: number) {
    const active = index === activeIndex
    const common = {
      id: domId(index),
      role: 'option' as const,
      'data-active': active || undefined,
      // Keep focus in the search input while clicking rows.
      onMouseDown: (event: MouseEvent) => event.preventDefault(),
    }

    if (row.kind === 'clear') {
      return (
        <div
          key={row.id}
          {...common}
          aria-selected={false}
          onPointerMove={() => setActiveId(row.id)}
          onClick={() => pick(row)}
          className={cn(rowClass, 'text-muted')}
        >
          <X aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">Clear selection</span>
        </div>
      )
    }

    if (row.kind === 'create') {
      return (
        <div
          key={row.id}
          {...common}
          aria-selected={false}
          onPointerMove={() => setActiveId(row.id)}
          onClick={() => pick(row)}
          className={cn(rowClass, 'font-semibold text-accent')}
        >
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{createLabel ? createLabel(trimmed) : `Create "${trimmed}"`}</span>
        </div>
      )
    }

    const selected = isSelected(row.key)
    const disabled = row.reason !== null
    const description = getDescription?.(row.item)
    const secondary = [description, row.reason].filter(Boolean).join(' · ')
    return (
      <div
        key={row.id}
        {...common}
        aria-selected={selected}
        aria-disabled={disabled || undefined}
        onPointerMove={disabled ? undefined : () => setActiveId(row.id)}
        onClick={() => pick(row)}
        className={cn(rowClass, disabled && 'cursor-not-allowed')}
      >
        {selection.multi && (
          <span
            aria-hidden="true"
            className={cn(
              'size-4 [&_svg]:size-3 flex shrink-0 items-center justify-center rounded-[5px] border',
              selected ? 'text-white border-accent bg-accent' : 'border-border bg-card',
              disabled && 'opacity-50',
            )}
          >
            {selected && <Check strokeWidth={3} />}
          </span>
        )}
        {renderIcon && (
          <span className={cn('[&_svg]:size-4 flex shrink-0', disabled && 'opacity-50')}>
            {renderIcon(row.item)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate', disabled && 'text-muted')}>{getLabel(row.item)}</span>
          {secondary && <span className="text-xs block truncate text-muted">{secondary}</span>}
        </span>
        {!selection.multi && selected && (
          <Check aria-hidden="true" className="size-4 ml-auto shrink-0 text-accent" />
        )}
      </div>
    )
  }

  const selectedCount = selection.multi ? selection.values.length : 0

  return (
    <>
      <div className="h-11 gap-2 px-3 flex shrink-0 items-center border-b border-border">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveId(null)
            scrollPending.current = true
          }}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          aria-label={label}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? domId(activeIndex) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 text-base md:text-sm h-full flex-1 bg-transparent outline-none placeholder:text-muted"
        />
        {items.length > COUNTER_THRESHOLD && (
          <span className="text-xs shrink-0 text-muted tabular-nums">
            {filtered.length} of {items.length}
          </span>
        )}
      </div>

      <div
        role="listbox"
        id={listId}
        aria-label={label}
        aria-multiselectable={selection.multi || undefined}
        className={cn('flex flex-col', inSheet && 'min-h-0 flex-1')}
      >
        <div
          ref={scrollRef}
          className={cn(
            'p-1 relative overflow-y-auto overscroll-contain',
            inSheet ? 'min-h-0 flex-1' : 'max-h-64',
          )}
        >
          {rows.map(renderRow)}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-sm text-center text-muted">
              {q ? `No matches for "${trimmed}"` : emptyText}
            </div>
          )}
        </div>
        {createRow && (
          <div className="p-1 shrink-0 border-t border-border">{renderRow(createRow, rows.length)}</div>
        )}
      </div>

      {selection.multi && (
        <div className="gap-2 px-3 py-2 flex shrink-0 items-center justify-between border-t border-border">
          <span className="text-xs text-muted">{selectedCount} selected</span>
          <div className="gap-1 flex items-center">
            {selectedCount > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => selection.onChange([])}>
                Clear
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
