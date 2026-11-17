import {
  fmtIdr,
  newId,
  nowMs,
  returnRefundCap,
  returnRequestBlocker,
  returnWindowDays,
  returnableQty,
} from '@rc/fixtures'
import type { Order, OrderReturn, ReturnReason } from '@rc/types'
import { RETURN_REASON_LABEL } from '@rc/types'
import { ConfirmDialog, FormField, Input, NativeSelect, Switch, Textarea, toast } from '@rc/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'

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

function RefundForm({ ret, order, onOpenChange }: Omit<Open, 'open'> & { ret: OrderReturn; order: Order }) {
  const { dispatch } = useScoped()
  const cap = returnRefundCap(order, ret)
  const [amount, setAmount] = useState(String(cap))
  const [note, setNote] = useState('')
  const value = Number(amount)
  const invalid = !Number.isFinite(value) || value <= 0 || value > cap
  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Refund ${ret.code}?`}
      description="The money goes back through the order's payment method. Shipping is not part of a return."
      confirmLabel={invalid ? 'Refund' : `Refund ${fmtIdr(value)}`}
      confirmDisabled={invalid}
      onConfirm={() => {
        dispatch({ type: 'returns/refund', id: ret.id, amount: value, note: note.trim() })
        toast(`${fmtIdr(value)} refunded`, { tone: 'success', description: `${ret.code} · ${order.code}` })
        onOpenChange(false)
      }}
    >
      <div className="space-y-3">
        <FormField
          label="Amount"
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
