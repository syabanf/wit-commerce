import { fmtIdr } from '@rc/fixtures'
import { ShoppingBag } from 'lucide-react'
import { Link } from 'react-router'
import { PaymentHints, SummaryRows, VoucherForm } from '../../components/cartParts'
import { FreeShippingProgress } from '../../components/FreeShipping'
import { ProductImage } from '../../components/product'
import { Button, ButtonLink, EmptyState, QtyStepper } from '../../components/ui'
import type { CartView } from '../../features/cartView'
import { MAX_QTY } from '../../lib/cart'
import { variantAvailable } from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'
import { ProductGrid, ShowHeading } from './ProductCard'

/** Theme 2 cart: serif title, hairline rows, a quantity stepper, Edit and Remove as text buttons. */
export function Cart({ view }: { view: CartView }) {
  const { store, catalog } = useShop()
  const crossSell = view.crossSell.length > 0 && (
    <section aria-labelledby="cross-h">
      <ShowHeading id="cross-h" title="You may also like" />
      <ProductGrid products={view.crossSell} rail />
    </section>
  )
  if (!view.items.length)
    return (
      <div className="space-y-10 md:pt-12">
        <h1 className="sf-display text-4xl">Cart</h1>
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" />}
          title="Your cart is empty"
          text="Add something you like and it waits here, even if you close the tab."
          action={
            <ButtonLink to={paths.home(store)} variant="dark">
              Start shopping
            </ButtonLink>
          }
        />
        {crossSell}
      </div>
    )
  return (
    <div className="space-y-12 md:pt-12">
      <div className="gap-8 lg:grid-cols-[minmax(0,1fr)_380px] grid grid-cols-1">
        <div className="min-w-0">
          <h1 className="sf-display pb-4 text-4xl md:text-5xl md:font-extrabold border-b border-[color:var(--sf-line)]">
            Cart <span className="text-lg text-[color:var(--sf-muted)]">({view.totals.count})</span>
          </h1>
          <ul className="divide-y divide-[color:var(--sf-line)] border-b border-[color:var(--sf-line)]">
            {view.items.map((item) => {
              const left = variantAvailable(catalog, item.product, item.variant.id)
              const max = left === null ? MAX_QTY : Math.max(1, left)
              const optionText = Object.entries(item.variant.optionValues ?? {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')
              return (
                <li key={item.line.key} className="gap-4 py-5 flex">
                  <Link
                    to={paths.product(store, item.product.id)}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="shrink-0 self-start"
                  >
                    <ProductImage
                      product={item.product}
                      size="sm"
                      className="size-20 md:size-24 rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)]"
                    />
                  </Link>
                  <div className="min-w-0 gap-1 flex flex-1 flex-col">
                    <div className="gap-3 flex items-start justify-between">
                      <p className="sf-display min-w-0 text-lg leading-snug">{item.product.name}</p>
                      <p className="font-semibold shrink-0">{fmtIdr(item.total)}</p>
                    </div>
                    {optionText && <p className="text-sm text-[color:var(--sf-muted)]">{optionText}</p>}
                    {item.modifiers.map((m) => (
                      <p key={m.optionId} className="text-xs text-[color:var(--sf-muted)]">
                        {m.groupName}: {m.name}
                        {m.priceDelta ? ` (+${fmtIdr(m.priceDelta)})` : ''}
                      </p>
                    ))}
                    <div className="gap-4 pt-2 mt-auto flex flex-wrap items-center">
                      <QtyStepper
                        value={item.line.qty}
                        onChange={(q) => view.setQty(item.line.key, q)}
                        max={max}
                        label={`Quantity of ${item.product.name}`}
                      />
                      <Link
                        to={paths.product(store, item.product.id)}
                        className="min-h-11 text-sm inline-flex items-center underline underline-offset-4"
                      >
                        Edit<span className="sr-only"> {item.product.name}</span>
                      </Link>
                      <Button variant="ghost" onClick={() => view.remove(item)}>
                        Remove<span className="sr-only"> {item.product.name}</span>
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <aside
          aria-label="Order summary"
          className="space-y-6 lg:sticky lg:top-[var(--sf-sticky-top)] lg:rounded-[var(--sf-card-radius)] lg:border lg:border-[color:var(--sf-line)] lg:bg-[var(--sf-bg)] lg:p-6 self-start"
        >
          <FreeShippingProgress />
          <VoucherForm view={view} />
          <PaymentHints hints={view.paymentHints} />
          <SummaryRows
            subtotal={view.totals.subtotal}
            discounts={view.totals.discounts}
            shipping={view.shipping}
            shippingLabel="Shipping estimate"
            total={view.total}
          />
          <ButtonLink to={paths.checkout(store)} variant="dark" size="lg" full>
            Checkout
          </ButtonLink>
        </aside>
      </div>
      {crossSell}
    </div>
  )
}
