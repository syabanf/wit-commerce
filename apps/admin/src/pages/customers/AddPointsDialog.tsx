import { fmtNumber } from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { ConfirmDialog, FormField, Input, Textarea, toast } from '@rc/ui'
import { useState } from 'react'
import { useScoped } from '../../state/scoped'

type Props = { customer: Customer; open: boolean; onOpenChange: (open: boolean) => void }

/** Adds or removes loyalty points by hand. A negative amount removes points, down to zero. */
export function AddPointsDialog({ customer, open, onOpenChange }: Props) {
  return open ? <AddPointsForm customer={customer} onOpenChange={onOpenChange} /> : null
}

function AddPointsForm({ customer, onOpenChange }: Omit<Props, 'open'>) {
  const { dispatch } = useScoped()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const points = Number(amount)
  const valid = amount !== '' && amount !== '-' && Number.isInteger(points) && points !== 0
  const belowZero = valid && customer.points + points < 0
  const error =
    !amount || amount === '-'
      ? undefined
      : !valid
        ? 'Enter a whole number other than zero.'
        : belowZero
          ? `${customer.name} has ${fmtNumber(customer.points)} points. Remove ${fmtNumber(customer.points)} or fewer.`
          : undefined
  const removing = points < 0

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Adjust points for ${customer.name}?`}
      description={`Balance now: ${fmtNumber(customer.points)} points. The change shows on the customer's timeline with your reason.`}
      confirmLabel={
        valid && !belowZero
          ? `${removing ? 'Remove' : 'Add'} ${fmtNumber(Math.abs(points))} points`
          : 'Add points'
      }
      confirmDisabled={!valid || belowZero || !reason.trim()}
      onConfirm={() => {
        dispatch({ type: 'customers/addPoints', id: customer.id, points, reason: reason.trim() })
        toast(removing ? 'Points removed' : 'Points added', {
          tone: 'success',
          description: `${customer.name} · ${points > 0 ? '+' : ''}${fmtNumber(points)} points, balance ${fmtNumber(customer.points + points)}`,
        })
        onOpenChange(false)
      }}
    >
      <div className="space-y-3">
        <FormField
          label="Points"
          required
          htmlFor="points-amount"
          hint="Use a minus sign to remove points, such as -200."
          error={error}
        >
          <Input
            id="points-amount"
            variant="soft"
            autoFocus
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={amount}
            placeholder="250"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''))}
          />
        </FormField>
        <FormField label="Reason" required htmlFor="points-reason">
          <Textarea
            id="points-reason"
            variant="soft"
            className="min-h-20"
            value={reason}
            placeholder="Goodwill for the late delivery of LARI-2609-0141"
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </div>
    </ConfirmDialog>
  )
}
