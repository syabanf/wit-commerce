import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Link } from 'react-router'
import { HeartButton, ProductImage, automaticDiscountFor, discountFor } from '../../components/product'
import { type HeadingProps, PRODUCT_GRID, productRail, productRailItem } from '../../components/sections'
import { Pill } from '../../components/ui'
import { categoryName, fromPrice } from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'

/**
 * Theme 2 card: an editorial 4:5 photo, then the category, name and
 * price in primary, the price pinned to the bottom so a row's prices line up. No border or box, so photography carries the grid.
 */
export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const { catalog, store } = useShop()
  const to = paths.product(store, product.id)
  const pct = discountFor(catalog, product)
  const cartDiscountPct = automaticDiscountFor(catalog, product)
  return (
    <article className={cn('group min-w-0 relative flex flex-col', className)}>
      <div className="relative overflow-hidden rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
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
          className="top-2 right-2 md:size-10 backdrop-blur absolute bg-[var(--sf-bg)]/90 shadow-card"
        />
      </div>
      <div className="mt-3 min-w-0 gap-0.5 flex flex-1 flex-col">
        <p className="text-xs truncate text-[color:var(--sf-muted)]">
          {categoryName(catalog, product.categoryId)}
        </p>
        <h3 className="sf-display leading-snug font-semibold md:text-base line-clamp-2 text-[15px] text-pretty">
          <Link to={to} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <p className="sf-price pt-2 font-bold md:text-base mt-auto text-[15px] text-[color:var(--sf-primary)]">
          {product.assisted ? 'Talk to sales' : fmtIdr(fromPrice(product))}
        </p>
        {cartDiscountPct && (
          <p className="text-xs font-semibold text-[color:var(--sf-primary)]">
            {cartDiscountPct}% off applied in cart
          </p>
        )}
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
    <ul className={cn(rail ? productRail(products.length) : PRODUCT_GRID, className)}>
      {products.map((p, i) => (
        <li key={p.id} className={cn('min-w-0 flex', rail && productRailItem(i, products.length))}>
          <ProductCard product={p} className="w-full" />
        </li>
      ))}
    </ul>
  )
}

/** A bold title whose second half is muted from md up ("Browse products by categories"), and an outline "Explore all" pill. */
export function ShowHeading({ title, id, action }: HeadingProps) {
  const words = title.split(/\s+/)
  const cut = Math.ceil(words.length / 2)
  const [first, second] = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
  return (
    <div className="mb-5 gap-3 flex flex-wrap items-center justify-between">
      <h2 id={id} className="sf-title m-0">
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
