import { fmtIdr } from '@rc/fixtures'
import { Bot, CircleCheck } from 'lucide-react'
import { useParams } from 'react-router'
import { SummaryRows } from '../components/cartParts'
import { NotFound } from '../components/NotFound'
import { ProductImage } from '../components/product'
import { ButtonLink, Pill, buttonClass } from '../components/ui'
import { t, tx } from '../i18n'
import { fmtDateTime } from '../i18n/format'
import { demoPaymentNote } from '../lib/checkout'
import { firstName, paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'
import { PayInRupiahNote } from '../components/Money'
import { RupiahOnlyArea } from '../state/currency'
import { OrderReturns } from './OrderReturns'
import { ShippingStatus } from '../components/ShippingStatus'
import { agentKindLabel, channelLabel, courierLabel, paymentStatusLabel } from './accountLabels'

/** Order confirmation: code, items, totals, payment state and points. */
export function OrderPage() {
  const { orderId = '' } = useParams()
  const { orders, catalog, customers, store, tenant, paysOnline, payments } = useShop()
  const order = orders.find((o) => o.id === orderId)
  useTitle(order ? `${t('account.order.title', { code: order.code })} · ${tenant.name}` : tenant.name)
  if (!order) return <NotFound title={t('account.order.notFound')} text={t('account.order.notFoundText')} />
  const customer = customers.find((c) => c.id === order.customerId)
  const seller = order.sellerId ? catalog.sellers.find((s) => s.id === order.sellerId) : undefined
  const payment = catalog.paymentTypes.find((t) => t.id === order.paymentTypeId)
  const paid = order.paymentStatus === 'paid'
  const online = paysOnline(order.paymentTypeId)
  // Waiting for an online payment: the store stream turns this page paid when it arrives.
  const awaiting = order.paymentStatus === 'pending' && order.paymentMethod !== 'cod'
  const link = payments[order.id]
  return (
    <div className="max-w-3xl space-y-6 md:pt-12 mx-auto">
      <section className="sf-card p-6 md:p-10 text-center">
        <span className="size-14 mx-auto flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]">
          <CircleCheck className="size-7" aria-hidden="true" />
        </span>
        <h1 className="sf-display mt-4 text-3xl font-bold">
          {customer
            ? t('account.order.thanksName', { name: firstName(customer.name) })
            : t('account.order.thanks')}
        </h1>
        <p className="mt-2 text-[color:var(--sf-muted)]">
          {tx(
            'account.order.placed',
            { code: <strong className="font-mono text-[color:var(--sf-text)]">{order.code}</strong> },
            { date: fmtDateTime(order.createdAt) },
          )}
        </p>
        <PayInRupiahNote className="mt-2" />
        {!online && <p className="mt-2 text-sm font-semibold">{demoPaymentNote()}</p>}
        <div className="mt-4 gap-2 flex flex-wrap justify-center">
          <Pill tone={paid ? 'primary' : 'accent'}>{paymentStatusLabel(order.paymentStatus)}</Pill>
          {order.agent && (
            <Pill tone="dark">
              <Bot className="size-3" aria-hidden="true" />{' '}
              {t('account.order.placedBy', { agent: agentKindLabel(order.agent.kind) })}
            </Pill>
          )}
          <Pill>{payment?.name ?? order.paymentMethod}</Pill>
          <Pill>{courierLabel(order.courier)}</Pill>
          <Pill>{channelLabel(order.channel)}</Pill>
        </div>
        <p className="mt-4 text-sm" role="status">
          {paid
            ? t('account.order.earned', { points: order.pointsEarned })
            : order.paymentStatus === 'failed'
              ? t('account.order.failed')
              : awaiting
                ? t('account.order.awaiting', { amount: fmtIdr(order.total) })
                : t('account.order.cod', { amount: fmtIdr(order.total), points: order.pointsEarned })}
          {seller && ` ${t('account.order.helped', { seller: seller.name })}`}
        </p>
        {awaiting && link && (
          <a href={link.redirectUrl} className={`mt-4 ${buttonClass('primary', 'lg')}`}>
            {t('account.order.payNow', { amount: fmtIdr(order.total) })}
          </a>
        )}
        {awaiting && online && !link && (
          <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
            {t('account.order.noPaymentPage', { store: tenant.name })}
          </p>
        )}
      </section>
      <section className="sf-card p-5 md:p-8" aria-labelledby="items-h">
        <h2 id="items-h" className="sf-display mb-4 text-xl font-bold">
          {t('account.order.items')}
        </h2>
        <ul className="divide-y divide-[color:var(--sf-line)]">
          {order.lines.map((l, i) => {
            const product = catalog.productMap.get(l.productId)
            const variant = product?.variants.find((v) => v.id === l.variantId)
            return (
              <li key={`${l.variantId}-${i}`} className="gap-3 py-3 flex">
                {product && (
                  <ProductImage
                    product={product}
                    size="sm"
                    className="size-14 shrink-0 rounded-[var(--sf-tile-radius)]"
                  />
                )}
                <div className="min-w-0 text-sm flex-1">
                  <p className="font-semibold">{product?.name ?? t('account.order.product')}</p>
                  {variant && variant.name !== 'Standard' && (
                    <p className="text-[color:var(--sf-muted)]">{variant.name}</p>
                  )}
                  {l.modifiers?.map((m) => (
                    <p key={m.optionId} className="text-xs text-[color:var(--sf-muted)]">
                      {m.name}
                      {m.priceDelta ? ` (+${fmtIdr(m.priceDelta)})` : ''}
                    </p>
                  ))}
                  <p className="text-xs text-[color:var(--sf-muted)]">
                    {l.qty} × {fmtIdr(l.price)}
                  </p>
                </div>
                <p className="text-sm font-semibold shrink-0">{fmtIdr(l.qty * l.price)}</p>
              </li>
            )
          })}
        </ul>
        <RupiahOnlyArea>
          <SummaryRows
            className="mt-4"
            subtotal={order.subtotal}
            discounts={
              order.discountLines ??
              (order.discount
                ? [
                    {
                      promotionId: 'discount',
                      label: order.voucherCode ?? t('account.order.discount'),
                      amount: order.discount,
                    },
                  ]
                : [])
            }
            shipping={order.shipping}
            total={order.total}
          />
        </RupiahOnlyArea>
        <p className="mt-4 text-sm text-[color:var(--sf-muted)]">
          {t('account.order.deliveringTo', { city: order.city })}
        </p>
      </section>
      <ShippingStatus order={order} />
      <OrderReturns order={order} />
      <div className="gap-2 flex flex-wrap justify-center">
        <ButtonLink to={paths.home(store)} size="lg">
          {t('account.order.continue')}
        </ButtonLink>
        <ButtonLink to={paths.account(store)} variant="outline" size="lg">
          {t('account.order.seeOrders')}
        </ButtonLink>
        <ButtonLink to={`${paths.help(store)}?order=${order.id}`} variant="outline" size="lg">
          {t('account.order.help')}
        </ButtonLink>
      </div>
    </div>
  )
}
