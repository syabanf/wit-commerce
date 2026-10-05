import { fmtIdrShort } from '@rc/fixtures'
import type { LifecycleStage, SegmentField, SegmentOp, SegmentRule } from '@rc/types'
import {
  LIFECYCLE_STAGE_LABEL,
  LOYALTY_TIER_FLOW,
  LOYALTY_TIER_LABEL,
  SEGMENT_FIELD_LABEL,
  SEGMENT_OP_LABEL,
} from '@rc/types'
import { Button, Combobox, Input, NativeSelect } from '@rc/ui'
import { X } from 'lucide-react'
import { CategoryPicker } from '../../components/pickers'
import { FIELD_OPS, NUMERIC_FIELDS, SEGMENT_FIELDS, defaultRule } from './lib'

const STAGES = Object.keys(LIFECYCLE_STAGE_LABEL) as LifecycleStage[]
const TIER_OPTIONS = LOYALTY_TIER_FLOW.map((t) => ({ value: t, label: LOYALTY_TIER_LABEL[t] }))
const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]
const FIELD_HINT: Record<SegmentField, string> = {
  orders: 'Sold orders to date',
  spend: 'Sold orders minus refunds',
  days_since_purchase: 'Customers who never bought do not match',
  tier: 'Current loyalty tier',
  stage: 'Current lifecycle stage',
  interest: 'Categories on the customer profile',
  city: 'City on the customer profile',
  abandoned_cart: 'Checkout left without a later purchase',
}

type Props = {
  index: number
  rule: SegmentRule
  cities: string[]
  error: string | null
  readOnly: boolean
  canRemove: boolean
  onChange: (rule: SegmentRule) => void
  onRemove: () => void
}

/** One condition: field, operator and a value control that fits the field. */
export function RuleRow({ index, rule, cities, error, readOnly, canRemove, onChange, onRemove }: Props) {
  const ops = FIELD_OPS[rule.field]
  const label = `Rule ${index + 1}`
  const setValue = (value: string) => onChange({ ...rule, value })

  return (
    <li className="rounded-2xl p-3 bg-surface-2">
      <div className="gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto] sm:items-start grid grid-cols-1">
        <Combobox
          aria-label={`${label} field`}
          items={SEGMENT_FIELDS}
          value={rule.field}
          disabled={readOnly}
          onChange={(field) => field && field !== rule.field && onChange(defaultRule(field as SegmentField))}
          getKey={(f) => f}
          getLabel={(f) => SEGMENT_FIELD_LABEL[f]}
          getDescription={(f) => FIELD_HINT[f]}
          searchPlaceholder="Search fields"
        />
        {ops.length > 1 ? (
          <NativeSelect
            aria-label={`${label} operator`}
            disabled={readOnly}
            options={ops.map((op) => ({ value: op, label: SEGMENT_OP_LABEL[op] }))}
            value={rule.op}
            onChange={(e) => onChange({ ...rule, op: e.target.value as SegmentOp })}
          />
        ) : (
          <span className="h-11 px-4 text-sm flex items-center text-muted">{SEGMENT_OP_LABEL[ops[0]!]}</span>
        )}
        <ValueControl
          rule={rule}
          label={label}
          cities={cities}
          invalid={!!error}
          readOnly={readOnly}
          setValue={setValue}
        />
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${label.toLowerCase()}`}
            disabled={!canRemove}
            title={canRemove ? undefined : 'A segment needs at least one rule.'}
            onClick={onRemove}
          >
            <X />
          </Button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
    </li>
  )
}

function ValueControl({
  rule,
  label,
  cities,
  invalid,
  readOnly,
  setValue,
}: {
  rule: SegmentRule
  label: string
  cities: string[]
  invalid: boolean
  readOnly: boolean
  setValue: (value: string) => void
}) {
  const aria = `${label} value`
  if (NUMERIC_FIELDS.has(rule.field)) {
    const n = Number(rule.value)
    const unit =
      rule.field === 'spend'
        ? rule.value && Number.isFinite(n)
          ? fmtIdrShort(n)
          : 'Rp'
        : rule.field === 'days_since_purchase'
          ? 'days'
          : 'orders'
    return (
      <Input
        aria-label={aria}
        inputMode="numeric"
        inputClassName="tabular-nums"
        invalid={invalid}
        disabled={readOnly}
        value={rule.value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
        rightSlot={<span className="pr-1 text-xs whitespace-nowrap text-muted">{unit}</span>}
      />
    )
  }
  switch (rule.field) {
    case 'tier':
      return (
        <NativeSelect
          aria-label={aria}
          disabled={readOnly}
          options={TIER_OPTIONS}
          value={rule.value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    case 'abandoned_cart':
      return (
        <NativeSelect
          aria-label={aria}
          disabled={readOnly}
          options={YES_NO}
          value={rule.value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    case 'stage':
      return (
        <Combobox
          aria-label={aria}
          items={STAGES}
          value={rule.value || null}
          disabled={readOnly}
          invalid={invalid}
          onChange={(v) => setValue(v ?? '')}
          getKey={(st) => st}
          getLabel={(st) => LIFECYCLE_STAGE_LABEL[st]}
          searchPlaceholder="Search stages"
        />
      )
    case 'interest':
      return (
        <CategoryPicker
          aria-label={aria}
          value={rule.value || null}
          disabled={readOnly}
          invalid={invalid}
          onChange={(v) => setValue(v ?? '')}
        />
      )
    default:
      return (
        <Combobox
          aria-label={aria}
          items={cities}
          value={rule.value || null}
          disabled={readOnly}
          invalid={invalid}
          onChange={(v) => setValue(v ?? '')}
          getKey={(c) => c}
          getLabel={(c) => c}
          placeholder="Select city"
          searchPlaceholder="Search cities"
        />
      )
  }
}
