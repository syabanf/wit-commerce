import { cn } from '@rc/ui'
import { BadgePercent, Ticket } from 'lucide-react'
import { type FormEvent, useId } from 'react'
import type { CartView } from '../features/cartView'
import type { AppliedDiscount } from '@rc/fixtures'
import type { OrderTax } from '@rc/types'
import { Button, describedBy, inputClass } from './ui'
import { Money } from './Money'
import { t, tx } from '../i18n'

/**
 * Subtotal, each discount by its label, shipping and total. A PKP brand's PPN shows as its own line
 * before shipping when checkout adds it, or under the total when the prices already include it.
 * `showDpp` adds the tax base too, for the order page.
 */
export function SummaryRows({
  subtotal,
  discounts,
  shipping,
  shippingLabel = t('checkout.summary.shipping'),
  total,
  tax,
  showDpp = false,
  className,
}: {
  subtotal: number
  discounts: AppliedDiscount[]
  shipping: number | null
  shippingLabel?: string
  total: number
  tax?: OrderTax
  showDpp?: boolean
  className?: string
}) {
  const rate = tax ? String(tax.ratePct) : ''
  const dpp = tax && showDpp && (
    <div className="gap-4 flex justify-between text-[color:var(--sf-muted)]">
      <dt>{t('checkout.summary.dpp')}</dt>
      <dd className="tabular-nums">
        <Money idr={tax.dpp} />
      </dd>
    </div>
  )
  return (
    <dl className={cn('space-y-2 text-sm', className)}>
      <div className="gap-4 flex justify-between">
        <dt>{t('checkout.summary.subtotal')}</dt>
        <dd className="font-semibold tabular-nums">
          <Money idr={subtotal} />
        </dd>
      </div>
      {discounts.map((d) => (
        <div key={d.promotionId} className="gap-4 flex justify-between text-[color:var(--sf-primary-text)]">
          <dt className="min-w-0">{d.label}</dt>
          <dd className="font-semibold shrink-0 tabular-nums">
            <Money idr={d.amount} sign="−" />
          </dd>
        </div>
      ))}
      {tax && !tax.pricesIncludeTax && (
        <>
          {dpp}
          <div className="gap-4 flex justify-between">
            <dt>{t('checkout.summary.ppn', { rate })}</dt>
            <dd className="font-semibold tabular-nums">
              <Money idr={tax.ppn} />
            </dd>
          </div>
        </>
      )}
      <div className="gap-4 flex justify-between">
        <dt>{shippingLabel}</dt>
        <dd className="font-semibold tabular-nums">
          {shipping === null ? (
            t('checkout.summary.chosenAtCheckout')
          ) : shipping ? (
            <Money idr={shipping} />
          ) : (
            t('checkout.summary.free')
          )}
        </dd>
      </div>
      <div className="gap-4 pt-3 text-base flex justify-between border-t border-[color:var(--sf-line)]">
        <dt className="font-bold">{t('checkout.summary.total')}</dt>
        <dd className="font-bold tabular-nums">
          <Money idr={total} />
        </dd>
      </div>
      {tax?.pricesIncludeTax && (
        <>
          <div className="gap-4 flex justify-between text-[color:var(--sf-muted)]">
            <dt>{t('checkout.summary.ppnIncluded', { rate })}</dt>
            <dd className="tabular-nums">
              <Money idr={tax.ppn} />
            </dd>
          </div>
          {dpp}
        </>
      )}
    </dl>
  )
}

/** Voucher code field; the pricing engine's sentence shows when the code does not apply. */
export function VoucherForm({ view, className }: { view: CartView; className?: string }) {
  const id = useId()
  const { voucher } = view
  const applied = !!voucher.code && !voucher.error
  const submit = (e: FormEvent) => {
    e.preventDefault()
    voucher.apply()
  }
  return (
    <form onSubmit={submit} noValidate className={className}>
      <label htmlFor={id} className="mb-1.5 gap-2 text-sm font-semibold flex items-center">
        <Ticket className="size-4" aria-hidden="true" /> {t('checkout.voucher.label')}
      </label>
      {applied ? (
        <div className="gap-2 px-4 py-2 flex items-center justify-between rounded-[var(--sf-tile-radius)] border border-dashed border-[color:var(--sf-primary)]">
          <p className="text-sm">
            {tx('checkout.voucher.applied', { code: <strong key="code" className="tracking-wide">{voucher.code}</strong> })}
          </p>
          <Button variant="ghost" onClick={voucher.remove}>
            {t('checkout.voucher.remove')}
          </Button>
        </div>
      ) : (
        <>
          <div className="gap-2 flex">
            <input
              id={id}
              value={voucher.input}
              onChange={(e) => voucher.setInput(e.target.value)}
              placeholder="WELCOME10"
              autoCapitalize="characters"
              className={cn(inputClass, 'uppercase')}
              {...describedBy(id, voucher.error)}
            />
            <Button type="submit" variant="dark">
              {t('checkout.voucher.apply')}
            </Button>
          </div>
          {voucher.error && (
            <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
              {voucher.error}
            </p>
          )}
        </>
      )}
    </form>
  )
}

/** Automatic offers that unlock with a payment type, such as "5% off when you pay with QRIS". */
export function PaymentHints({ hints, className }: { hints: string[]; className?: string }) {
  if (!hints.length) return null
  return (
    <ul className={cn('space-y-2', className)}>
      {hints.map((h) => (
        <li key={h} className="gap-2 text-sm flex items-start">
          <BadgePercent
            className="mt-0.5 size-4 shrink-0 text-[color:var(--sf-primary-text)]"
            aria-hidden="true"
          />
          <span>{t('checkout.paymentHint', { hint: h })}</span>
        </li>
      ))}
    </ul>
  )
}
