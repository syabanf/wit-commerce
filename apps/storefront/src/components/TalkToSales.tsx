import { newId, nextCode, nowIso } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { CircleCheck } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { PHONE_PATTERN } from '../lib/checkout'
import { useShop } from '../state/shop'
import { useStore } from '../state/store'
import { Button, Field, describedBy, inputClass } from './ui'
import { firstName } from '../lib/paths'

type Errors = Partial<Record<'name' | 'company' | 'phone', string>>

/** Talk to sales: saves a new lead for the sales team, attributed to the referring seller. */
export function TalkToSalesForm({ product, onDone }: { product: Product | null; onDone?: () => void }) {
  const { state } = useStore()
  const { tenant, referral, customer, send } = useShop()
  const uid = useId()
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    company: '',
    phone: customer?.phone ?? '',
    note: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [sentCode, setSentCode] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    if (!form.name.trim()) next.name = 'Enter your name so the team knows who to call.'
    if (!form.company.trim()) next.company = 'Enter your company name, or write "Personal".'
    if (!PHONE_PATTERN.test(form.phone.trim()))
      next.phone = 'Enter a phone number with 9 to 16 digits, such as +62 812 3456 7890.'
    setErrors(next)
    if (Object.keys(next).length) return
    const at = nowIso()
    const code = nextCode(
      state.leads.map((l) => l.code),
      'LD-',
      3,
    )
    send({
      type: 'leads/save',
      lead: {
        id: newId('lead'),
        tenantId: tenant.id,
        code,
        name: form.name.trim(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        productId: product?.id ?? null,
        value: product?.price ?? 0,
        stage: 'new',
        source: 'talk_to_sales',
        sellerId: referral?.id ?? null,
        customerId: customer?.id ?? null,
        note: form.note.trim(),
        createdAt: at,
        updatedAt: at,
        lostReason: null,
      },
    })
    setSentCode(code)
  }

  if (sentCode)
    return (
      <div role="status" className="gap-3 flex flex-col items-start">
        <span className="size-12 flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]">
          <CircleCheck className="size-6" aria-hidden="true" />
        </span>
        <h3 className="sf-display text-xl font-bold">Thank you, {firstName(form.name.trim())}.</h3>
        <p className="text-sm text-[color:var(--sf-muted)]">
          {referral ? `${referral.name} will call you` : 'Our sales team will call you'} on{' '}
          {form.phone.trim()} within one working day{product ? ` about ${product.name}` : ''}. Your reference
          is {sentCode}.
        </p>
        {onDone && (
          <Button variant="outline" onClick={onDone}>
            Close
          </Button>
        )}
      </div>
    )

  const field = (key: keyof typeof form) => ({
    id: `${uid}-${key}`,
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  return (
    <form onSubmit={submit} noValidate className="gap-4 sm:grid-cols-2 grid grid-cols-1">
      <Field id={`${uid}-name`} label="Your name" error={errors.name}>
        <input
          {...field('name')}
          autoComplete="name"
          className={inputClass}
          {...describedBy(`${uid}-name`, errors.name)}
        />
      </Field>
      <Field id={`${uid}-company`} label="Company" error={errors.company}>
        <input
          {...field('company')}
          autoComplete="organization"
          className={inputClass}
          {...describedBy(`${uid}-company`, errors.company)}
        />
      </Field>
      <Field id={`${uid}-phone`} label="Phone or WhatsApp" error={errors.phone} className="sm:col-span-2">
        <input
          {...field('phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+62 812 3456 7890"
          className={inputClass}
          {...describedBy(`${uid}-phone`, errors.phone)}
        />
      </Field>
      <Field
        id={`${uid}-note`}
        label="What do you need?"
        hint="Quantity, timeline or site details help us prepare."
        className="sm:col-span-2"
      >
        <textarea
          {...field('note')}
          rows={3}
          className={`${inputClass} py-3 h-auto`}
          {...describedBy(`${uid}-note`, null, 'hint')}
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" full>
          Send to sales
        </Button>
      </div>
    </form>
  )
}
