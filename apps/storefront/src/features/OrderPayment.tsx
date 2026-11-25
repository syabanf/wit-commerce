import { awaitsPayment, fmtIdr, paymentConfirmationBlocker } from '@rc/fixtures'
import type { Order } from '@rc/types'
import { useId, useState } from 'react'
import { Button, Field, Pill, describedBy, inputClass } from '../components/ui'
import { t } from '../i18n'
import { problemText, refusalText } from '../i18n/refusals'
import { fmtDate } from '../i18n/format'
import { HTTP, api } from '../lib/api'
import { useShop } from '../state/shop'

/** Where a cancelled paid order's money stands, with the reference the shopper can trace. */
function refundText(order: Order, store: string): string {
  const r = order.cancelRefund!
  const amount = fmtIdr(r.amount)
  if (r.status === 'succeeded')
    return r.method === 'midtrans'
      ? t('payment.refund.midtrans', { amount, ref: r.reference ?? '' })
      : t('payment.refund.manual', { amount, date: fmtDate(r.refundedOn!), ref: r.reference ?? '' })
  if (r.status === 'pending') return t('payment.refund.pending', { amount })
  if (r.status === 'failed') return t('payment.refund.failed', { amount, store })
  return t('payment.refund.owed', { amount, store })
}

/**
 * The payment part of the order page: a cancelled paid order's refund, or for a manual transfer or
 * static QRIS order, the shopper's payment confirmation and its state. Only the store confirms a payment.
 */
export function OrderPayment({ order }: { order: Order }) {
  const { customer, tenant, store, paysOnline, send } = useShop()
  const uid = useId()
  const pc = order.paymentConfirmation
  const mine = customer?.id === order.customerId
  const manual = awaitsPayment(order) && !paysOnline(order.paymentTypeId)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(order.total))
  const [channel, setChannel] = useState('')
  const [sender, setSender] = useState(customer?.name ?? '')
  const [time, setTime] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (order.cancelRefund) {
    const done = order.cancelRefund.status === 'succeeded'
    return (
      <section className="sf-card p-5 md:p-8 space-y-2" aria-labelledby={`${uid}-h`}>
        <div className="gap-2 flex flex-wrap items-center justify-between">
          <h2 id={`${uid}-h`} className="sf-display text-xl font-bold">
            {t('payment.refund.title')}
          </h2>
          <Pill tone={done ? 'dark' : 'accent'}>{fmtIdr(order.cancelRefund.amount)}</Pill>
        </div>
        <p className="text-sm" role="status">
          {refundText(order, tenant.name)}
        </p>
      </section>
    )
  }
  if (!mine || (!manual && pc?.status !== 'confirmed')) return null

  const input = {
    amount: Number(amount),
    channel,
    senderName: sender,
    transferredAt: time,
    ...(proofUrl && { proofUrl }),
  }
  const submit = async () => {
    const refusal = paymentConfirmationBlocker(order, input)
    if (refusal) {
      setError(refusalText(refusal))
      return
    }
    setBusy(true)
    setError('')
    try {
      await send({ type: 'orders/submitPayment', id: order.id, confirmation: input })
      setOpen(false)
    } catch (err) {
      setError(problemText(err))
    }
    setBusy(false)
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      setProofUrl((await api.shop.uploadPaymentProof(store, file)).url)
    } catch (err) {
      setError(problemText(err))
    }
    setUploading(false)
  }

  return (
    <section className="sf-card p-5 md:p-8 space-y-4" aria-labelledby={`${uid}-h`}>
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <h2 id={`${uid}-h`} className="sf-display text-xl font-bold">
          {t('payment.title')}
        </h2>
        {pc?.status === 'submitted' && <Pill tone="accent">{t('payment.checking')}</Pill>}
        {manual && pc?.status !== 'submitted' && !open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('payment.open')}
          </Button>
        )}
      </div>
      <p className="text-sm" role="status">
        {pc?.status === 'submitted'
          ? t('payment.submitted', { store: tenant.name, amount: fmtIdr(pc.amount), channel: pc.channel })
          : pc?.status === 'rejected'
            ? t('payment.rejected', { store: tenant.name, reason: pc.rejectReason ?? '' })
            : pc?.status === 'confirmed'
              ? t('payment.confirmed')
              : t('payment.intro')}
      </p>
      {open && (
        <form
          className="gap-4 sm:grid-cols-2 grid grid-cols-1"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field id={`${uid}-amount`} label={t('payment.amount')}>
            <input
              id={`${uid}-amount`}
              className={inputClass}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            />
          </Field>
          <Field id={`${uid}-channel`} label={t('payment.channel')} hint={t('payment.channelHint')}>
            <input
              id={`${uid}-channel`}
              className={inputClass}
              maxLength={60}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              {...describedBy(`${uid}-channel`, null, t('payment.channelHint'))}
            />
          </Field>
          <Field id={`${uid}-sender`} label={t('payment.sender')}>
            <input
              id={`${uid}-sender`}
              className={inputClass}
              maxLength={120}
              autoComplete="name"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
            />
          </Field>
          <Field id={`${uid}-time`} label={t('payment.time')}>
            <input
              id={`${uid}-time`}
              type="datetime-local"
              className={inputClass}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
          {HTTP && (
            <Field
              id={`${uid}-proof`}
              label={t('payment.proof')}
              hint={uploading ? t('payment.uploading') : proofUrl ? t('payment.uploaded') : t('payment.proofHint')}
              className="sm:col-span-2"
            >
              <input
                id={`${uid}-proof`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="text-sm w-full"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </Field>
          )}
          {error && (
            <p className="text-sm text-danger sm:col-span-2" role="alert">
              {error}
            </p>
          )}
          <div className="gap-2 sm:col-span-2 flex flex-wrap">
            <Button type="submit" disabled={busy || uploading}>
              {t('payment.send')}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('payment.cancel')}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
