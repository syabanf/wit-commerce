import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Link } from 'react-router'
import { HeartButton, ProductImage, discountFor } from '../../components/product'
import { type HeadingProps, PRODUCT_GRID, PRODUCT_RAIL, productRailItem } from '../../components/sections'
import { Pill } from '../../components/ui'
import { categoryName, fromPrice } from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'

/**
 * Theme 2 card: an editorial 4:5 photo (arched on the phone staggered grid), then the name, category and
 * price in primary. No border or box, so photography carries the grid.
 */
export function ProductCard({
  product,
  arch = false,
  className,
}: {
  product: Product
  arch?: boolean
  className?: string
}) {
  const { catalog, store } = useShop()
  const to = paths.product(store, product.id)
  const pct = discountFor(catalog, product)
  return (
    <article className={cn('group min-w-0 relative flex flex-col', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]',
          arch && 'md:rounded-t-[var(--sf-tile-radius)] rounded-t-full',
        )}
      >
        <Link to={to} tabIndex={-1} aria-hidden="true" className="block">
          <ProductImage
            product={product}
            strength={12}
            className="aspect-[4/5] transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </Link>
        {pct && (
          <Pill tone="dark" className="top-3 left-3 absolute">
            -{pct}%
          </Pill>
        )}
        <HeartButton
          product={product}
          tone="bare"
          className="top-2 right-2 md:size-10 absolute bg-[var(--sf-bg)]/90 shadow-card backdrop-blur"
        />
      </div>
      <div className="mt-3 min-w-0 gap-0.5 flex flex-1 flex-col">
        <h3 className="sf-display text-[15px] leading-snug font-semibold md:text-base line-clamp-2">
          <Link to={to} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <p className="text-xs truncate text-[color:var(--sf-muted)]">{categoryName(catalog, product.categoryId)}</p>
        <p className="sf-price pt-1 mt-auto text-[15px] font-bold md:text-base text-[color:var(--sf-primary)]">
          {product.assisted ? 'Talk to sales' : fmtIdr(fromPrice(product))}
        </p>
      </div>
    </article>
  )
}

/** Listing grid, or with `rail` a row that scrolls below lg and shows one row of listing-size cards above. */
export function ProductGrid({
  products,
  className,
  rail = false,
}: {
  products: Product[]
  className?: string
  rail?: boolean
}) {
  return (
    <ul className={cn(rail ? PRODUCT_RAIL : PRODUCT_GRID, className)}>
      {products.map((p, i) => (
        <li key={p.id} className={cn('min-w-0 flex', rail && productRailItem(i))}>
          <ProductCard product={p} className="w-full" />
        </li>
      ))}
    </ul>
  )
}

/** Phone grid where the right column starts lower and every third image has an arched top. */
export function StaggeredGrid({ products }: { products: Product[] }) {
  const columns = [products.filter((_, i) => i % 2 === 0), products.filter((_, i) => i % 2 === 1)]
  return (
    <div className="gap-3 grid grid-cols-2">
      {columns.map((col, c) => (
        <ul key={c} className={cn('min-w-0 gap-6 flex flex-col', c === 1 && 'pt-12')}>
          {col.map((p, i) => (
            <li key={p.id}>
              <ProductCard product={p} arch={(i + c) % 3 === 0} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

/** A bold title whose second half is muted from md up ("Browse products by categories"), and an outline "Explore all" pill. */
export function ShowHeading({ title, id, action }: HeadingProps) {
  const words = title.split(/\s+/)
  const cut = Math.ceil(words.length / 2)
  const [first, second] = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
  return (
    <div className="mb-5 gap-3 flex flex-wrap items-end justify-between">
      <h2 id={id} className="sf-title">
        {first}
        {second && (
          <>
            {' '}
            <span className="md:text-[color:var(--sf-muted)]">{second}</span>
          </>
        )}
      </h2>
      {action && (
        <Link
          to={action.to}
          className="min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-[var(--sf-pill)] border border-[color:var(--sf-text)] hover:bg-[var(--sf-text)] hover:text-[color:var(--sf-bg)]"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
