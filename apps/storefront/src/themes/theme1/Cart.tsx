import { fmtIdr } from '@rc/fixtures'
import { ShoppingBag, Trash } from 'lucide-react'
import { Link } from 'react-router'
import { PaymentHints, SummaryRows, VoucherForm } from '../../components/cartParts'
import { FreeShippingProgress } from '../../components/FreeShipping'
import { ProductImage } from '../../components/product'
import { ButtonLink, EmptyState, IconButton, QtyStepper } from '../../components/ui'
import type { CartView } from '../../features/cartView'
import { variantAvailable } from '../../lib/catalog'
import { MAX_QTY } from '../../lib/cart'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'
import { ProductsBlock } from './blocks'

export function Cart({ view }: { view: CartView }) {
  const { store, catalog } = useShop()
  if (!view.items.length)
    return (
      <div className="space-y-8 md:pt-12">
        <h1 className="sf-display text-3xl font-bold">Your cart</h1>
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" />}
          title="Your cart is empty"
          text="Add something you like and it waits here, even if you close the tab."
          action={<ButtonLink to={paths.home(store)}>Start shopping</ButtonLink>}
        />
        <ProductsBlock id="cross-h" title="You may also like" products={view.crossSell} />
      </div>
    )
  return (
    <div className="space-y-8 md:pt-12">
      <h1 className="sf-display text-3xl font-bold">
        Your cart{' '}
        <span className="text-lg font-semibold text-[color:var(--sf-muted)]">({view.totals.count})</span>
      </h1>
      <div className="gap-6 lg:grid-cols-[minmax(0,1fr)_380px] grid grid-cols-1">
        <div className="space-y-3">
          <div className="sf-card p-5">
            <FreeShippingProgress />
          </div>
          <ul className="space-y-3">
            {view.items.map((item) => {
              const left = variantAvailable(catalog, item.product, item.variant.id)
              return (
                <li key={item.line.key} className="sf-card gap-4 p-3 md:p-4 flex">
                  <Link
                    to={paths.product(store, item.product.id)}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <ProductImage
                      product={item.product}
                      size="sm"
                      className="size-20 md:size-28 rounded-[var(--sf-tile-radius)]"
                    />
                  </Link>
                  <div className="min-w-0 gap-2 flex flex-1 flex-col">
                    <div className="gap-2 flex items-start justify-between">
                      <div className="min-w-0">
                        <Link
                          to={paths.product(store, item.product.id)}
                          className="font-bold hover:underline"
                        >
                          {item.product.name}
                        </Link>
                        {item.variant.name !== 'Standard' && (
                          <p className="text-sm text-[color:var(--sf-muted)]">{item.variant.name}</p>
                        )}
                        {item.modifiers.map((m) => (
                          <p key={m.optionId} className="text-xs text-[color:var(--sf-muted)]">
                            {m.groupName}: {m.name}
                            {m.priceDelta ? ` (+${fmtIdr(m.priceDelta)})` : ''}
                          </p>
                        ))}
                      </div>
                      <IconButton label={`Remove ${item.product.name}`} onClick={() => view.remove(item)}>
                        <Trash aria-hidden="true" />
                      </IconButton>
                    </div>
                    <div className="gap-2 mt-auto flex flex-wrap items-start justify-between">
                      <QtyStepper
                        value={item.line.qty}
                        onChange={(q) => view.setQty(item.line.key, q)}
                        max={left === null ? MAX_QTY : Math.max(1, left)}
                        label={`Quantity of ${item.product.name}`}
                      />
                      <p className="ml-auto text-right">
                        <span className="leading-6 md:leading-11 font-bold block">{fmtIdr(item.total)}</span>
                        {item.line.qty > 1 && (
                          <span className="text-xs block text-[color:var(--sf-muted)]">
                            {fmtIdr(item.unit)} each
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <aside
          aria-label="Order summary"
          className="sf-card space-y-5 p-5 md:p-6 lg:sticky lg:top-[var(--sf-sticky-top)] self-start"
        >
          <h2 className="sf-display text-xl font-bold">Summary</h2>
          <VoucherForm view={view} />
          <PaymentHints hints={view.paymentHints} />
          <SummaryRows
            subtotal={view.totals.subtotal}
            discounts={view.totals.discounts}
            shipping={view.shipping}
            shippingLabel="Shipping estimate"
            total={view.total}
          />
          <ButtonLink to={paths.checkout(store)} size="lg" full>
            Checkout
          </ButtonLink>
        </aside>
      </div>
      <ProductsBlock id="cross-h" title="You may also like" products={view.crossSell} />
    </div>
  )
}
