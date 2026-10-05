import { fmtIdr } from '@rc/fixtures'
import type { CancelReason, Order } from '@rc/types'
import { CANCEL_REASON_LABEL, COURIER_LABEL } from '@rc/types'
import { ConfirmDialog, FormField, Input, NativeSelect, Textarea, toast } from '@rc/ui'
import { useState } from 'react'
import { useScoped } from '../../state/scoped'

type DialogProps = { order: Order; open: boolean; onOpenChange: (open: boolean) => void }

/** Ship asks for the courier's tracking number, which the customer receives with the shipping message. */
export function ShipDialog({ order, open, onOpenChange }: DialogProps) {
  return open ? <ShipForm order={order} onOpenChange={onOpenChange} /> : null
}

function ShipForm({ order, onOpenChange }: Omit<DialogProps, 'open'>) {
  const { dispatch } = useScoped()
  const [tracking, setTracking] = useState('')
  const pickup = order.courier === 'pickup'
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Ship ${order.code}?`}
      description={
        pickup
          ? 'The customer collects it at the store. They get a pickup message.'
          : `Hand the parcel to ${COURIER_LABEL[order.courier]} and enter its tracking number.`
      }
      confirmLabel="Ship order"
      confirmDisabled={!pickup && !tracking.trim()}
      onConfirm={() => {
        dispatch({ type: 'orders/advance', id: order.id, trackingNo: tracking.trim() || undefined })
        toast(`${order.code} shipped`, {
          tone: 'success',
          description: pickup ? 'Ready for pickup.' : `Tracking ${tracking.trim()} sent to the customer.`,
        })
        onOpenChange(false)
      }}
    >
      {!pickup && (
        <FormField label="Tracking number" required htmlFor="ship-tracking">
          <Input
            id="ship-tracking"
            variant="soft"
            autoFocus
            inputClassName="font-mono uppercase"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder={`${order.courier.toUpperCase()}12345678`}
          />
        </FormField>
      )}
    </ConfirmDialog>
  )
}

const REASONS = (Object.keys(CANCEL_REASON_LABEL) as CancelReason[]).filter((r) => r !== 'payment_expired')

export function CancelOrderDialog({ order, open, onOpenChange }: DialogProps) {
  return open ? <CancelForm order={order} onOpenChange={onOpenChange} /> : null
}

function CancelForm({ order, onOpenChange }: Omit<DialogProps, 'open'>) {
  const { dispatch } = useScoped()
  const [reason, setReason] = useState<CancelReason | ''>('')
  const [note, setNote] = useState('')
  const paid = order.paymentStatus === 'paid'
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      destructive
      title={`Cancel ${order.code}?`}
      description={
        paid
          ? `Reserved stock goes back on sale and ${fmtIdr(order.total)} is refunded to the customer.`
          : 'Reserved stock goes back on sale. The customer gets a cancellation message.'
      }
      confirmLabel="Cancel order"
      cancelLabel="Keep order"
      confirmDisabled={!reason}
      onConfirm={() => {
        if (!reason) return
        dispatch({
          type: 'orders/cancel',
          id: order.id,
          reason,
          note: note.trim() || CANCEL_REASON_LABEL[reason],
        })
        toast(`${order.code} cancelled`, {
          description: paid ? `${fmtIdr(order.total)} refunded.` : 'Stock released.',
        })
        onOpenChange(false)
      }}
    >
      <div className="space-y-3">
        <FormField label="Reason" required htmlFor="cancel-reason">
          <NativeSelect
            id="cancel-reason"
            variant="soft"
            placeholder="Choose a reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as CancelReason)}
            options={REASONS.map((r) => ({ value: r, label: CANCEL_REASON_LABEL[r] }))}
          />
        </FormField>
        <FormField label="Note" hint="Optional. Your team sees it on the timeline." htmlFor="cancel-note">
          <Textarea
            id="cancel-note"
            variant="soft"
            className="min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </div>
    </ConfirmDialog>
  )
}

export function RefundDialog({ order, open, onOpenChange }: DialogProps) {
  return open ? <RefundForm order={order} onOpenChange={onOpenChange} /> : null
}

function RefundForm({ order, onOpenChange }: Omit<DialogProps, 'open'>) {
  const { dispatch } = useScoped()
  const left = order.total - order.refundedAmount
  const [amount, setAmount] = useState(String(left))
  const [note, setNote] = useState('')
  const value = Number(amount)
  const invalid = !Number.isFinite(value) || value <= 0 || value > left
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Refund ${order.code}?`}
      description="The money goes back through the original payment method. A full refund closes the order."
      confirmLabel={invalid ? 'Refund' : `Refund ${fmtIdr(value)}`}
      confirmDisabled={invalid}
      onConfirm={() => {
        dispatch({ type: 'orders/refund', id: order.id, amount: value, note: note.trim() })
        toast(`${fmtIdr(value)} refunded`, {
          tone: 'success',
          description: `${order.code} · ${value >= left ? 'order closed' : 'partial refund'}`,
        })
        onOpenChange(false)
      }}
    >
      <div className="space-y-3">
        <FormField
          label="Amount"
          required
          hint={`Up to ${fmtIdr(left)}`}
          error={invalid && amount ? `Enter an amount between Rp 1 and ${fmtIdr(left)}.` : undefined}
          htmlFor="refund-amount"
        >
          <Input
            id="refund-amount"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
          />
        </FormField>
        <FormField label="Reason" hint="Optional" htmlFor="refund-note">
          <Textarea
            id="refund-note"
            variant="soft"
            className="min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Damaged sole, refund agreed with the customer"
          />
        </FormField>
      </div>
    </ConfirmDialog>
  )
}

export function NoteDialog({ order, open, onOpenChange }: DialogProps) {
  return open ? <NoteForm order={order} onOpenChange={onOpenChange} /> : null
}

function NoteForm({ order, onOpenChange }: Omit<DialogProps, 'open'>) {
  const { dispatch } = useScoped()
  const [note, setNote] = useState('')
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Add a note to ${order.code}?`}
      description="Internal notes stay with your team and never reach the customer."
      confirmLabel="Add note"
      confirmDisabled={!note.trim()}
      onConfirm={() => {
        dispatch({ type: 'orders/note', id: order.id, note: note.trim() })
        toast('Note added', { tone: 'success', description: order.code })
        onOpenChange(false)
      }}
    >
      <Textarea
        aria-label="Note"
        variant="soft"
        autoFocus
        className="min-h-20"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </ConfirmDialog>
  )
}
