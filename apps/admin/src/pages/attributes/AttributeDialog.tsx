import { newId } from '@rc/fixtures'
import type { AttributeDef, AttributeType } from '@rc/types'
import { ATTRIBUTE_TYPE_LABEL } from '@rc/types'
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
  Switch,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { CategoriesPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: AttributeDef | null
  onSaved: (def: AttributeDef) => void
}

const toCode = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

export function AttributeDialog({ open, onOpenChange, editing, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <AttributeForm
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

function AttributeForm({
  editing,
  onDone,
}: {
  editing: AttributeDef | null
  onDone: (saved: AttributeDef | null) => void
}) {
  const s = useScoped()
  const [name, setName] = useState(editing?.name ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [type, setType] = useState<AttributeType>(editing?.type ?? 'text')
  const [unit, setUnit] = useState(editing?.unit ?? '')
  const [options, setOptions] = useState(editing?.options.join(', ') ?? '')
  const [filterable, setFilterable] = useState(editing?.filterable ?? false)
  const [required, setRequired] = useState(editing?.required ?? false)
  const [categoryIds, setCategoryIds] = useState<string[]>(editing?.categoryIds ?? [])
  const [tried, setTried] = useState(false)

  const finalCode = code.trim() || toCode(name)
  const optionList = options
    .split(',')
    .map((o) => o.trim())
    .filter((o, i, all) => o && all.indexOf(o) === i)
  const errors = {
    name: !name.trim() ? 'Enter a name.' : null,
    code: !finalCode
      ? 'Enter a code.'
      : s.attributes.some((a) => a.id !== editing?.id && a.code === finalCode)
        ? 'Another attribute already uses this code.'
        : null,
    options:
      type === 'select' && optionList.length < 2 ? 'List at least two options, separated by commas.' : null,
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const def: AttributeDef = {
      id: editing?.id ?? newId('att'),
      tenantId: s.tenantId,
      name: name.trim(),
      code: finalCode,
      type,
      unit: type === 'number' && unit.trim() ? unit.trim() : null,
      options: type === 'select' ? optionList : [],
      filterable,
      required,
      categoryIds,
    }
    s.dispatch({ type: 'attributes/save', attribute: def })
    onDone(def)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New attribute'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Changing the type keeps existing values; products that no longer fit show a gap on their page.'
            : 'Products in the chosen categories get a field for it.'}
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField label="Name" required error={show(errors.name)} htmlFor="att-name">
          <Input
            id="att-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Heel-to-toe drop"
          />
        </FormField>
        <FormField
          label="Code"
          required
          error={show(errors.code)}
          hint="Used by the storefront filter and the API."
          htmlFor="att-code"
        >
          <Input
            id="att-code"
            inputClassName="font-mono"
            value={code}
            onChange={(e) => setCode(toCode(e.target.value))}
            placeholder={toCode(name) || 'heel_to_toe_drop'}
          />
        </FormField>
        <FormField label="Type" required htmlFor="att-type">
          <NativeSelect
            id="att-type"
            value={type}
            onChange={(e) => setType(e.target.value as AttributeType)}
            options={(Object.keys(ATTRIBUTE_TYPE_LABEL) as AttributeType[]).map((t) => ({
              value: t,
              label: ATTRIBUTE_TYPE_LABEL[t],
            }))}
          />
        </FormField>
        {type === 'number' && (
          <FormField label="Unit" hint="Optional, such as mm, g, ml or kW." htmlFor="att-unit">
            <Input id="att-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mm" />
          </FormField>
        )}
        {type === 'select' && (
          <FormField
            label="Options"
            required
            error={show(errors.options)}
            hint="Separate with commas."
            className="sm:col-span-2"
            htmlFor="att-options"
          >
            <Input
              id="att-options"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder="Low, Medium, Max"
            />
          </FormField>
        )}
        <FormField
          label="Applies to"
          hint="Sub-categories inherit from their parent. Leave empty for every product."
          className="sm:col-span-2"
          htmlFor="att-cats"
        >
          <CategoriesPicker id="att-cats" values={categoryIds} onChange={setCategoryIds} />
        </FormField>
        <ToggleRow
          title="Storefront filter"
          text="Shoppers can narrow product lists by this attribute."
          checked={filterable}
          onChange={setFilterable}
        />
        <ToggleRow
          title="Required"
          text="A product needs a value before it can go live."
          checked={required}
          onChange={setRequired}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save attribute' : 'Create attribute'}</Button>
      </DialogFooter>
    </form>
  )
}

function ToggleRow({
  title,
  text,
  checked,
  onChange,
}: {
  title: string
  text: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="gap-3 rounded-2xl p-3 flex items-center justify-between bg-surface-2">
      <span className="min-w-0">
        <span className="text-sm font-medium block">{title}</span>
        <span className="text-xs block text-muted">{text}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </label>
  )
}
