import { fmtIdr, newId, paymentFee, paymentTypeDisableBlocker } from '@rc/fixtures'
import { PAYMENT_METHOD_LABEL, type PaymentMethod, type PaymentType } from '@rc/types'
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
  NativeSelect,
  Switch,
  Textarea,
} from '@rc/ui'
import { type FormEvent, useMemo, useState } from 'react'
import { useScoped } from '../../state/scoped'
import { PROVIDERS, SAMPLE_ORDER } from './lib'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: PaymentType | null
  onSaved: (t: PaymentType) => void
}

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABEL[m],
}))

const digitsOnly = (value: string) => value.replace(/[^\d]/g, '')

export function PaymentTypeDialog({ open, onOpenChange, editing, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <PaymentTypeForm
            editing={editing}
            onDone={(saved) => {
              onOpenChange(false)
              if (saved) onSaved(saved)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PaymentTypeForm({
  editing,
  onDone,
}: {
  editing: PaymentType | null
  onDone: (saved: PaymentType | null) => void
}) {
  const s = useScoped()
  const [name, setName] = useState(editing?.name ?? '')
  const [method, setMethod] = useState<PaymentMethod>(editing?.method ?? 'qris')
  const [provider, setProvider] = useState<string | null>(editing?.provider ?? null)
  const [extraProviders, setExtraProviders] = useState<string[]>([])
  const [feePercent, setFeePercent] = useState(editing ? String(editing.feePercent) : '')
  const [feeFixed, setFeeFixed] = useState(editing?.feeFixed ? String(editing.feeFixed) : '')
  const [minAmount, setMinAmount] = useState(editing?.minAmount ? String(editing.minAmount) : '')
  const [maxAmount, setMaxAmount] = useState(editing?.maxAmount ? String(editing.maxAmount) : '')
  const [instructions, setInstructions] = useState(editing?.instructions ?? '')
  const [enabled, setEnabled] = useState(editing?.enabled ?? true)
  const [tried, setTried] = useState(false)
  const [id] = useState(() => editing?.id ?? newId('pay'))

  const providers = useMemo(
    () => [...new Set([...PROVIDERS, ...s.paymentTypes.map((t) => t.provider), ...extraProviders])],
    [s.paymentTypes, extraProviders],
  )
  // Turning off the last payment type that is on would close checkout.
  const offBlocker = editing?.enabled ? paymentTypeDisableBlocker(editing, s.paymentTypes) : null

  const percent = Number(feePercent || 0)
  const fixed = Number(feeFixed || 0)
  const min = Number(minAmount || 0)
  const max = maxAmount ? Number(maxAmount) : null
  const taken = s.paymentTypes.some(
    (t) => t.id !== editing?.id && t.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const errors = {
    name: !name.trim()
      ? 'Enter the name shoppers see, such as QRIS or BCA virtual account.'
      : taken
        ? 'Another payment type already has this name.'
        : null,
    provider: provider ? null : 'Choose the gateway that processes it.',
    feePercent:
      Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? null
        : 'Enter a fee between 0 and 100 percent, such as 0.7.',
    maxAmount: max !== null && max <= min ? 'Set the maximum above the minimum, or leave it empty.' : null,
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean) || !provider) return
    const paymentType: PaymentType = {
      id,
      tenantId: s.tenantId,
      name: name.trim(),
      method,
      provider,
      enabled: offBlocker ? true : enabled,
      feePercent: percent,
      feeFixed: fixed,
      minAmount: min,
      maxAmount: max,
      instructions: instructions.trim(),
      sort: editing?.sort ?? Math.max(-1, ...s.paymentTypes.map((t) => t.sort)) + 1,
    }
    s.dispatch({ type: 'paymentTypes/save', paymentType })
    onDone(paymentType)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New payment type'}</DialogTitle>
        <DialogDescription>
          Shoppers see the payment types that are on and whose limits fit the order total, in the order of
          this list.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField label="Name" required error={show(errors.name)} htmlFor="pay-name">
          <Input id="pay-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="QRIS" />
        </FormField>
        <FormField
          label="Method"
          htmlFor="pay-method"
          hint="Decides the icon and the steps shoppers follow at checkout."
        >
          <NativeSelect
            id="pay-method"
            options={METHOD_OPTIONS}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          />
        </FormField>
        <FormField
          label="Provider"
          required
          error={show(errors.provider)}
          htmlFor="pay-provider"
          className="sm:col-span-2"
        >
          <Combobox
            id="pay-provider"
            items={providers}
            getKey={(p) => p}
            getLabel={(p) => p}
            getDescription={(p) => {
              const count = s.paymentTypes.filter((t) => t.provider === p).length
              return count ? `Processes ${count} payment ${count === 1 ? 'type' : 'types'}` : undefined
            }}
            invalid={!!show(errors.provider)}
            value={provider}
            onChange={setProvider}
            placeholder="Choose the gateway"
            searchPlaceholder="Search providers"
            createLabel={(q) => `Add provider "${q.trim()}"`}
            onCreate={(q) => {
              const next = q.trim()
              if (!next) return
              setExtraProviders((list) => [...list, next])
              setProvider(next)
            }}
          />
        </FormField>
        <FormField
          label="Fee (%)"
          error={show(errors.feePercent)}
          hint="Percent of the order the gateway keeps."
          htmlFor="pay-fee-pct"
        >
          <Input
            id="pay-fee-pct"
            inputMode="decimal"
            inputClassName="tabular-nums"
            value={feePercent}
            placeholder="0"
            onChange={(e) => setFeePercent(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
          />
        </FormField>
        <FormField label="Fixed fee (Rp)" hint="Charged on every payment." htmlFor="pay-fee-fixed">
          <Input
            id="pay-fee-fixed"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={feeFixed}
            placeholder="0"
            onChange={(e) => setFeeFixed(digitsOnly(e.target.value))}
          />
        </FormField>
        <FormField label="Minimum order (Rp)" hint="Smaller orders do not see it." htmlFor="pay-min">
          <Input
            id="pay-min"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={minAmount}
            placeholder="0"
            onChange={(e) => setMinAmount(digitsOnly(e.target.value))}
          />
        </FormField>
        <FormField
          label="Maximum order (Rp)"
          error={show(errors.maxAmount)}
          hint="Optional. Empty means no maximum."
          htmlFor="pay-max"
        >
          <Input
            id="pay-max"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={maxAmount}
            onChange={(e) => setMaxAmount(digitsOnly(e.target.value))}
          />
        </FormField>
        <p className="rounded-2xl p-3 text-sm sm:col-span-2 bg-surface-2">
          On a {fmtIdr(SAMPLE_ORDER)} order the gateway keeps{' '}
          <span className="font-semibold tabular-nums">
            {fmtIdr(
              paymentFee(
                { feePercent: Number.isFinite(percent) ? percent : 0, feeFixed: fixed },
                SAMPLE_ORDER,
              ),
            )}
          </span>
          .
        </p>
        <FormField
          label="Instructions for the shopper"
          hint="Optional. Shown after they pick this payment type."
          htmlFor="pay-instructions"
          className="sm:col-span-2"
        >
          <Textarea
            id="pay-instructions"
            className="min-h-20"
            value={instructions}
            placeholder="Scan the code with any banking or e-wallet app. It expires in 15 minutes."
            onChange={(e) => setInstructions(e.target.value)}
          />
        </FormField>
        <label className="gap-3 rounded-2xl p-3 sm:col-span-2 flex items-center justify-between bg-surface-2">
          <span className="min-w-0">
            <span className="text-sm font-medium block">On at checkout</span>
            <span className="text-xs block text-muted">
              {offBlocker ?? 'Shoppers can pick it when the order fits its limits.'}
            </span>
          </span>
          <Switch
            checked={offBlocker ? true : enabled}
            disabled={!!offBlocker}
            onCheckedChange={setEnabled}
            aria-label="On at checkout"
          />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save payment type' : 'Create payment type'}</Button>
      </DialogFooter>
    </form>
  )
}
