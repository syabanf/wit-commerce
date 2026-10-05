import { newId } from '@rc/fixtures'
import type { ModifierGroup, ModifierOption, ModifierSelection } from '@rc/types'
import { MODIFIER_SELECTION_LABEL } from '@rc/types'
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
  SegmentedControl,
  Switch,
} from '@rc/ui'
import { Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ProductsPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ModifierGroup | null
  onSaved: (g: ModifierGroup) => void
}

interface DraftOption {
  id: string
  name: string
  price: string
}

export function ModifierDialog({ open, onOpenChange, editing, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <ModifierForm
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

const toAmount = (value: string) => Number(value.replace(/[^\d]/g, '')) || 0

function ModifierForm({
  editing,
  onDone,
}: {
  editing: ModifierGroup | null
  onDone: (saved: ModifierGroup | null) => void
}) {
  const s = useScoped()
  const [name, setName] = useState(editing?.name ?? '')
  const [selection, setSelection] = useState<ModifierSelection>(editing?.selection ?? 'single')
  const [required, setRequired] = useState(editing?.required ?? false)
  const [maxChoices, setMaxChoices] = useState(String(editing?.maxChoices ?? 2))
  const [options, setOptions] = useState<DraftOption[]>(
    editing?.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: o.priceDelta ? String(o.priceDelta) : '',
    })) ?? [
      { id: newId('opt'), name: '', price: '' },
      { id: newId('opt'), name: '', price: '' },
    ],
  )
  const [productIds, setProductIds] = useState<string[]>(editing?.productIds ?? [])
  const [tried, setTried] = useState(false)

  const named = options.filter((o) => o.name.trim())
  const max = Number(maxChoices)
  const errors = {
    name: !name.trim() ? 'Enter a name for the group.' : null,
    options: named.length < 1 ? 'Add at least one option with a name.' : null,
    max:
      selection === 'multiple' && (!Number.isInteger(max) || max < 2 || max > named.length)
        ? `Allow between 2 and ${Math.max(2, named.length)} choices.`
        : null,
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)
  const setOption = (id: string, patch: Partial<DraftOption>) =>
    setOptions((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const group: ModifierGroup = {
      id: editing?.id ?? newId('mod'),
      tenantId: s.tenantId,
      name: name.trim(),
      selection,
      required,
      maxChoices: selection === 'single' ? 1 : max,
      options: named.map<ModifierOption>((o) => ({
        id: o.id,
        name: o.name.trim(),
        priceDelta: toAmount(o.price),
      })),
      productIds,
    }
    s.dispatch({ type: 'modifiers/save', group })
    onDone(group)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New modifier group'}</DialogTitle>
        <DialogDescription>
          Shoppers see the group under the variant picker. A priced option adds its amount to the item.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
          <FormField
            label="Group name"
            required
            error={show(errors.name)}
            htmlFor="mod-name"
            className="sm:col-span-2"
          >
            <Input
              id="mod-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gift wrap"
            />
          </FormField>
          <FormField label="Shopper picks">
            <SegmentedControl
              className="w-full"
              value={selection}
              onChange={(v) => setSelection(v as ModifierSelection)}
              options={(['single', 'multiple'] as const).map((v) => ({
                value: v,
                label: MODIFIER_SELECTION_LABEL[v],
              }))}
            />
          </FormField>
          {selection === 'multiple' && (
            <FormField label="Most choices" required error={show(errors.max)} htmlFor="mod-max">
              <Input
                id="mod-max"
                inputMode="numeric"
                value={maxChoices}
                onChange={(e) => setMaxChoices(e.target.value.replace(/[^\d]/g, ''))}
              />
            </FormField>
          )}
          <label className="gap-3 rounded-2xl p-3 sm:col-span-2 flex items-center justify-between bg-surface-2">
            <span className="min-w-0">
              <span className="text-sm font-medium block">Required</span>
              <span className="text-xs block text-muted">
                Checkout waits until the shopper picks an option.
              </span>
            </span>
            <Switch checked={required} onCheckedChange={setRequired} aria-label="Required" />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">
            Options<span className="ml-0.5 text-accent">*</span>
          </p>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={o.id} className="gap-2 grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center">
                <Input
                  variant="soft"
                  aria-label={`Option ${i + 1} name`}
                  value={o.name}
                  onChange={(e) => setOption(o.id, { name: e.target.value })}
                  placeholder={i === 0 ? 'Gift box and card' : 'Option name'}
                />
                <Input
                  variant="soft"
                  aria-label={`Option ${i + 1} extra price`}
                  inputMode="numeric"
                  inputClassName="tabular-nums"
                  value={o.price}
                  onChange={(e) => setOption(o.id, { price: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="Free"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove option ${i + 1}`}
                  disabled={options.length === 1}
                  onClick={() => setOptions((list) => list.filter((x) => x.id !== o.id))}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
          {show(errors.options) && <p className="mt-1 text-xs text-danger">{errors.options}</p>}
          <p className="mt-1 text-xs text-muted">Extra price in Rupiah. Leave it empty for a free choice.</p>
          <Button
            type="button"
            variant="soft"
            size="sm"
            className="mt-2"
            onClick={() => setOptions((list) => [...list, { id: newId('opt'), name: '', price: '' }])}
          >
            <Plus />
            Add option
          </Button>
        </div>

        <FormField
          label="Products"
          hint="Optional. You can attach the group to more products later."
          htmlFor="mod-products"
        >
          <ProductsPicker id="mod-products" values={productIds} onChange={setProductIds} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save group' : 'Create group'}</Button>
      </DialogFooter>
    </form>
  )
}
