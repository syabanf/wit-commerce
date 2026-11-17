import {
  dayKey,
  fmtIdr,
  newId,
  nowMs,
  returnRefundCap,
  returnRefundProofBlocker,
  returnRefundSplit,
  returnRequestBlocker,
  returnShippingPayer,
  returnWindowDays,
  returnableQty,
  shippingPayerOf,
} from '@rc/fixtures'
import type { Order, OrderReturn, ReturnReason } from '@rc/types'
import { RETURN_REASON_LABEL } from '@rc/types'
import { ConfirmDialog, FormField, Input, NativeSelect, Switch, Textarea, toast } from '@rc/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { useOrderPayment } from '../../state/useOrderPayment'

type Open = { open: boolean; onOpenChange: (open: boolean) => void }

const REASONS = (Object.keys(RETURN_REASON_LABEL) as ReturnReason[]).map((r) => ({
  value: r,
  label: RETURN_REASON_LABEL[r],
}))

/** Start a return from the order page: how many of each item come back, and why. */
export function StartReturnDialog({
  order,
  returns,
  open,
  onOpenChange,
}: Open & { order: Order; returns: OrderReturn[] }) {
  return open ? <StartReturnForm order={order} returns={returns} onOpenChange={onOpenChange} /> : null
}

function StartReturnForm({
  order,
  returns,
  onOpenChange,
}: Omit<Open, 'open'> & { order: Order; returns: OrderReturn[] }) {
  const s = useScoped()
  const navigate = useNavigate()
  const left = returnableQty(order, returns)
  const lines = order.lines.filter((l, i, all) => all.findIndex((x) => x.variantId === l.variantId) === i)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState<Record<string, ReturnReason>>({})
  const [note, setNote] = useState('')
  const items = lines
    .filter((l) => (qty[l.variantId] ?? 0) > 0)
    .map((l) => ({
      variantId: l.variantId,
      qty: qty[l.variantId]!,
      reason: reason[l.variantId] ?? 'damaged',
    }))
  const blocker = returnRequestBlocker(order, returns, items, 'staff', nowMs(), returnWindowDays(s.tenant))
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Start a return for ${order.code}`}
      description="Choose what comes back. You approve, receive and refund it from the return's page."
      confirmLabel="Start return"
      confirmDisabled={!!blocker}
      onConfirm={() => {
        const id = newId('ret')
        s.dispatch({ type: 'returns/request', id, orderId: order.id, items, note: note.trim(), who: 'staff' })
        toast('Return started', {
          tone: 'success',
          description: `${order.code} · ${items.length} item${items.length === 1 ? '' : 's'}`,
        })
        onOpenChange(false)
        navigate(paths.orderReturn(id))
      }}
    >
      <div className="space-y-3">
        {lines.map((l) => {
          const variant = s.maps.variant.get(l.variantId)
          const can = Math.max(0, left.get(l.variantId) ?? 0)
          return (
            <div
              key={l.variantId}
              className="gap-3 rounded-2xl p-3 grid grid-cols-[6rem_minmax(0,1fr)] bg-surface-2"
            >
              <div className="min-w-0 col-span-2">
                <p className="text-sm font-semibold truncate">{s.productName(l.productId)}</p>
                <p className="text-xs text-muted">
                  {variant?.name} · {can ? `${can} can come back` : 'Nothing left to return'}
                </p>
              </div>
              <FormField label="Units" htmlFor={`qty-${l.variantId}`}>
                <NativeSelect
                  id={`qty-${l.variantId}`}
                  variant="soft"
                  disabled={!can}
                  value={String(qty[l.variantId] ?? 0)}
                  onChange={(e) => setQty((q) => ({ ...q, [l.variantId]: Number(e.target.value) }))}
                  options={Array.from({ length: can + 1 }, (_, n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                />
              </FormField>
              <FormField label="Reason" htmlFor={`reason-${l.variantId}`}>
                <NativeSelect
                  id={`reason-${l.variantId}`}
                  variant="soft"
                  disabled={!can}
                  value={reason[l.variantId] ?? 'damaged'}
                  onChange={(e) =>
                    setReason((r) => ({ ...r, [l.variantId]: e.target.value as ReturnReason }))
                  }
                  options={REASONS}
                />
              </FormField>
            </div>
          )
        })}
        <FormField label="Note" hint="Optional. What the shopper told you." htmlFor="return-note">
          <Textarea
            id="return-note"
            variant="soft"
            className="min-h-20"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        {items.length > 0 && (
          <p className="text-xs text-muted">
            {returnShippingPayer(items) === 'brand'
              ? 'The store pays return shipping: at least one reason is the store’s fault (PP 80/2019 Pasal 69).'
              : 'The shopper pays return shipping for a change of mind or fit.'}
          </p>
        )}
        {blocker && items.length > 0 && <p className="text-sm text-danger">{blocker}</p>}
      </div>
    </ConfirmDialog>
  )
}

export function RejectReturnDialog({ ret, open, onOpenChange }: Open & { ret: OrderReturn }) {
  return open ? <RejectForm ret={ret} onOpenChange={onOpenChange} /> : null
}

function RejectForm({ ret, onOpenChange }: Omit<Open, 'open'> & { ret: OrderReturn }) {
  const { dispatch } = useScoped()
  const [reason, setReason] = useState('')
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      destructive
      title={`Reject ${ret.code}?`}
      description="The shopper reads your reason. The items stay theirs and can be returned again later."
      confirmLabel="Reject return"
      confirmDisabled={!reason.trim()}
      onConfirm={() => {
        dispatch({ type: 'returns/reject', id: ret.id, reason: reason.trim() })
        toast(`${ret.code} rejected`, { description: reason.trim() })
        onOpenChange(false)
      }}
    >
      <FormField label="Reason" required htmlFor="reject-reason">
        <Textarea
          id="reject-reason"
          variant="soft"
          autoFocus
          className="min-h-20"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="The shoes were worn outdoors"
        />
      </FormField>
    </ConfirmDialog>
  )
}

export function ReceiveReturnDialog({ ret, open, onOpenChange }: Open & { ret: OrderReturn }) {
  return open ? <ReceiveForm ret={ret} onOpenChange={onOpenChange} /> : null
}

function ReceiveForm({ ret, onOpenChange }: Omit<Open, 'open'> & { ret: OrderReturn }) {
  const { dispatch } = useScoped()
  const [restock, setRestock] = useState(ret.reason !== 'damaged')
  const units = ret.items.reduce((n, i) => n + i.qty, 0)
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Receive ${ret.code}?`}
      description={`Confirm the ${units === 1 ? 'unit' : `${units} units`} arrived back at the warehouse.`}
      confirmLabel="Mark received"
      onConfirm={() => {
        dispatch({ type: 'returns/receive', id: ret.id, restock })
        toast(`${ret.code} received`, {
          tone: 'success',
          description: restock ? `${units} back on sale.` : 'Kept off the shelf.',
        })
        onOpenChange(false)
      }}
    >
      <FormField
        label="Put back in stock"
        hint="Leave off for damaged items you will not sell again."
        htmlFor="restock"
      >
        <Switch id="restock" checked={restock} onCheckedChange={setRestock} />
      </FormField>
    </ConfirmDialog>
  )
}

