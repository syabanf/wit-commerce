import { customerEraseBlocker } from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { ConfirmDialog, FormField, Textarea, toast } from '@rc/ui'
import { useState } from 'react'
import { useScoped } from '../../state/scoped'

type Props = { customer: Customer; open: boolean; onOpenChange: (open: boolean) => void }

/**
 * Erases a customer's personal data (UU PDP Pasal 43 to 45). The server checks every order; the
 * console checks the ones it holds, so a known blocker shows before the click.
 */
export function EraseCustomerDialog({ customer, open, onOpenChange }: Props) {
  const s = useScoped()
  const [note, setNote] = useState('')
  if (!open) return null
  const mine = <T extends { customerId: string }>(x: T) => x.customerId === customer.id
  const blocker = customerEraseBlocker(customer, s.orders.filter(mine), s.returns.filter(mine))

  const erase = () => {
    s.dispatchAsync({ type: 'customers/erase', id: customer.id, note: note.trim() })
      .then(() =>
        toast('Customer data erased', {
          tone: 'success',
          description: `${customer.code} · name, contact details and notes replaced`,
        }),
      )
      .catch((err: Error) => toast('The data was not erased', { tone: 'danger', description: err.message }))
    onOpenChange(false)
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={`Erase ${customer.name}'s personal data?`}
      description="Their name, email, phone, city, birthday, tags and every note, lead and ticket text become placeholders, their account and email links stop working, and marketing stops. Orders keep their amounts, items and dates for the 10-year retention duty. This cannot be undone."
      destructive
      confirmLabel="Erase personal data"
      confirmDisabled={!!blocker}
      onConfirm={erase}
    >
      {blocker ? (
        <p className="text-sm text-danger">{blocker}</p>
      ) : (
        <FormField
          label="Reason"
          htmlFor="erase-note"
          hint="Kept in the privacy request log, without personal data."
        >
          <Textarea
            id="erase-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Asked by email on 5 October"
          />
        </FormField>
      )}
    </ConfirmDialog>
  )
}
