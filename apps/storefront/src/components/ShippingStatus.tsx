import { arrivalWindow, courierEta } from '@rc/fixtures'
import type { Order } from '@rc/types'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { courierLabel, orderStatusLabel } from '../features/accountLabels'
import { t } from '../i18n'
import { etaLabel, fmtDate, fmtDateTime } from '../i18n/format'
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
    ? t('account.ship.delivered', { date: fmtDateTime(delivered.at) })
    : due
      ? due.from === due.to
        ? t('account.ship.by', { date: fmtDate(due.to) })
        : t('account.ship.between', { from: fmtDate(due.from), to: fmtDate(due.to) })
      : order.status === 'cancelled'
        ? t('account.ship.noShip')
        : t('account.ship.afterShip', { eta: etaLabel(eta).toLowerCase() })

  return (
    <section className="sf-card p-5 md:p-8 space-y-4" aria-labelledby="ship-h">
      <h2 id="ship-h" className="sf-display text-xl font-bold">
        {t('account.ship.title')}
      </h2>
      <dl className="gap-4 text-sm sm:grid-cols-2 grid grid-cols-1">
        <div>
          <dt className="text-[color:var(--sf-muted)]">{t('account.ship.courier')}</dt>
          <dd className="font-semibold">{courierLabel(order.courier)}</dd>
        </div>
        <div>
          <dt className="text-[color:var(--sf-muted)]">{t('account.ship.tracking')}</dt>
          <dd className="gap-2 flex items-center">
            {order.trackingNo ? (
              <>
                <span className="font-semibold font-mono break-all">{order.trackingNo}</span>
                <IconButton label={copied ? t('account.ship.copied') : t('account.ship.copy')} onClick={copy}>
                  {copied ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </IconButton>
              </>
            ) : (
              <span className="font-semibold">{t('account.ship.pending')}</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[color:var(--sf-muted)]">{t('account.ship.eta')}</dt>
          <dd className="font-semibold" role="status">
            {arrival}
          </dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-bold">{t('account.ship.history')}</h3>
        <ol className="space-y-2 text-sm">
          {steps.map((e) => (
            <li key={e.id} className="gap-3 flex flex-wrap justify-between">
              <span className="font-semibold">{orderStatusLabel(e.status!)}</span>
              <span className="text-[color:var(--sf-muted)] tabular-nums">{fmtDateTime(e.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
