import { plural } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { FilterControls, FilterSheetButton, SortSelect } from '../../components/filters'
import { Scroller } from '../../components/ui'
import type { ListingViewProps } from '../types'
import { ProductGrid } from './ProductCard'

export function Crumbs({ crumbs }: { crumbs: ListingViewProps['crumbs'] }) {
  if (!crumbs.length) return null
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="gap-1 text-sm flex flex-wrap items-center text-[color:var(--sf-muted)]">
        {crumbs.map((c, i) => (
          <li key={c.to} className="gap-1 flex items-center">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            <Link to={c.to} className="min-h-11 inline-flex items-center hover:underline">
              {c.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Theme 1 listing: chips with a dark active pill, a filter sidebar on desktop and a filter sheet on phones. */
export function Listing({ title, description, crumbs, chips, listing, empty }: ListingViewProps) {
  const hasFilters = listing.facets.length > 0
  return (
    <div>
      <Crumbs crumbs={crumbs} />
      <h1 className="sf-display text-3xl font-bold md:text-4xl">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-[color:var(--sf-muted)]">{description}</p>}
      {chips.length > 1 && (
        <Scroller className="mt-4" label="Narrow down">
          {chips.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              aria-current={c.active ? 'page' : undefined}
              className={cn(
                'min-h-11 gap-1.5 px-5 text-sm font-semibold inline-flex shrink-0 items-center rounded-full',
                c.active ? 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]' : 'bg-[var(--sf-bg)] shadow-card',
              )}
            >
              {c.label}
              {c.count !== undefined && <span className="text-xs opacity-70">{c.count}</span>}
            </Link>
          ))}
        </Scroller>
      )}
      <div className={cn('mt-4 gap-6 grid grid-cols-1', hasFilters && 'lg:grid-cols-[250px_minmax(0,1fr)]')}>
        {hasFilters && (
          <aside aria-label="Filters" className="sf-card p-5 lg:block hidden self-start">
            <h2 className="sf-display mb-4 text-lg font-bold">Filters</h2>
            <FilterControls listing={listing} />
          </aside>
        )}
        <div className="min-w-0">
          <div className="mb-4 gap-2 flex items-center justify-between">
            <FilterSheetButton listing={listing} className="lg:hidden" />
            <p
              className={cn('text-sm text-[color:var(--sf-muted)]', hasFilters && 'lg:block hidden')}
              aria-live="polite"
            >
              {plural(listing.results.length, 'product')}
            </p>
            <SortSelect listing={listing} className="ml-auto" />
          </div>
          {listing.results.length ? (
            <ProductGrid products={listing.results} className={hasFilters ? 'lg:grid-cols-3' : undefined} />
          ) : (
            empty
          )}
        </div>
      </div>
    </div>
  )
}
