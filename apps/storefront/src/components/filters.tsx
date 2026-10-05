import { cn } from '@rc/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import type { ListingState } from '../features/listing'
import { SORT_LABEL, type SortKey, isSortKey } from '../lib/catalog'
import { Drawer } from './Drawer'
import { Button, inputClass } from './ui'

/** Filters built from the category's filterable attributes: checkboxes for choices, a select for "up to". */
export function FilterControls({ listing, className }: { listing: ListingState; className?: string }) {
  const uid = useId()
  if (!listing.facets.length)
    return (
      <p className={cn('text-sm text-[color:var(--sf-muted)]', className)}>No filters for these products.</p>
    )
  return (
    <div className={cn('space-y-6', className)}>
      {listing.facets.map((f) => {
        const picked = listing.selected[f.def.id] ?? []
        if (f.kind === 'max') {
          const id = `${uid}-${f.def.id}`
          return (
            <div key={f.def.id}>
              <label htmlFor={id} className="mb-2 text-sm font-bold block">
                {f.def.name}
              </label>
              <select
                id={id}
                value={picked[0] ?? ''}
                onChange={(e) => listing.setMax(f.def.id, e.target.value || null)}
                className={inputClass}
              >
                <option value="">Any</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            </div>
          )
        }
        return (
          <fieldset key={f.def.id}>
            <legend className="mb-2 text-sm font-bold">{f.def.name}</legend>
            <ul>
              {f.options.map((o) => (
                <li key={o.value}>
                  <label className="min-h-11 gap-3 text-sm flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={picked.includes(o.value)}
                      onChange={() => listing.toggle(f.def.id, o.value)}
                      className="size-4 accent-[var(--sf-primary)]"
                    />
                    <span className="flex-1">{o.label}</span>
                    <span className="text-xs text-[color:var(--sf-muted)]">{o.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}
      {listing.activeCount > 0 && (
        <Button variant="ghost" onClick={listing.clear}>
          Clear all filters
        </Button>
      )}
    </div>
  )
}

export function SortSelect({ listing, className }: { listing: ListingState; className?: string }) {
  const id = useId()
  return (
    <div className={cn('gap-2 flex items-center', className)}>
      <label htmlFor={id} className="text-sm md:not-sr-only sr-only shrink-0 text-[color:var(--sf-muted)]">
        Sort by
      </label>
      <select
        id={id}
        value={listing.sort}
        onChange={(e) => isSortKey(e.target.value) && listing.setSort(e.target.value)}
        className={cn(inputClass, 'h-11 pr-8 font-semibold w-auto rounded-full')}
      >
        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABEL[k]}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Phone filter button that opens the filters in a bottom sheet. */
export function FilterSheetButton({
  listing,
  className,
  label = 'Filters',
}: {
  listing: ListingState
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  if (!listing.facets.length) return null
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className={className} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden="true" />
        {label}
        {listing.activeCount > 0 && ` (${listing.activeCount})`}
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        footer={
          <Button variant="dark" full onClick={() => setOpen(false)}>
            Show {listing.results.length} {listing.results.length === 1 ? 'result' : 'results'}
          </Button>
        }
      >
        <FilterControls listing={listing} />
      </Drawer>
    </>
  )
}
