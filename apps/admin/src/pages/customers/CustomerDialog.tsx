import { newId, nowIso } from '@rc/fixtures'
import type { Channel, Customer } from '@rc/types'
import { CHANNEL_LABEL } from '@rc/types'
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  MultiCombobox,
  NativeSelect,
  toast,
} from '@rc/ui'
import { type FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { SellerPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { EMAIL_PATTERN, customerCities, nextCustomerCode, nextCustomerColor } from './lib'

const SOURCE_OPTIONS = (Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => ({
  value: c,
  label: CHANNEL_LABEL[c],
}))

/** Create or edit a customer. A new customer opens on its own page. */
export function CustomerDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Customer | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && <CustomerForm editing={editing} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CustomerForm({ editing, onClose }: { editing: Customer | null; onClose: () => void }) {
  const s = useScoped()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => ({
    name: editing?.name ?? '',
    email: editing?.email ?? '',
    phone: editing?.phone ?? '',
    city: editing?.city ?? null,
    birthday: editing?.birthday ?? '',
    tags: editing?.tags ?? [],
    sellerId: editing?.sellerId ?? null,
    source: editing?.source ?? ('pos' as Channel),
  }))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))

  const cities = useMemo(() => {
    const list = customerCities(s.customers)
    return draft.city && !list.includes(draft.city) ? [draft.city, ...list] : list
  }, [s.customers, draft.city])
  const tags = useMemo(
    () => [...new Set([...s.customers.flatMap((c) => c.tags), ...draft.tags])].sort(),
    [s.customers, draft.tags],
  )

  const name = draft.name.trim()
  const email = draft.email.trim()
  const phone = draft.phone.trim()
  const emailOwner = email
    ? s.customers.find((c) => c.id !== editing?.id && c.email.toLowerCase() === email.toLowerCase())
    : undefined
  const errors = {
    name: name ? undefined : "Enter the customer's full name.",
    email:
      email && !EMAIL_PATTERN.test(email)
        ? 'Enter an address such as nama@mail.id.'
        : emailOwner
          ? `${emailOwner.name} (${emailOwner.code}) already uses this address.`
          : undefined,
    contact:
      email || phone ? undefined : 'Enter an email address or a phone number so the team can reach them.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const fields = {
      name,
      email,
      phone,
      city: draft.city ?? '',
      birthday: draft.birthday || null,
      tags: draft.tags,
      sellerId: draft.sellerId,
    }
    if (editing) {
      s.dispatch({ type: 'customers/save', customer: { ...editing, ...fields } })
      toast('Customer updated', { tone: 'success', description: `${name} · ${editing.code}` })
      onClose()
      return
    }
    const customer: Customer = {
      id: newId('cus'),
      tenantId: s.tenantId,
      code: nextCustomerCode(s.customers, s.tenant),
      ...fields,
      source: draft.source,
      stage: 'registered',
      tier: 'member',
      points: 0,
      interests: [],
      createdAt: nowIso(),
      color: nextCustomerColor(s.customers, s.tenant.brand.colors.primary),
    }
    s.dispatch({ type: 'customers/save', customer })
    toast('Customer added', { tone: 'success', description: `${name} · ${customer.code}` })
    navigate(paths.customer(customer.id), { replace: true })
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New customer'}</DialogTitle>
        <DialogDescription>
          {editing
            ? `${editing.code} · changes show on the Customer 360 and in segments right away.`
            : 'The customer joins as a registered member and can be targeted by segments and campaigns.'}
        </DialogDescription>
      </DialogHeader>

      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField
          label="Full name"
          required
          htmlFor="customer-name"
          error={show(errors.name)}
          className="sm:col-span-2"
        >
          <Input
            id="customer-name"
            autoFocus
            value={draft.name}
            placeholder="Rina Wijaya"
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="Email" htmlFor="customer-email" error={show(errors.email ?? errors.contact)}>
          <Input
            id="customer-email"
            type="email"
            value={draft.email}
            placeholder="rina.wijaya@mail.id"
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
        <FormField label="Phone" htmlFor="customer-phone" hint="Used for WhatsApp messages.">
          <Input
            id="customer-phone"
            type="tel"
            value={draft.phone}
            placeholder="+62 812 3456 7890"
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <FormField label="City" htmlFor="customer-city">
          <Combobox
            id="customer-city"
            items={cities}
            value={draft.city}
            onChange={(city) => set({ city })}
            getKey={(c) => c}
            getLabel={(c) => c}
            clearable
            placeholder="Select city"
            searchPlaceholder="Search or type a city"
            onCreate={(city) => set({ city: city.trim() || null })}
            createLabel={(city) => `Use "${city}"`}
          />
        </FormField>
        <FormField
          label="Birthday"
          htmlFor="customer-birthday"
          hint="Birthday automations send on this date."
        >
          <Input
            id="customer-birthday"
            type="date"
            value={draft.birthday}
            onChange={(e) => set({ birthday: e.target.value })}
          />
        </FormField>
        <FormField label="Tags" htmlFor="customer-tags" hint="Pick a tag or type a new one.">
          <MultiCombobox
            id="customer-tags"
            items={tags}
            values={draft.tags}
            onChange={(next) => set({ tags: next })}
            getKey={(t) => t}
            getLabel={(t) => t}
            placeholder="Add tags"
            searchPlaceholder="Search or type a tag"
            onCreate={(tag) => {
              const clean = tag.trim().toLowerCase()
              if (clean && !draft.tags.includes(clean)) set({ tags: [...draft.tags, clean] })
            }}
            createLabel={(tag) => `Add "${tag.trim().toLowerCase()}"`}
          />
        </FormField>
        <FormField
          label="Assigned seller"
          htmlFor="customer-seller"
          hint="The seller sees this customer in their book."
        >
          <SellerPicker
            id="customer-seller"
            value={draft.sellerId}
            onChange={(sellerId) => set({ sellerId })}
            clearable
            placeholder="No seller"
          />
        </FormField>
        {!editing && (
          <FormField
            label="Source"
            htmlFor="customer-source"
            hint="Where you met this customer."
            className="sm:col-span-2"
          >
            <NativeSelect
              id="customer-source"
              options={SOURCE_OPTIONS}
              value={draft.source}
              onChange={(e) => set({ source: e.target.value as Channel })}
            />
          </FormField>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Add customer'}</Button>
      </DialogFooter>
    </form>
  )
}
