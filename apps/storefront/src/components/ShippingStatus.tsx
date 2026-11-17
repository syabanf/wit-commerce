import { arrivalWindow, courierEta, etaLabel, fmtDate, fmtDateTime } from '@rc/fixtures'
import type { Order } from '@rc/types'
import { COURIER_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useShop } from '../state/shop'
import { IconButton } from './ui'

/**
 * Where the parcel is (PP 80/2019 Pasal 66): the courier, the tracking number, when it should
 * arrive, and every status the order went through. Staff notes stay out.
 */
export function ShippingStatus({ order }: { order: Order }) {
  const { tenant } = useShop()
  const [copied, setCopied] = useState(false)
  const steps = order.events.filter((e) => e.status !== null).sort((a, b) => a.at.localeCompare(b.at))
  const shipped = steps.find((e) => e.status === 'shipped')
  const delivered = steps.find((e) => e.status === 'delivered')
  const eta = courierEta(tenant, order.courier)
  const due = shipped ? arrivalWindow(shipped.at, eta) : null
  const copy = () => {
    if (!order.trackingNo) return
    void navigator.clipboard
      ?.writeText(order.trackingNo)
      .then(() => setCopied(true))
      .catch(() => undefined)
  }
  const arrival = delivered
    ? `Delivered ${fmtDateTime(delivered.at)}.`
    : due
      ? due.from === due.to
        ? `Should arrive by ${fmtDate(due.to)}.`
        : `Should arrive between ${fmtDate(due.from)} and ${fmtDate(due.to)}.`
      : order.status === 'cancelled'
        ? 'This order will not ship.'
        : `Arrives ${etaLabel(eta).toLowerCase()} after it ships.`

  return (
    <section className="sf-card p-5 md:p-8 space-y-4" aria-labelledby="ship-h">
      <h2 id="ship-h" className="sf-display text-xl font-bold">
        Delivery
      </h2>
      <dl className="gap-4 text-sm sm:grid-cols-2 grid grid-cols-1">
        <div>
          <dt className="text-[color:var(--sf-muted)]">Courier</dt>
          <dd className="font-semibold">{COURIER_LABEL[order.courier]}</dd>
        </div>
        <div>
          <dt className="text-[color:var(--sf-muted)]">Tracking number</dt>
          <dd className="gap-2 flex items-center">
            {order.trackingNo ? (
              <>
                <span className="font-semibold font-mono break-all">{order.trackingNo}</span>
                <IconButton label={copied ? 'Copied' : 'Copy tracking number'} onClick={copy}>
                  {copied ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </IconButton>
              </>
            ) : (
              <span className="font-semibold">Given when the parcel ships</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[color:var(--sf-muted)]">Estimated arrival</dt>
          <dd className="font-semibold" role="status">
            {arrival}
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-bold">Status history</h3>
        <ol className="space-y-2 text-sm">
          {steps.map((e) => (
            <li key={e.id} className="gap-3 flex flex-wrap justify-between">
              <span className="font-semibold">{ORDER_STATUS_LABEL[e.status!]}</span>
              <span className="text-[color:var(--sf-muted)] tabular-nums">{fmtDateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
