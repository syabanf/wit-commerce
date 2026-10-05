import { fmtDateTime, fmtIdr } from '@rc/fixtures'
import { CHANNEL_LABEL, COURIER_LABEL, PAYMENT_STATUS_LABEL } from '@rc/types'
import { CircleCheck } from 'lucide-react'
import { useParams } from 'react-router'
import { SummaryRows } from '../components/cartParts'
import { NotFound } from '../components/NotFound'
import { ProductImage } from '../components/product'
import { ButtonLink, Pill } from '../components/ui'
import { firstName, paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'

/** Order confirmation: code, items, totals, payment state and points. */
export function OrderPage() {
  const { orderId = '' } = useParams()
  const { orders, catalog, customers, store, tenant } = useShop()
  const order = orders.find((o) => o.id === orderId)
  useTitle(order ? `Order ${order.code} · ${tenant.name}` : tenant.name)
  if (!order)
    return (
      <NotFound
        title="We could not find that order"
        text="Orders show here on the device you placed them from."
      />
    )
  const customer = customers.find((c) => c.id === order.customerId)
  const seller = order.sellerId ? catalog.sellers.find((s) => s.id === order.sellerId) : undefined
  const payment = catalog.paymentTypes.find((t) => t.id === order.paymentTypeId)
  const paid = order.paymentStatus === 'paid'
  return (
    <div className="max-w-3xl space-y-6 md:pt-12 mx-auto">
      <section className="sf-card p-6 md:p-10 text-center">
        <span className="size-14 mx-auto flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]">
          <CircleCheck className="size-7" aria-hidden="true" />
        </span>
        <h1 className="sf-display mt-4 text-3xl font-bold">
          Thank you{customer ? `, ${firstName(customer.name)}` : ''}. Your order is in.
        </h1>
        <p className="mt-2 text-[color:var(--sf-muted)]">
          Order <strong className="font-mono text-[color:var(--sf-text)]">{order.code}</strong>, placed{' '}
          {fmtDateTime(order.createdAt)}.
        </p>
        <div className="mt-4 gap-2 flex flex-wrap justify-center">
          <Pill tone={paid ? 'primary' : 'accent'}>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</Pill>
          <Pill>{payment?.name ?? order.paymentMethod}</Pill>
          <Pill>{COURIER_LABEL[order.courier]}</Pill>
          <Pill>{CHANNEL_LABEL[order.channel]}</Pill>
        </div>
        <p className="mt-4 text-sm">
          {paid
            ? `You earned ${order.pointsEarned} points.`
            : `Pay the courier ${fmtIdr(order.total)} on delivery. Your ${order.pointsEarned} points arrive once you pay.`}
          {seller && ` ${seller.name} helped with this order.`}
        </p>
      </section>
      <section className="sf-card p-5 md:p-8" aria-labelledby="items-h">
        <h2 id="items-h" className="sf-display mb-4 text-xl font-bold">
          Items
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
                  <p className="font-semibold">{product?.name ?? 'Product'}</p>
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
        <SummaryRows
          className="mt-4"
          subtotal={order.subtotal}
          discounts={
            order.discountLines ??
            (order.discount
              ? [{ promotionId: 'discount', label: order.voucherCode ?? 'Discount', amount: order.discount }]
              : [])
          }
          shipping={order.shipping}
          total={order.total}
        />
        <p className="mt-4 text-sm text-[color:var(--sf-muted)]">Delivering to {order.city}.</p>
      </section>
      <div className="gap-2 flex flex-wrap justify-center">
        <ButtonLink to={paths.home(store)} size="lg">
          Continue shopping
        </ButtonLink>
        <ButtonLink to={paths.account(store)} variant="outline" size="lg">
          See your orders
        </ButtonLink>
      </div>
    </div>
  )
}
