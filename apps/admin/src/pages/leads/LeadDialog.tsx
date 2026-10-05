import { fmtIdr, newId, nextCode, nowIso } from '@rc/fixtures'
import type { Lead, LeadSource } from '@rc/types'
import { LEAD_SOURCE_LABEL } from '@rc/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  NativeSelect,
  Textarea,
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { ProductPicker, SellerPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { sellerIdsOf } from './lib'

const SOURCE_OPTIONS = (Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => ({
  value: s,
  label: LEAD_SOURCE_LABEL[s],
}))

/** Create or edit a lead. A new lead opens on its own page. */
export function LeadDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Lead | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && <LeadForm editing={editing} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function LeadForm({ editing, onClose }: { editing: Lead | null; onClose: () => void }) {
  const s = useScoped()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => ({
    name: editing?.name ?? '',
    company: editing?.company ?? '',
    phone: editing?.phone ?? '',
    productId: editing?.productId ?? null,
    value: editing ? String(editing.value) : '',
    source: editing?.source ?? ('talk_to_sales' as LeadSource),
    // A sales agent's own leads start assigned to them.
    sellerId: editing ? editing.sellerId : (sellerIdsOf(s.sellers, s.user.id)[0] ?? null),
    note: editing?.note ?? '',
  }))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))

  const name = draft.name.trim()
  const value = Number(draft.value || '0')
  const errors = {
    name: name ? undefined : 'Enter the contact name.',
    phone: draft.phone.trim() ? undefined : 'Enter a phone number so the seller can follow up.',
    value:
      Number.isFinite(value) && value >= 0 ? undefined : 'Enter the deal value in rupiah, or leave it empty.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const fields = {
      name,
      company: draft.company.trim(),
      phone: draft.phone.trim(),
      productId: draft.productId,
      value,
      source: draft.source,
      sellerId: draft.sellerId,
      note: draft.note.trim(),
    }
    if (editing) {
      s.dispatch({ type: 'leads/save', lead: { ...editing, ...fields } })
      toast('Lead updated', { tone: 'success', description: `${editing.code} · ${fields.company || name}` })
      onClose()
      return
    }
    const at = nowIso()
    const lead: Lead = {
      id: newId('lead'),
      tenantId: s.tenantId,
      code: nextCode(
        s.state.leads.map((l) => l.code),
        'LD-',
        3,
      ),
      ...fields,
      stage: 'new',
      customerId: null,
      createdAt: at,
      updatedAt: at,
      lostReason: null,
    }
    s.dispatch({ type: 'leads/save', lead })
    toast('Lead added', {
      tone: 'success',
      description: `${lead.code} · ${lead.company || name}${lead.sellerId ? ` · ${s.sellerName(lead.sellerId)}` : ''}`,
    })
    navigate(paths.lead(lead.id), { replace: true })
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.code}` : 'New lead'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Changes reset the last touched time on the board.'
            : 'The lead lands in the New column. The assigned seller sees it in their pipeline.'}
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField label="Contact name" required htmlFor="lead-name" error={show(errors.name)}>
          <Input
            id="lead-name"
            autoFocus
            value={draft.name}
            placeholder="Budi Hartono"
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="Company" htmlFor="lead-company" hint="Leave empty for a personal buyer.">
          <Input
            id="lead-company"
            value={draft.company}
            placeholder="PT Presisi Logam"
            onChange={(e) => set({ company: e.target.value })}
          />
        </FormField>
        <FormField label="Phone" required htmlFor="lead-phone" error={show(errors.phone)}>
          <Input
            id="lead-phone"
            type="tel"
            value={draft.phone}
            placeholder="+62 812 3456 7890"
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <FormField label="Source" htmlFor="lead-source">
          <NativeSelect
            id="lead-source"
            options={SOURCE_OPTIONS}
            value={draft.source}
            onChange={(e) => set({ source: e.target.value as LeadSource })}
          />
        </FormField>
        <FormField label="Product" htmlFor="lead-product" hint="Talk to sales products are included.">
          <ProductPicker
            id="lead-product"
            value={draft.productId}
            onChange={(productId) => set({ productId })}
            clearable
            placeholder="No product yet"
          />
        </FormField>
        <FormField
          label="Deal value (Rp)"
          htmlFor="lead-value"
          error={show(errors.value)}
          hint={value > 0 ? fmtIdr(value) : 'Needed before the lead can be marked won.'}
        >
          <Input
            id="lead-value"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.value}
            placeholder="0"
            onChange={(e) => set({ value: e.target.value.replace(/[^\d]/g, '') })}
          />
        </FormField>
        <FormField label="Seller" htmlFor="lead-seller" className="sm:col-span-2">
          <SellerPicker
            id="lead-seller"
            value={draft.sellerId}
            onChange={(sellerId) => set({ sellerId })}
            clearable
            placeholder="Unassigned"
          />
        </FormField>
        <FormField label="Note" htmlFor="lead-note" className="sm:col-span-2">
          <Textarea
            id="lead-note"
            className="min-h-20"
            value={draft.note}
            placeholder="What they need, budget, timeline"
            onChange={(e) => set({ note: e.target.value })}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Add lead'}</Button>
      </DialogFooter>
    </form>
  )
}
