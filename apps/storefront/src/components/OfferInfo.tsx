import { PAYMENT_WINDOW_HOURS, fmtIdr, returnWindowDays } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { CreditCard, Truck, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { couriersFor } from '../lib/checkout'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'

/**
 * What the offer includes besides the price (PP 80/2019 Pasal 39): how to pay and by when, how it
 * ships and how long that takes, the return policy, and the terms that bind the sale.
 */
export function OfferInfo({ product, className }: { product: Product; className?: string }) {
  const { tenant, catalog, store } = useShop()
  const pays = catalog.paymentTypes.filter((t) => t.enabled)
  const online = pays.some((t) => t.method !== 'cod')
  const days = returnWindowDays(tenant)
  const ships = product.type !== 'digital' && product.type !== 'service'
  return (
    <dl className={cn('space-y-3 pt-4 text-sm border-t border-[color:var(--sf-line)]', className)}>
      <Row icon={<CreditCard />} term="Payment">
        {pays.map((t) => t.name).join(', ')}.
        {online && ` Pay within ${PAYMENT_WINDOW_HOURS} hours of ordering, or the order cancels.`}
      </Row>
      {ships && (
        <Row icon={<Truck />} term="Delivery">
          <ul>
            {couriersFor(tenant).map((c) => (
              <li key={c.id}>
                {c.label} · {c.eta}
                {c.fee ? ` · ${fmtIdr(c.fee)}` : ''}
              </li>
            ))}
          </ul>
          <span className="text-[color:var(--sf-muted)]">
            Days count from when the parcel ships. Free shipping from {fmtIdr(tenant.loyalty.freeShippingMin)}
            .
          </span>
        </Row>
      )}
      <Row icon={<Undo2 />} term="Returns">
        {days > 0
          ? `Ask for a return within ${days} days of delivery from your order page.`
          : 'Ask the store for a return by message.'}{' '}
        You can always return a wrong or damaged item if you ask within 2 working days of delivery.{' '}
        <Link to={paths.terms(store)} className="font-semibold underline underline-offset-4">
          Terms of sale
        </Link>
      </Row>
    </dl>
  )
}

function Row({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="gap-3 [&>svg]:mt-0.5 [&>svg]:size-4 flex items-start [&>svg]:shrink-0">
      {icon}
      <div className="min-w-0">
        <dt className="font-semibold">{term}</dt>
        <dd className="text-[color:var(--sf-muted)]">{children}</dd>
      </div>
    </div>
  )
}
