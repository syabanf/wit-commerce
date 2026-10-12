import { nowIso } from '@rc/fixtures'
import { AGENT_KIND_LABEL, type AgentKind, type AgentPolicy } from '@rc/types'
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Switch,
} from '@rc/ui'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useScoped } from '../../state/scoped'
import { AGENT_KINDS } from './lib'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: AgentPolicy
  onSaved: (policy: AgentPolicy) => void
}

const digitsOnly = (value: string) => value.replace(/[^\d]/g, '')
const toggle = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

export function AgentPolicyDialog({ open, onOpenChange, policy, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <AgentPolicyForm
            policy={policy}
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

function AgentPolicyForm({
  policy,
  onDone,
}: {
  policy: AgentPolicy
  onDone: (saved: AgentPolicy | null) => void
}) {
  const s = useScoped()
  const payable = s.paymentTypes.filter((t) => t.enabled)
  const [enabled, setEnabled] = useState(policy.enabled)
  const [negotiation, setNegotiation] = useState(policy.negotiation)
  const [maxPct, setMaxPct] = useState(String(policy.maxAutoDiscountPct))
  const [kinds, setKinds] = useState<AgentKind[]>(policy.kinds)
  // A payment type switched off since the last save drops out of the list.
  const [paymentTypeIds, setPaymentTypeIds] = useState(
    policy.paymentTypeIds.filter((id) => payable.some((t) => t.id === id)),
  )
  const [tried, setTried] = useState(false)

  const pct = Number(maxPct)
  const errors = {
    maxPct:
      negotiation && (maxPct === '' || !Number.isInteger(pct) || pct < 0 || pct > 20)
        ? 'Enter a whole percentage from 0 to 20.'
        : null,
    kinds: enabled && !kinds.length ? 'Pick at least one kind of agent, or turn agents off.' : null,
    payment:
      enabled && !payable.length ? 'Turn on a payment type first. Agents cannot pay without one.' : null,
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const saved: AgentPolicy = {
      tenantId: s.tenantId,
      enabled,
      negotiation,
      maxAutoDiscountPct: negotiation ? pct : 0,
      paymentTypeIds,
      kinds: AGENT_KINDS.filter((k) => kinds.includes(k)),
      updatedAt: nowIso(),
    }
    s.dispatch({ type: 'agentPolicy/save', policy: saved })
    onDone(saved)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Agent policy</DialogTitle>
        <DialogDescription>
          Checkout reads these rules every time a buying agent tries to place an order for a shopper.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <SwitchRow
          label="Accept buying agents"
          hint={
            enabled
              ? 'Agents suggest and build carts. The shopper approves every payment.'
              : 'Agents get a polite refusal at checkout.'
          }
          checked={enabled}
          onChange={setEnabled}
        />
        <SwitchRow
          label="Allow negotiation"
          hint={negotiation ? 'Agents may ask for an extra discount.' : 'Agents pay the price on the page.'}
          checked={negotiation}
          onChange={setNegotiation}
        />
        <FormField
          label="Max auto discount (%)"
          htmlFor="agent-max-pct"
          error={show(errors.maxPct)}
          hint={negotiation ? 'The store grants up to this on its own.' : 'Turn on negotiation to set it.'}
        >
          <Input
            id="agent-max-pct"
            inputMode="numeric"
            inputClassName="tabular-nums"
            disabled={!negotiation}
            value={negotiation ? maxPct : '0'}
            onChange={(e) => setMaxPct(digitsOnly(e.target.value))}
          />
        </FormField>
        <ChipField label="Accepted agents" error={show(errors.kinds)} className="sm:col-span-2">
          {AGENT_KINDS.map((k) => (
            <Chip key={k} active={kinds.includes(k)} onClick={() => setKinds((list) => toggle(list, k))}>
              {AGENT_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipField>
        <ChipField
          label="Payment types agents may use"
          error={show(errors.payment)}
          hint={
            paymentTypeIds.length
              ? `Agents can pay with ${paymentTypeIds.length} of ${payable.length}.`
              : 'None picked: agents can use every payment type that is on.'
          }
          className="sm:col-span-2"
        >
          {payable.map((t) => (
            <Chip
              key={t.id}
              active={paymentTypeIds.includes(t.id)}
              onClick={() => setPaymentTypeIds((list) => toggle(list, t.id))}
            >
              {t.name}
            </Chip>
          ))}
        </ChipField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Save policy</Button>
      </DialogFooter>
    </form>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="gap-3 rounded-2xl p-3 flex items-center justify-between bg-surface-2">
      <span className="min-w-0">
        <span className="text-sm font-medium block">{label}</span>
        <span className="text-xs block text-muted">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

/** A labelled group of toggle chips; FormField wants a single control, so this one is a fieldset. */
function ChipField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-sm font-medium text-foreground">{label}</legend>
      <div className="gap-2 flex flex-wrap">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </fieldset>
  )
}
