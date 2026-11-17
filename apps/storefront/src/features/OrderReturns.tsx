import {
  fmtDateTime,
  fmtIdr,
  newId,
  nowMs,
  returnDeadline,
  returnRequestBlocker,
  returnWindowDays,
  returnableQty,
} from '@rc/fixtures'
import type { Order, ReturnReason, ReturnStatus } from '@rc/types'
import { RETURN_REASON_LABEL, RETURN_STATUS_LABEL } from '@rc/types'
import { useId, useState } from 'react'
import { ApiError } from '@rc/api'
import { Button, Field, Pill, inputClass } from '../components/ui'
import { useShop } from '../state/shop'

const TONE: Record<ReturnStatus, 'accent' | 'primary' | 'soft' | 'dark'> = {
  requested: 'accent',
  approved: 'primary',
  received: 'primary',
  refunded: 'dark',
  rejected: 'soft',
  cancelled: 'soft',
}

/** What the shopper reads under each status. */
const STATUS_NOTE: Record<ReturnStatus, string> = {
  requested: 'The store reviews your request.',
  approved: 'Approved. Send the items back to the store.',
  received: 'The store received the items and is preparing your refund.',
  refunded: 'Refunded to your original payment method.',
  rejected: 'The store did not accept this return.',
  cancelled: 'This return was cancelled.',
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
  const deadline = returnDeadline(order, windowDays)
  const left = returnableQty(order, own)
  const items = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([variantId, n]) => ({ variantId, qty: n, reason }))
  const canAsk =
    mine && delivered && deadline !== null && nowMs() <= deadline && [...left.values()].some((n) => n > 0)
  const blocker = items.length
    ? returnRequestBlocker(order, own, items, 'shopper', nowMs(), windowDays)
    : null

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
      setError(err instanceof ApiError ? err.message : 'The store did not answer. Try again in a moment.')
    }
    setBusy(false)
  }

  return (
    <section className="sf-card p-5 md:p-8 space-y-4" aria-labelledby={`${uid}-h`}>
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <h2 id={`${uid}-h`} className="sf-display text-xl font-bold">
          Returns
        </h2>
        {canAsk && !open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Request a return
          </Button>
        )}
      </div>
      {canAsk && deadline && !open && (
        <p className="text-sm text-[color:var(--sf-muted)]">
          You can ask for a return until {fmtDateTime(deadline)}.
        </p>
      )}
      {own.map((r) => (
        <div key={r.id} className="gap-2 p-4 text-sm rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
          <div className="gap-2 flex flex-wrap items-center justify-between">
            <span className="font-semibold font-mono">{r.code}</span>
            <Pill tone={TONE[r.status]}>{RETURN_STATUS_LABEL[r.status]}</Pill>
          </div>
          <p className="mt-1">
            {r.items
              .map((i) => `${i.qty} × ${catalog.productMap.get(i.productId)?.name ?? 'Item'}`)
              .join(', ')}
          </p>
          <p className="mt-1 text-[color:var(--sf-muted)]">
            {r.status === 'refunded'
              ? `${fmtIdr(r.refundAmount)} refunded to your original payment method.`
              : STATUS_NOTE[r.status]}
            {r.rejectReason ? ` ${r.rejectReason}` : ''}
          </p>
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
                label={`${product?.name ?? 'Item'}${variant && variant.name !== 'Standard' ? ` · ${variant.name}` : ''}`}
                hint={can ? `Up to ${can}` : 'Already returned'}
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
                      {n === 0 ? 'Keep it' : `Return ${n}`}
                    </option>
                  ))}
                </select>
              </Field>
            )
          })}
          <Field id={`${uid}-reason`} label="Why are you returning it?">
            <select
              id={`${uid}-reason`}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value as ReturnReason)}
            >
              {(Object.keys(RETURN_REASON_LABEL) as ReturnReason[]).map((r) => (
                <option key={r} value={r}>
                  {RETURN_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${uid}-note`} label="Anything the store should know?" hint="Optional">
            <textarea
              id={`${uid}-note`}
              rows={3}
              className={`${inputClass} py-3 h-auto`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {(error || blocker) && (
            <p className="text-sm text-danger" role="alert">
              {error || blocker}
            </p>
          )}
          <div className="gap-2 flex flex-wrap justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!items.length || !!blocker || busy}>
              {busy ? 'Sending' : 'Send request'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
