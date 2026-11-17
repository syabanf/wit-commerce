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
import { Money } from '../../components/Money'
import { t } from '../../i18n'

export function Cart({ view }: { view: CartView }) {
  const { store, catalog } = useShop()
  if (!view.items.length)
    return (
      <div className="space-y-8 md:pt-12">
        <h1 className="sf-display text-3xl font-bold">{t('checkout.cart.title')}</h1>
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" />}
          title={t('checkout.cart.empty')}
          text={t('checkout.cart.emptyText')}
          action={<ButtonLink to={paths.home(store)}>{t('checkout.cart.startShopping')}</ButtonLink>}
        />
        <ProductsBlock id="cross-h" title={t('checkout.cart.alsoLike')} products={view.crossSell} />
      </div>
    )
  return (
    <div className="space-y-8 md:pt-12">
      <h1 className="sf-display text-3xl font-bold">
        {t('checkout.cart.title')}{' '}
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
                            {!!m.priceDelta && (
                              <>
                                {' ('}
                                <Money idr={m.priceDelta} sign="+" />)
                              </>
                            )}
                          </p>
                        ))}
                      </div>
                      <IconButton label={t('checkout.cart.removeItem', { name: item.product.name })} onClick={() => view.remove(item)}>
                        <Trash aria-hidden="true" />
                      </IconButton>
                    </div>
                    <div className="gap-2 mt-auto flex flex-wrap items-start justify-between">
                      <QtyStepper
                        value={item.line.qty}
                        onChange={(q) => view.setQty(item.line.key, q)}
                        max={left === null ? MAX_QTY : Math.max(1, left)}
                        label={t('checkout.cart.quantityOf', { name: item.product.name })}
                      />
                      <p className="ml-auto text-right">
                        <Money
                          idr={item.total}
                          className="leading-6 md:leading-11 font-bold flex justify-end"
                        />
                        {item.line.qty > 1 && (
                          <span className="text-xs block text-[color:var(--sf-muted)]">
                            <Money idr={item.unit} /> {t('checkout.cart.each')}
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
          aria-label={t('checkout.cart.orderSummary')}
          className="sf-card space-y-5 p-5 md:p-6 lg:sticky lg:top-[var(--sf-sticky-top)] self-start"
        >
          <h2 className="sf-display text-xl font-bold">{t('checkout.cart.summary')}</h2>
          <VoucherForm view={view} />
          <PaymentHints hints={view.paymentHints} />
          <SummaryRows
            subtotal={view.totals.subtotal}
            discounts={view.totals.discounts}
            shipping={view.shipping}
            shippingLabel={t('checkout.summary.shippingEstimate')}
            total={view.total}
          />
          <ButtonLink to={paths.checkout(store)} size="lg" full>
            {t('checkout.cart.checkout')}
          </ButtonLink>
        </aside>
      </div>
      <ProductsBlock id="cross-h" title={t('checkout.cart.alsoLike')} products={view.crossSell} />
    </div>
  )
}
