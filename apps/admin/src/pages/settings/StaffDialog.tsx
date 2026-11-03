import { ApiError, type IssuedStaff } from '@rc/api'
import { ROLE_LABEL, type Role, type User } from '@rc/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  NativeSelect,
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { api } from '../../lib/api'
import { useStore } from '../../state/store'
import { useScoped } from '../../state/scoped'
import { ROLES } from './lib'

/** Adds a staff member, or edits one. A new person's temporary password goes to onIssued. */
export function StaffDialog({
  person,
  onClose,
  onIssued,
}: {
  person: User | null
  onClose: () => void
  onIssued: (issued: IssuedStaff) => void
}) {
  const s = useScoped()
  const { mergeUser } = useStore()
  const platform = s.user.role === 'platform_admin'
  const self = person?.id === s.user.id
  const [name, setName] = useState(person?.name ?? '')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState(person?.title ?? '')
  const [role, setRole] = useState<Role>(person?.role ?? 'marketing')
  const [tenantIds, setTenantIds] = useState<string[]>(person?.tenantIds ?? [s.tenant.id])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const brands = s.state.tenants.filter((t) => platform || s.user.tenantIds.includes(t.id))
  const roles = ROLES.filter((r) => platform || r !== 'platform_admin')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const input = { name, title, role, tenantIds: role === 'platform_admin' ? [] : tenantIds }
    try {
      if (person) {
        const { user } = await api.staff.update(person.id, input)
        mergeUser(user)
        toast('Staff member updated', { tone: 'success', description: user.name })
      } else {
        const issued = await api.staff.create({ ...input, email })
        mergeUser(issued.user)
        onIssued(issued)
      }
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>{person ? `Edit ${person.name}` : 'Add staff'}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 gap-4 grid grid-cols-1">
            <FormField label="Full name" htmlFor="staff-name" required>
              <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            {!person && (
              <FormField
                label="Work email"
                htmlFor="staff-email"
                required
                hint="We email them an invitation to choose a password. It cannot change later."
              >
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
            )}
            <FormField label="Job title" htmlFor="staff-title">
              <Input id="staff-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField
              label="Role"
              htmlFor="staff-role"
              hint={
                self
                  ? 'Another admin must change your own role and brands.'
                  : role === 'sales'
                    ? 'A sales agent also needs a seller profile in Sellers to use the seller app.'
                    : undefined
              }
            >
              <NativeSelect
                id="staff-role"
                value={role}
                disabled={self}
                onChange={(e) => setRole(e.target.value as Role)}
                options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
            </FormField>
            {role !== 'platform_admin' && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Brands</legend>
                <div className="space-y-1">
                  {brands.map((t) => (
                    <label
                      key={t.id}
                      className="min-h-11 gap-3 rounded-xl px-2 text-sm flex items-center hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-accent-strong"
                        disabled={self}
                        checked={tenantIds.includes(t.id)}
                        onChange={(e) =>
                          setTenantIds((ids) =>
                            e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                          )
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {person ? 'Save changes' : 'Add staff'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
