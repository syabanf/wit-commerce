import { type FormEvent, useState } from 'react'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'
import { FormField } from './form-field'
import { Input } from './input'

export type ChangePasswordDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves to an error sentence, or null once the password changed. */
  onChange: (currentPassword: string, newPassword: string) => Promise<string | null>
}

/** Asks for the current password and a new one, entered twice. */
export function ChangePasswordDialog({ open, onOpenChange, onChange }: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <PasswordForm onChange={onChange} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PasswordForm({
  onChange,
  onClose,
}: Pick<ChangePasswordDialogProps, 'onChange'> & { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 10) return setError('Use a password of 10 or more characters.')
    if (next !== repeat) return setError('The two new passwords do not match.')
    setBusy(true)
    const failed = await onChange(current, next)
    setBusy(false)
    if (failed) setError(failed)
    else onClose()
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>Other devices stay signed in for up to 12 hours.</DialogDescription>
      </DialogHeader>
      <div className="mt-4 gap-4 grid grid-cols-1">
        <FormField label="Current password" htmlFor="password-current">
          <Input
            id="password-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </FormField>
        <FormField label="New password" htmlFor="password-new" hint="10 or more characters.">
          <Input
            id="password-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </FormField>
        <FormField label="New password again" htmlFor="password-repeat" error={error || undefined}>
          <Input
            id="password-repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </FormField>
      </div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Change password
        </Button>
      </DialogFooter>
    </form>
  )
}
