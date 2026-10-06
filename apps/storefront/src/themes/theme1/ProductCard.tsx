import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Plus, Star } from 'lucide-react'
import { Link } from 'react-router'
import {
  HeartButton,
  PriceTag,
  ProductImage,
  automaticDiscountFor,
  discountFor,
  useQuickAdd,
} from '../../components/product'
import { PRODUCT_GRID, productRail, productRailItem } from '../../components/sections'
import { Pill } from '../../components/ui'
import { categoryName, fromPrice, quickAddable } from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'

/**
 * Theme 1 product card: a 4:5 photo with the discount, a heart and a round quick-add button over it,
 * then category, name, rating and price. No card box, so a grid reads as a row of products.
 */
export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const { catalog, store } = useShop()
  const quickAdd = useQuickAdd()
  const pct = discountFor(catalog, product)
  const cartDiscountPct = automaticDiscountFor(catalog, product)
  const to = paths.product(store, product.id)
  const direct = quickAddable(catalog, product)
  const addLabel = product.assisted
    ? `Talk to sales about ${product.name}`
    : direct
      ? `Add ${product.name} to cart`
      : `Choose options for ${product.name}`
  return (
    <article className={cn('group min-w-0 relative flex flex-col', className)}>
      <div className="relative overflow-hidden rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
        <Link to={to} tabIndex={-1} aria-hidden="true" className="block">
          <ProductImage
            product={product}
            strength={10}
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
        <button
          type="button"
          onClick={() => quickAdd(product)}
          aria-label={addLabel}
          className="right-2 bottom-2 size-11 md:size-10 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 focus-visible:translate-y-0 absolute inline-flex items-center justify-center rounded-full bg-[var(--sf-text)] text-[color:var(--sf-bg)] shadow-float transition focus-visible:opacity-100"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-w-0 gap-1 pt-3 flex flex-1 flex-col">
        <p className="text-xs truncate text-[color:var(--sf-muted)]">
          {categoryName(catalog, product.categoryId)}
        </p>
        <h3 className="text-sm leading-snug font-semibold md:text-[15px] line-clamp-2 text-pretty">
          <Link to={to} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <div className="gap-2 pt-1 mt-auto flex items-end justify-between">
          <PriceTag
            product={product}
            price={product.assisted ? undefined : fromPrice(product)}
            className="min-w-0 min-h-[2.6rem] flex-col-reverse items-start justify-start"
            priceClassName="text-[15px] md:text-base"
          />
          {product.reviewCount > 0 && (
            <span
              className="gap-1 pb-0.5 text-xs inline-flex shrink-0 items-center text-[color:var(--sf-muted)]"
              aria-label={`Rated ${product.rating.toFixed(1)} of 5`}
            >
              <Star className="size-3.5 fill-current text-[color:var(--sf-accent)]" aria-hidden="true" />
              <span aria-hidden="true">{product.rating.toFixed(1)}</span>
            </span>
          )}
        </div>
        {cartDiscountPct && (
          <p className="text-xs font-semibold text-[color:var(--sf-primary)]">
            {cartDiscountPct}% off applied in cart
          </p>
        )}
      </div>
    </article>
  )
}

/** Product grid for listings; as a `rail` (home and recommendation rows) it scrolls below lg and shows one row above. */
export function ProductGrid({
  products,
  className,
  rail,
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

export function CompactCell({ product }: { product: Product }) {
  const { store } = useShop()
  return (
    <Link
      to={paths.product(store, product.id)}
      className="min-h-24 min-w-0 gap-3 p-3 flex items-center rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)] hover:border-[color:var(--sf-text)]"
    >
      <span className="min-w-0 flex-1">
        <span className="text-sm leading-snug font-semibold line-clamp-2 text-pretty">{product.name}</span>
        <span className="mt-1 text-xs block text-[color:var(--sf-muted)]">
          {product.assisted ? 'Price on request' : `From ${fmtIdr(fromPrice(product))}`}
        </span>
      </span>
      <ProductImage
        product={product}
        size="sm"
        strength={10}
        className="size-16 shrink-0 rounded-[var(--sf-tile-radius)]"
      />
    </Link>
  )
}
