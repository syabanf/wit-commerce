import { newId, nextCode, nowIso } from '@rc/fixtures'
import type { Lead, LeadSource } from '@rc/types'
import { LEAD_SOURCE_LABEL } from '@rc/types'
import { Button, FormField, Input, NativeSelect, Textarea, toast } from '@rc/ui'
import { Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { ProductPicker } from '../../components/ProductPicker'
import { useSellerScope } from '../../state/scope'

const SOURCES = Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => ({ value, label }))

export function NewLeadSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (lead: Lead) => void
}) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New lead"
      description="Log someone you met or chatted with. The lead is yours and shows under Open."
    >
      <NewLeadForm onCreated={onCreated} />
    </ActionSheet>
  )
}

function NewLeadForm({ onCreated }: { onCreated: (lead: Lead) => void }) {
  const { seller, tenant, products, leadCodes, dispatch } = useSellerScope()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [productId, setProductId] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [source, setSource] = useState<LeadSource>('whatsapp')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  const amount = value.trim() === '' ? 0 : Number(value.replace(/[.,\s]/g, ''))
  const errors = {
    name: name.trim() ? undefined : 'Enter the contact’s name.',
    phone:
      phone.replace(/\D/g, '').length >= 8
        ? undefined
        : 'Enter a phone number with at least 8 digits, so you can call or WhatsApp them.',
    value:
      Number.isFinite(amount) && amount >= 0 ? undefined : 'Enter the deal value in rupiah, digits only.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.name || errors.phone || errors.value) {
      toast('Lead not saved', { tone: 'danger', description: 'Fill in the highlighted fields.' })
      return
    }
    const at = nowIso()
    const lead: Lead = {
      id: newId('lead'),
      tenantId: tenant.id,
      code: nextCode(leadCodes, 'LD-', 3),
      name: name.trim(),
      company: company.trim(),
      phone: phone.trim(),
      productId,
      value: amount,
      stage: 'new',
      source,
      sellerId: seller.id,
      customerId: null,
      note: note.trim(),
      createdAt: at,
      updatedAt: at,
      lostReason: null,
    }
    dispatch({ type: 'leads/save', lead })
    toast('Lead created', { tone: 'success', description: `${lead.code} · ${lead.company || lead.name}` })
    onCreated(lead)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField label="Name" required error={show(errors.name)}>
        <Input
          variant="soft"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dewi Lestari"
        />
      </FormField>
      <FormField label="Company" hint="Leave empty for a private buyer.">
        <Input
          variant="soft"
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </FormField>
      <FormField label="Phone" required error={show(errors.phone)}>
        <Input
          variant="soft"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+62 812 0000 0000"
        />
      </FormField>
      <FormField label="Product">
        <ProductPicker products={products} value={productId} onChange={setProductId} />
      </FormField>
      <div className="gap-3 grid grid-cols-2">
        <FormField label="Deal value (Rp)" error={show(errors.value)}>
          <Input
            variant="soft"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
          />
        </FormField>
        <FormField label="Source">
          <NativeSelect
            variant="soft"
            options={SOURCES}
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
          />
        </FormField>
      </div>
      <FormField label="Note">
        <Textarea
          variant="soft"
          className="min-h-20"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What they need and when"
        />
      </FormField>
      <Button type="submit" size="lg" className="h-14 w-full">
        <Plus />
        Create lead
      </Button>
    </form>
  )
}