export function RefundReturnDialog({
  ret,
  order,
  open,
  onOpenChange,
}: Open & { ret: OrderReturn; order: Order }) {
  return open ? <RefundForm ret={ret} order={order} onOpenChange={onOpenChange} /> : null
}

/** Midtrans transaction statuses that still hold money the API refunds through Midtrans. */
const MIDTRANS_PAID = ['settlement', 'capture', 'capture/accept', 'partial_refund']

function RefundForm({ ret, order, onOpenChange }: Omit<Open, 'open'> & { ret: OrderReturn; order: Order }) {
  const s = useScoped()
  const payment = useOrderPayment(order.id, s.tenant.id, order.paymentStatus)
  // Pasal 71: Midtrans refunds its own payments; staff record any other refund as a transfer. After
  // Midtrans said no, staff may send the money themselves.
  const viaGateway =
    payment?.provider === 'midtrans' &&
    MIDTRANS_PAID.includes(payment.status) &&
    ret.gatewayStatus !== 'failed'
  const cap = returnRefundCap(order, ret)
  const brandPays = shippingPayerOf(ret) === 'brand'
  const [amount, setAmount] = useState(String(cap))
  const [shipping, setShipping] = useState('')
  const [reference, setReference] = useState('')
  const [refundedOn, setRefundedOn] = useState(dayKey(nowMs()))
  const [note, setNote] = useState('')
  const value = Number(amount)
  const invalid = !Number.isFinite(value) || value <= 0 || value > cap
  const split = returnRefundSplit(order, ret, invalid ? 0 : value, Number(shipping) || 0)
  const total = split.items + split.shipping
  const proof = viaGateway ? null : returnRefundProofBlocker({ method: 'manual', reference, refundedOn })
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Refund ${ret.code}?`}
      description={
        viaGateway
          ? 'Midtrans sends the money back to the payment the shopper used. The return closes once Midtrans confirms.'
          : 'Send the money first, then record the transfer. The shopper sees the reference and date.'
      }
      confirmLabel={invalid ? 'Refund' : `Refund ${fmtIdr(total)}`}
      confirmDisabled={invalid || !!proof}
      onConfirm={() => {
        // The dialog closes on confirm; a gateway refusal comes back as a toast with its reason and
        // stays on the return's page.
        s.dispatchAsync({
          type: 'returns/refund',
          id: ret.id,
          amount: value,
          note: note.trim(),
          ...(split.shipping > 0 && { shippingCost: split.shipping }),
          ...(!viaGateway && { method: 'manual' as const, reference: reference.trim(), refundedOn }),
        })
          .then(() =>
            toast(`${fmtIdr(total)} refunded`, {
              tone: 'success',
              description: `${ret.code} · ${order.code}`,
            }),
          )
          .catch((err: unknown) =>
            toast('Not refunded', { tone: 'danger', description: (err as Error).message }),
          )
        onOpenChange(false)
      }}
    >
      <div className="space-y-3">
        <FormField
          label="Amount for the items"
          required
          hint={`Up to ${fmtIdr(cap)}: what the items cost after discounts`}
          error={invalid && amount ? `Enter an amount between Rp 1 and ${fmtIdr(cap)}.` : undefined}
          htmlFor="return-refund-amount"
        >
          <Input
            id="return-refund-amount"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
          />
        </FormField>
        {brandPays ? (
          <FormField
            label="Return shipping"
            hint="Optional. The store pays return shipping for this reason (PP 80/2019 Pasal 69), so add what the shopper paid the courier."
            htmlFor="return-refund-shipping"
          >
            <Input
              id="return-refund-shipping"
              variant="soft"
              inputMode="numeric"
              inputClassName="tabular-nums"
              value={shipping}
              onChange={(e) => setShipping(e.target.value.replace(/[^\d]/g, ''))}
            />
          </FormField>
        ) : (
          <p className="text-xs text-muted">The shopper pays return shipping for a change of mind or fit.</p>
        )}
        {!viaGateway && (
          <div className="gap-3 sm:grid-cols-2 grid grid-cols-1">
            <FormField label="Transfer reference" required htmlFor="return-refund-reference">
              <Input
                id="return-refund-reference"
                variant="soft"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="BCA 0123456789"
              />
            </FormField>
            <FormField label="Sent on" required htmlFor="return-refund-date">
              <Input
                id="return-refund-date"
                variant="soft"
                type="date"
                value={refundedOn}
                onChange={(e) => setRefundedOn(e.target.value)}
              />
            </FormField>
          </div>
        )}
        <FormField label="Note" hint="Optional" htmlFor="return-refund-note">
          <Textarea
            id="return-refund-note"
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
