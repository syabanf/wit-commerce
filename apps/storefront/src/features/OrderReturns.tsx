import {
  fmtIdr,
  newId,
  nowMs,
  returnDeadline,
  returnRequestBlocker,
  returnShippingPayer,
  returnWindowDays,
  returnableQty,
  shippingPayerOf,
} from '@rc/fixtures'
import type { Order, OrderReturn, ReturnReason, ReturnStatus } from '@rc/types'
import { RETURN_REASON_LABEL } from '@rc/types'
import { useId, useState } from 'react'
import { ApiError } from '@rc/api'
import { Button, Field, Pill, inputClass } from '../components/ui'
import { type MessageKey, t } from '../i18n'
import { fmtDate, fmtDateTime } from '../i18n/format'
import { useShop } from '../state/shop'
import { returnBlockerText, returnReasonLabel, returnStatusLabel, shippingPayerLabel } from './accountLabels'

const TONE: Record<ReturnStatus, 'accent' | 'primary' | 'soft' | 'dark'> = {
  requested: 'accent',
  approved: 'primary',
  received: 'primary',
  refunded: 'dark',
  rejected: 'soft',
  cancelled: 'soft',
}

/** What the shopper reads under each status. */
const STATUS_NOTE: Record<ReturnStatus, MessageKey> = {
  requested: 'account.returns.note.requested',
  approved: 'account.returns.note.approved',
  received: 'account.returns.note.received',
  refunded: 'account.returns.note.refunded',
  rejected: 'account.returns.note.rejected',
  cancelled: 'account.returns.note.cancelled',
}

/** How the money of a refunded return went back, with the reference the shopper can trace. */
function refundLine(r: OrderReturn): string {
  const amount = fmtIdr(r.refundAmount)
  if (r.refundMethod === 'midtrans')
    return t('account.returns.refund.midtrans', { amount, ref: r.refundReference ?? '' })
  if (r.refundMethod === 'manual')
    return t('account.returns.refund.manual', {
      amount,
      date: fmtDate(r.refundedOn!),
      ref: r.refundReference ?? '',
    })
  return t('account.returns.refund.plain', { amount })
}

