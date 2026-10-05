import { newId, optionCombinations, variantLabel } from '@rc/fixtures'
import type { Product, ProductOption } from '@rc/types'
import { Button, Input, Switch, cn } from '@rc/ui'
import { Plus, Trash2, X } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import { MAX_OPTIONS, MAX_VARIANTS, comboKey, defaultSku, sameValues } from './lib'

/** One option while it is edited; `key` keeps the row stable while the name changes. */
export interface OptionDraft {
  key: string
  name: string
  values: string[]
}

/** What the user changed on a generated row. Anything left out falls back to the default. */
export interface RowOverride {
  sku?: string
  price?: string
  barcode?: string
  enabled?: boolean
}

export interface VariantRow {
  key: string
  values: Record<string, string>
  label: string
  /** The id of the saved variant with these values, kept so stock stays attached. */
  id: string | null
  sku: string
  price: string
  barcode: string
  enabled: boolean
}

const NAME_HINTS = ['Size', 'Colour', 'Material']
const digitsOnly = (value: string) => value.replace(/[^\d]/g, '')

export const toOptionDrafts = (options: readonly ProductOption[]): OptionDraft[] =>
  options.map((o) => ({ key: newId('opt'), name: o.name, values: [...o.values] }))

/** Error per option key: a missing or repeated name, or no values. */
export function optionErrorsFor(options: readonly OptionDraft[]): Record<string, string | undefined> {
  return Object.fromEntries(
    options.map((o, i) => {
      const name = o.name.trim()
      const twice = options.some((x) => x.key !== o.key && x.name.trim().toLowerCase() === name.toLowerCase())
      const error = !name
        ? `Name option ${i + 1}, such as ${NAME_HINTS[i] ?? 'Size'}.`
        : twice
          ? `Use the option name ${name} once.`
          : !o.values.length
            ? `Add at least one value to ${name}.`
            : undefined
      return [o.key, error]
    }),
  )
}

/** Options with a name and at least one value, trimmed: the ones that generate rows. */
export const usableOptions = (options: readonly OptionDraft[]): ProductOption[] =>
  options.map((o) => ({ name: o.name.trim(), values: o.values })).filter((o) => o.name && o.values.length)

export const combinationCount = (options: readonly ProductOption[]) =>
  options.reduce((n, o) => n * o.values.length, 1)

/**
 * Overrides that reproduce a saved product: its variants keep their SKU, price and barcode,
 * and combinations it skipped start switched off.
 */
export function initialOverrides(product: Product | null): Record<string, RowOverride> {
  if (!product) return {}
  const result: Record<string, RowOverride> = {}
  for (const values of optionCombinations(product.options)) {
    const variant = product.variants.find((v) => sameValues(v.optionValues, values))
    result[comboKey(product.options, values)] = variant
      ? {
          sku: variant.sku,
          price: variant.price === product.price ? '' : String(variant.price),
          barcode: variant.barcode,
        }
      : { enabled: false }
  }
  return result
}

/** One row per combination, or none when the options would generate more than the limit. */
export function buildRows(
  options: readonly ProductOption[],
  overrides: Record<string, RowOverride>,
  code: string,
  saved: Product | null,
): VariantRow[] {
  if (combinationCount(options) > MAX_VARIANTS) return []
  return optionCombinations(options).map((values) => {
    const key = comboKey(options, values)
    const o = overrides[key] ?? {}
    return {
      key,
      values,
      label: variantLabel(options, values),
      id: saved?.variants.find((v) => sameValues(v.optionValues, values))?.id ?? null,
      sku:
        o.sku ??
        defaultSku(
          code,
          options.map((opt) => values[opt.name] ?? ''),
        ),
      price: o.price ?? '',
      barcode: o.barcode ?? '',
      enabled: o.enabled ?? true,
    }
  })
}

