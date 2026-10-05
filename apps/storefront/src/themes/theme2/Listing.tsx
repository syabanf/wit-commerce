import { plural } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { Search } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { Link } from 'react-router'
import { FilterControls, FilterSheetButton, SortSelect } from '../../components/filters'
import { useSearchSubmit } from '../../components/shell'
import { Button, inputClass } from '../../components/ui'
import type { ListingViewProps } from '../types'
import { ProductGrid, StaggeredGrid } from './ProductCard'

function SearchForm({ query }: { query: string }) {
  const [q, setQ] = useState(query)
  const submit = useSearchSubmit()
  const id = useId()
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(q)
  }
  return (
    <form role="search" onSubmit={onSubmit} className="mb-6 gap-2 flex">
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products"
        className={cn(inputClass, 'rounded-[var(--sf-pill)]')}
      />
      <Button type="submit" variant="dark" aria-label="Search">
        <Search aria-hidden="true" />
        <span className="md:inline hidden">Search</span>
      </Button>
    </form>
  )
}

/** Theme 2 listing: serif title with a count, a staggered two-column grid on phones, a filter sidebar on desktop. */
export function Listing({ title, description, crumbs, chips, listing, query, empty }: ListingViewProps) {
  const hasFilters = listing.facets.length > 0
  return (
    <div>
      {query !== undefined && <SearchForm query={query} />}
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1 md:block hidden">
          <ol className="gap-2 text-sm flex flex-wrap text-[color:var(--sf-muted)]">
            {crumbs.map((c) => (
              <li key={c.to} className="after:ml-2 after:content-['/'] last:after:content-none">
                <Link to={c.to} className="min-h-11 inline-flex items-center hover:underline">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h1 className="sf-display pb-3 md:border-0 text-4xl leading-tight md:text-5xl md:font-extrabold border-b border-[color:var(--sf-line)] break-words">
        {title}
      </h1>
      {description && <p className="mt-2 max-w-2xl text-[color:var(--sf-muted)]">{description}</p>}
      {chips.length > 1 && (
        <nav
          aria-label="Narrow down"
          className="mt-4 gap-5 md:flex-wrap md:gap-2 no-scrollbar flex overflow-x-auto whitespace-nowrap"
        >
          {chips.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              aria-current={c.active ? 'page' : undefined}
              className={cn(
                'min-h-11 text-sm md:rounded-[var(--sf-pill)] md:border md:px-4 inline-flex shrink-0 items-center',
                c.active
                  ? 'font-bold md:border-2 md:border-[color:var(--sf-accent)] border-b-2 border-[color:var(--sf-text)]'
                  : 'md:border-[color:var(--sf-line)] md:text-[color:var(--sf-text)] text-[color:var(--sf-muted)]',
              )}
            >
              {c.label}
              {c.count !== undefined && <sup className="ml-0.5 text-[10px]">{c.count}</sup>}
            </Link>
          ))}
        </nav>
      )}
      <div className={cn('mt-6 gap-8 grid grid-cols-1', hasFilters && 'lg:grid-cols-[240px_minmax(0,1fr)]')}>
        {hasFilters && (
          <aside
            aria-label="Filters"
            className="p-5 lg:block hidden self-start rounded-[var(--sf-card-radius)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)]"
          >
            <h2 className="sf-display mb-4 text-lg font-bold">Filter</h2>
            <FilterControls listing={listing} />
          </aside>
        )}
        <div className="min-w-0">
          <div className="mb-4 gap-2 flex items-center justify-between">
            <FilterSheetButton listing={listing} className="lg:hidden" label="Filter" />
            <p
              className={cn('text-sm text-[color:var(--sf-muted)]', hasFilters && 'lg:block hidden')}
              aria-live="polite"
            >
              {plural(listing.results.length, 'item')} found
            </p>
            <SortSelect listing={listing} className="ml-auto" />
          </div>
          {listing.results.length ? (
            <>
              <div className="md:hidden">
                <StaggeredGrid products={listing.results} />
              </div>
              <ProductGrid
                products={listing.results}
                className={cn('md:grid hidden', hasFilters && 'lg:grid-cols-3')}
              />
            </>
          ) : (
            empty
          )}
        </div>
      </div>
    </div>
  )
}