/** The order's returns and, for a delivered order inside the window, the form to ask for one. */
export function OrderReturns({ order }: { order: Order }) {
  const { returns, catalog, customer, tenant, send } = useShop()
  const uid = useId()
  const own = returns.filter((r) => r.orderId === order.id)
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState<ReturnReason>('damaged')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const windowDays = returnWindowDays(tenant)
  const mine = customer?.id === order.customerId
  const delivered = order.status === 'delivered' || order.status === 'completed'
  // A damaged, wrong, late, defective or expired item always gets 2 working days (PP 80/2019 Pasal 69);
  // change of mind and fit follow the store's own window, which may be off.
  const deadline = returnDeadline(order, windowDays, 'damaged')!
  const choiceDeadline = returnDeadline(order, windowDays, 'changed_mind')
  const left = returnableQty(order, own)
  const items = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([variantId, n]) => ({ variantId, qty: n, reason }))
  const canAsk = mine && delivered && nowMs() <= deadline && [...left.values()].some((n) => n > 0)
  const choiceOpen = choiceDeadline !== null && nowMs() <= choiceDeadline
  const refusal = items.length
    ? returnRequestBlocker(order, own, items, 'shopper', nowMs(), windowDays)
    : null
  const blocker = refusal && returnBlockerText(refusal)

  if (!own.length && !canAsk) return null
  const lines = order.lines.filter((l, i, all) => all.findIndex((x) => x.variantId === l.variantId) === i)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await send({
        type: 'returns/request',
        id: newId('ret'),
        orderId: order.id,
        items,
        note: note.trim(),
        who: 'shopper',
      })
      setOpen(false)
      setQty({})
      setNote('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('account.noAnswer'))
    }
    setBusy(false)
  }

  return (
    <section className="sf-card p-5 md:p-8 space-y-4" aria-labelledby={`${uid}-h`}>
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <h2 id={`${uid}-h`} className="sf-display text-xl font-bold">
          {t('account.returns.title')}
        </h2>
        {canAsk && !open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('account.returns.request')}
          </Button>
        )}
      </div>
      {canAsk && (
        <p className="text-sm text-[color:var(--sf-muted)]">
          {t('account.returns.legalUntil', { date: fmtDateTime(deadline) })}{' '}
          {choiceOpen
            ? t('account.returns.choiceUntil', { date: fmtDateTime(choiceDeadline) })
            : t('account.returns.noChoice')}
        </p>
      )}
      {own.map((r) => (
        <div key={r.id} className="gap-2 p-4 text-sm rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
          <div className="gap-2 flex flex-wrap items-center justify-between">
            <span className="font-semibold font-mono">{r.code}</span>
            <Pill tone={TONE[r.status]}>{returnStatusLabel(r.status)}</Pill>
          </div>
          <p className="mt-1">
            {r.items
              .map(
                (i) => `${i.qty} × ${catalog.productMap.get(i.productId)?.name ?? t('account.returns.item')}`,
              )
              .join(', ')}
          </p>
          <p className="mt-1 text-[color:var(--sf-muted)]">
            {r.status === 'refunded' ? refundLine(r) : t(STATUS_NOTE[r.status])}
            {r.rejectReason ? ` ${r.rejectReason}` : ''}
          </p>
          {r.status !== 'rejected' && r.status !== 'cancelled' && (
            <p className="mt-1 text-[color:var(--sf-muted)]">{shippingPayerLabel(shippingPayerOf(r))}.</p>
          )}
        </div>
      ))}
      {open && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          {lines.map((l) => {
            const product = catalog.productMap.get(l.productId)
            const variant = product?.variants.find((v) => v.id === l.variantId)
            const can = Math.max(0, left.get(l.variantId) ?? 0)
            return (
              <Field
                key={l.variantId}
                id={`${uid}-${l.variantId}`}
                label={`${product?.name ?? t('account.returns.item')}${variant && variant.name !== 'Standard' ? ` · ${variant.name}` : ''}`}
                hint={can ? t('account.returns.upTo', { count: can }) : t('account.returns.returned')}
              >
                <select
                  id={`${uid}-${l.variantId}`}
                  className={inputClass}
                  disabled={!can}
                  value={qty[l.variantId] ?? 0}
                  onChange={(e) => setQty((q) => ({ ...q, [l.variantId]: Number(e.target.value) }))}
                >
                  {Array.from({ length: can + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t('account.returns.keep') : t('account.returns.returnN', { count: n })}
                    </option>
                  ))}
                </select>
              </Field>
            )
          })}
          <Field id={`${uid}-reason`} label={t('account.returns.why')}>
            <select
              id={`${uid}-reason`}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value as ReturnReason)}
            >
              {(Object.keys(RETURN_REASON_LABEL) as ReturnReason[]).map((r) => (
                <option key={r} value={r}>
                  {returnReasonLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${uid}-note`} label={t('account.returns.storeNote')} hint={t('account.optional')}>
            <textarea
              id={`${uid}-note`}
              rows={3}
              className={`${inputClass} py-3 h-auto`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="text-sm text-[color:var(--sf-muted)]">
            {returnShippingPayer([{ reason }]) === 'brand'
              ? t('account.returns.brandPays')
              : t('account.returns.youPay')}
          </p>
          {(error || blocker) && (
            <p className="text-sm text-danger" role="alert">
              {error || blocker}
            </p>
          )}
          <div className="gap-2 flex flex-wrap justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('account.cancel')}
            </Button>
            <Button type="submit" disabled={!items.length || !!blocker || busy}>
              {busy ? t('account.returns.sending') : t('account.sendRequest')}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