/** Text field that turns each value into a chip on Enter or comma. */
function ValuesInput({
  values,
  onChange,
  label,
  invalid,
}: {
  values: string[]
  onChange: (values: string[]) => void
  label: string
  invalid: boolean
}) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const next = [...values]
    for (const part of raw.split(',').map((t) => t.trim())) {
      if (part && !next.some((v) => v.toLowerCase() === part.toLowerCase())) next.push(part)
    }
    if (next.length !== values.length) onChange(next)
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1))
    }
  }
  return (
    <div
      className={cn(
        'min-h-11 min-w-0 gap-1.5 rounded-2xl px-2 py-1.5 flex flex-wrap items-center bg-card focus-within:ring-2 focus-within:ring-accent/20',
        invalid && 'ring-2 ring-danger/25',
      )}
    >
      {values.map((v) => (
        <span
          key={v}
          className="h-7 gap-1 pl-2.5 pr-1 text-xs font-medium inline-flex max-w-full items-center rounded-full bg-surface"
        >
          <span className="truncate">{v}</span>
          <button
            type="button"
            aria-label={`Remove ${v} from ${label}`}
            className="size-5 flex shrink-0 items-center justify-center rounded-full text-muted hover:bg-card hover:text-foreground"
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={`Add values to ${label}`}
        aria-invalid={invalid || undefined}
        value={text}
        placeholder={values.length ? 'Add value' : 'Type a value, then Enter'}
        className="h-7 min-w-24 px-1 text-base md:text-sm flex-1 bg-transparent outline-none placeholder:text-muted"
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && add(text)}
      />
    </div>
  )
}

export function OptionsEditor({
  options,
  onChange,
  optionErrors,
}: {
  options: OptionDraft[]
  onChange: (options: OptionDraft[]) => void
  /** Error per option key, shown after the first submit. */
  optionErrors: Record<string, string | undefined>
}) {
  const patch = (key: string, change: Partial<OptionDraft>) =>
    onChange(options.map((o) => (o.key === key ? { ...o, ...change } : o)))
  return (
    <div className="space-y-2">
      {options.length === 0 && (
        <p className="rounded-2xl p-3 text-sm bg-surface-2 text-muted">
          One variant, Standard. Add an option such as Size or Colour when the product comes in several
          versions.
        </p>
      )}
      {options.map((o, i) => {
        const label = o.name.trim() || `option ${i + 1}`
        const error = optionErrors[o.key]
        return (
          <div key={o.key} className="rounded-2xl p-3 bg-surface-2">
            <div className="gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-start grid grid-cols-1">
              <Input
                aria-label={`Option ${i + 1} name`}
                value={o.name}
                placeholder={NAME_HINTS[i] ?? 'Option'}
                invalid={!!error && !o.name.trim()}
                onChange={(e) => patch(o.key, { name: e.target.value })}
              />
              <ValuesInput
                label={label}
                values={o.values}
                invalid={!!error && !!o.name.trim()}
                onChange={(values) => patch(o.key, { values })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="sm:mt-1.5 justify-self-end"
                aria-label={`Remove ${label}`}
                onClick={() => onChange(options.filter((x) => x.key !== o.key))}
              >
                <Trash2 />
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        )
      })}
      {options.length < MAX_OPTIONS && (
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => onChange([...options, { key: newId('opt'), name: '', values: [] }])}
        >
          <Plus />
          Add option
        </Button>
      )}
    </div>
  )
}

export function VariantRows({
  rows,
  basePrice,
  multiple,
  rowErrors,
  onChange,
}: {
  rows: VariantRow[]
  basePrice: string
  /** False for the single Standard variant, which cannot be switched off. */
  multiple: boolean
  rowErrors: Record<string, string | undefined>
  onChange: (key: string, change: RowOverride) => void
}) {
  return (
    <div className="space-y-2 pr-1 max-h-[30rem] overflow-y-auto">
      {rows.map((r) => {
        const error = rowErrors[r.key]
        return (
          <div key={r.key} className={cn('rounded-2xl p-3 bg-surface-2', !r.enabled && 'opacity-70')}>
            <div className="gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,7rem)_minmax(0,8rem)] sm:items-center grid grid-cols-1">
              <div className="min-w-0 gap-3 flex items-center">
                {multiple && (
                  <Switch
                    size="sm"
                    checked={r.enabled}
                    aria-label={`Sell ${r.label}`}
                    onCheckedChange={(enabled) => onChange(r.key, { enabled })}
                  />
                )}
                <span className={cn('text-sm font-medium truncate', !r.enabled && 'text-muted')}>
                  {r.label}
                </span>
              </div>
              <Input
                aria-label={`SKU for ${r.label}`}
                value={r.sku}
                disabled={!r.enabled}
                invalid={!!error}
                inputClassName="font-mono uppercase"
                onChange={(e) => onChange(r.key, { sku: e.target.value })}
              />
              <Input
                aria-label={`Price for ${r.label}`}
                inputMode="numeric"
                inputClassName="tabular-nums"
                value={r.price}
                disabled={!r.enabled}
                placeholder={basePrice || 'Price'}
                onChange={(e) => onChange(r.key, { price: digitsOnly(e.target.value) })}
              />
              <Input
                aria-label={`Barcode for ${r.label}`}
                inputMode="numeric"
                inputClassName="tabular-nums"
                value={r.barcode}
                disabled={!r.enabled}
                placeholder="Barcode"
                onChange={(e) => onChange(r.key, { barcode: e.target.value.trim() })}
              />
            </div>
            {error && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {error}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
