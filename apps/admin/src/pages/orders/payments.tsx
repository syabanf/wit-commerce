import {
  cancelRefundBlocker,
  dayKey,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fmtWhen,
  nowMs,
  paymentReviewBlocker,
  paymentToVerify,
  returnRefundProofBlocker,
} from '@rc/fixtures'
import type { Order } from '@rc/types'
import { CANCEL_REFUND_STATUS_LABEL, PAYMENT_CONFIRMATION_STATUS_LABEL } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  FormField,
  Input,
  KeyValue,
  Textarea,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { PaymentStateBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/scoped'
import { useOrderPayment } from '../../state/useOrderPayment'

/** Midtrans transaction statuses that still hold money the API refunds through Midtrans. */
const MIDTRANS_PAID = ['settlement', 'capture', 'capture/accept', 'partial_refund']

const refundOpen = (o: Order) => !!o.cancelRefund && o.cancelRefund.status !== 'succeeded'

/**
 * The orders that wait for staff on money: payment confirmations to check against the bank or
 * wallet, and cancellations whose refund is still owed.
 */
export function PaymentQueue() {
  const s = useScoped()
  const { can } = useAuth()
  const now = useNow(60_000)
  if (!can('order.refund')) return null
  const toVerify = s.orders.filter(paymentToVerify)
  const owed = s.orders.filter(refundOpen)
  if (!toVerify.length && !owed.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments to check</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {[...toVerify, ...owed].map((o) => {
          const pc = o.paymentConfirmation
          const detail =
            pc?.status === 'submitted'
              ? `${fmtIdr(pc.amount)} from ${pc.channel} · ${pc.senderName} · sent ${fmtWhen(pc.submittedAt, now)}`
              : `${fmtIdr(o.cancelRefund!.amount)} to send back${o.cancelRefund!.error ? ` · ${o.cancelRefund!.error}` : ''}`
          return (
            <Link
              key={o.id}
              to={paths.order(o.id)}
              className="gap-3 rounded-2xl p-3 flex flex-wrap items-center justify-between bg-surface-2 hover:bg-surface"
            >
              <span className="min-w-0">
                <span className="text-xs font-semibold block font-mono">{o.code}</span>
                <span className="text-sm block">{s.customerName(o.customerId)}</span>
                <span className="text-xs text-muted">{detail}</span>
              </span>
              <PaymentStateBadge order={o} />
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** The shopper's payment confirmation, and the buttons to confirm or reject it. */
export function PaymentCheckCard({ order }: { order: Order }) {
  const s = useScoped()
  const { can } = useAuth()
  const [rejecting, setRejecting] = useState(false)
  const pc = order.paymentConfirmation
  if (!pc) return null
  const waiting = !paymentReviewBlocker(order) && can('order.refund')
  const short = pc.amount < order.total
  const confirm = () => {
    s.dispatchAsync({ type: 'orders/confirmPayment', id: order.id })
      .then(() => toast(`${order.code} paid`, { tone: 'success', description: `${fmtIdr(order.total)} confirmed.` }))
      .catch((err: unknown) => toast('Not confirmed', { tone: 'danger', description: (err as Error).message }))
  }
  return (
    <Card>
      <CardHeader className="gap-2 flex flex-row flex-wrap items-center justify-between">
        <CardTitle>Payment confirmation</CardTitle>
        <Badge variant={pc.status === 'submitted' ? 'warning' : pc.status === 'confirmed' ? 'success' : 'danger'}>
          {PAYMENT_CONFIRMATION_STATUS_LABEL[pc.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <KeyValue
          bare
          labelWidth="sm"
          items={[
            {
              label: 'Amount',
              value: short ? (
                <span className="font-semibold text-danger">
                  {fmtIdr(pc.amount)} of {fmtIdr(order.total)}
                </span>
              ) : (
                fmtIdr(pc.amount)
              ),
            },
            { label: 'From', value: pc.channel },
            { label: 'Sender', value: pc.senderName || 'Erased' },
            { label: 'Sent at', value: pc.transferredAt.replace('T', ' ') },
            { label: 'Reported', value: fmtDateTime(pc.submittedAt) },
            {
              label: 'Proof',
              value: pc.proofUrl ? (
                <a href={pc.proofUrl} target="_blank" rel="noreferrer" className="font-semibold hover:text-accent">
                  Open image
                </a>
              ) : (
                'None'
              ),
            },
            ...(pc.reviewedAt
              ? [{ label: 'Checked', value: `${fmtDateTime(pc.reviewedAt)} · ${s.userName(pc.reviewedBy ?? '')}` }]
              : []),
            ...(pc.rejectReason ? [{ label: 'Reason', value: pc.rejectReason }] : []),
          ]}
        />
        {waiting && (
          <>
            <p className="text-sm text-muted">
              Find the money in your bank or wallet statement before you confirm. Confirming marks the order
              paid and emails the shopper.
            </p>
            <div className="gap-2 flex flex-wrap">
              <Button onClick={confirm}>Confirm payment</Button>
              <Button variant="outline" onClick={() => setRejecting(true)}>
                Reject
              </Button>
            </div>
          </>
        )}
      </CardContent>
      {rejecting && <RejectPaymentDialog order={order} onOpenChange={setRejecting} />}
    </Card>
  )
}

function RejectPaymentDialog({ order, onOpenChange }: { order: Order; onOpenChange: (open: boolean) => void }) {
  const s = useScoped()
  const [reason, setReason] = useState('')
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      destructive
      title={`Reject the payment for ${order.code}?`}
      description="The order keeps waiting for payment. The shopper reads your reason and may send a new confirmation."
      confirmLabel="Reject payment"
      confirmDisabled={!reason.trim()}
      onConfirm={() => {
        s.dispatchAsync({ type: 'orders/rejectPayment', id: order.id, reason: reason.trim() })
          .then(() => toast('Payment rejected', { description: order.code }))
          .catch((err: unknown) => toast('Not rejected', { tone: 'danger', description: (err as Error).message }))
        onOpenChange(false)
      }}
    >
      <FormField label="Reason for the shopper" required htmlFor="reject-payment-reason">
        <Textarea
          id="reject-payment-reason"
          variant="soft"
          autoFocus
          className="min-h-20"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="No transfer of this amount arrived on 5 October"
        />
      </FormField>
    </ConfirmDialog>
  )
}

/** A cancelled paid order's refund: where it stands, and the way to settle it. */
export function CancelRefundCard({ order }: { order: Order }) {
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  const r = order.cancelRefund
  if (!r) return null
  return (
    <Card>
      <CardHeader className="gap-2 flex flex-row flex-wrap items-center justify-between">
        <CardTitle>Cancellation refund</CardTitle>
        <PaymentStateBadge order={order} />
      </CardHeader>
      <CardContent className="space-y-3">
        <KeyValue
          bare
          labelWidth="sm"
          items={[
            { label: 'Amount', value: fmtIdr(r.amount) },
            { label: 'Status', value: CANCEL_REFUND_STATUS_LABEL[r.status] },
            ...(r.method ? [{ label: 'Method', value: r.method === 'midtrans' ? 'Midtrans' : 'Bank transfer' }] : []),
            ...(r.reference
              ? [{ label: 'Reference', value: <span className="text-xs font-mono">{r.reference}</span> }]
              : []),
            ...(r.refundedOn && r.status === 'succeeded'
              ? [{ label: 'Sent on', value: fmtDate(r.refundedOn) }]
              : []),
            ...(r.error ? [{ label: 'Last error', value: r.error }] : []),
          ]}
        />
        {r.status !== 'succeeded' && can('order.refund') && (
          <Button onClick={() => setOpen(true)}>{r.method === 'midtrans' ? 'Retry refund' : 'Record refund'}</Button>
        )}
      </CardContent>
      {open && <CancelRefundDialog order={order} onOpenChange={setOpen} />}
    </Card>
  )
}

function CancelRefundDialog({ order, onOpenChange }: { order: Order; onOpenChange: (open: boolean) => void }) {
  const s = useScoped()
  const payment = useOrderPayment(order.id, s.tenant.id, order.paymentStatus)
  const r = order.cancelRefund!
  // Midtrans refunds its own payments; after it said no, staff may send the money themselves.
  const viaGateway =
    r.status !== 'failed' &&
    (r.method === 'midtrans' || (payment?.provider === 'midtrans' && MIDTRANS_PAID.includes(payment.status)))
  const [reference, setReference] = useState('')
  const [refundedOn, setRefundedOn] = useState(dayKey(nowMs()))
  const proof = viaGateway ? null : returnRefundProofBlocker({ method: 'manual', reference, refundedOn })
  const blocked = cancelRefundBlocker(order)
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Refund ${fmtIdr(r.amount)} for ${order.code}?`}
      description={
        viaGateway
          ? 'Midtrans is asked again under the same refund key, so the money moves once.'
          : 'Send the money first, then record the transfer. The shopper sees the reference and date.'
      }
      confirmLabel={viaGateway ? 'Retry through Midtrans' : 'Record refund'}
      confirmDisabled={!!blocked || !!proof}
      onConfirm={() => {
        s.dispatchAsync({
          type: 'orders/refundCancelled',
          id: order.id,
          reference: viaGateway ? '' : reference.trim(),
          refundedOn: viaGateway ? '' : refundedOn,
        })
          .then(() => toast(`${fmtIdr(r.amount)} refunded`, { tone: 'success', description: order.code }))
          .catch((err: unknown) => toast('Not refunded', { tone: 'danger', description: (err as Error).message }))
        onOpenChange(false)
      }}
    >
      {!viaGateway && (
        <div className="gap-3 sm:grid-cols-2 grid grid-cols-1">
          <FormField label="Transfer reference" required htmlFor="cancel-refund-reference">
            <Input
              id="cancel-refund-reference"
              variant="soft"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="BCA 0123456789"
            />
          </FormField>
          <FormField label="Sent on" required htmlFor="cancel-refund-date">
            <Input
              id="cancel-refund-date"
              variant="soft"
              type="date"
              value={refundedOn}
              onChange={(e) => setRefundedOn(e.target.value)}
            />
          </FormField>
        </div>
      )}
    </ConfirmDialog>
  )
}
