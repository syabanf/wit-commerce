import { fmtIdr } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { Check } from 'lucide-react'
import type { ProductDetail } from '../features/product'
import type { CartItem } from '../lib/cart'
import { stockNote } from '../lib/catalog'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { Drawer } from './Drawer'
import { FreeShippingProgress } from './FreeShipping'
import { ProductImage, swatchColour } from './product'
import { Button, ButtonLink, Pill } from './ui'

/** Even rows for pill sizes: 6 sizes sit 3 + 3 on phones and in one row on desktop. */
const sizeCols = (n: number) =>
  n <= 4
    ? ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][n - 1]
    : n === 6
      ? 'grid-cols-3 lg:grid-cols-6'
      : n % 3 === 0
        ? 'grid-cols-3'
        : 'grid-cols-4'

/** Colour chips share the size grid's edges; long names such as "02 Warm Beige" get two columns. */
const colourCols = (values: { value: string }[]) =>
  values.length === 2 || values.length === 4 || values.some((v) => v.value.length > 8)
    ? 'grid-cols-2'
    : 'grid-cols-3'

/**
 * One selector per product option: sizes as boxes, colours as swatch chips with the colour name.
 * Values that are sold out with the other choices are disabled. `look="box"` is the Theme 2 square box.
 */
export function OptionPickers({ detail, look = 'pill' }: { detail: ProductDetail; look?: 'pill' | 'box' }) {
  return (
    <div className="space-y-5">
      {detail.options.map((o) => (
        <fieldset key={o.name}>
          <legend className="text-sm font-semibold">
            {o.name}
            {o.selected && <span className="font-normal text-[color:var(--sf-muted)]">: {o.selected}</span>}
          </legend>
          <div
            className={cn(
              'mt-2 gap-2',
              look === 'box'
                ? 'flex flex-wrap'
                : ['grid', o.kind === 'colour' ? colourCols(o.values) : sizeCols(o.values.length)],
            )}
          >
            {o.values.map((v) => {
              const swatch = o.kind === 'colour' ? swatchColour(v.value) : null
              const label = v.available ? v.value : `${v.value}, sold out`
              if (o.kind === 'colour')
                return (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={v.selected}
                    aria-label={label}
                    disabled={!v.available}
                    onClick={() => detail.selectValue(o.name, v.value)}
                    className={cn(
                      'min-h-11 min-w-0 gap-2 px-3 text-sm font-semibold inline-flex items-center border transition disabled:cursor-not-allowed disabled:opacity-40',
                      look === 'pill' ? 'justify-center rounded-full' : 'rounded-[var(--sf-pill)]',
                      v.selected
                        ? 'border-[color:var(--sf-text)] ring-1 ring-[color:var(--sf-text)]'
                        : 'border-[color:var(--sf-line)]',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-5 shrink-0 rounded-full border border-[color:var(--sf-line)]"
                      style={{ background: swatch ?? 'var(--sf-soft)' }}
                    />
                    <span className={cn('truncate', !v.available && 'line-through')}>{v.value}</span>
                  </button>
                )
              return (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={v.selected}
                  aria-label={label}
                  disabled={!v.available}
                  onClick={() => detail.selectValue(o.name, v.value)}
                  className={cn(
                    'min-h-11 min-w-11 px-3 text-sm font-semibold inline-flex items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-40',
                    look === 'pill' && [
                      'rounded-full',
                      v.selected
                        ? 'border-[color:var(--sf-text)] bg-[var(--sf-text)] text-[color:var(--sf-bg)]'
                        : 'border-[color:var(--sf-line)] bg-[var(--sf-bg)]',
                    ],
                    look === 'box' && [
                      'rounded-[var(--sf-pill)] bg-[var(--sf-bg)]',
                      v.selected
                        ? 'border-[color:var(--sf-text)] ring-1 ring-[color:var(--sf-text)]'
                        : 'border-[color:var(--sf-line)]',
                    ],
                  )}
                >
                  <span className={cn(!v.available && 'line-through')}>{v.value}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

/** Add-on groups: single choice as a radio list, multiple as checkboxes up to the group's limit. */
export function ModifierGroups({ detail }: { detail: ProductDetail }) {
  if (!detail.groups.length) return null
  return (
    <div className="space-y-5">
      {detail.groups.map((g) => {
        const picked = detail.choices[g.id] ?? []
        const full = g.selection === 'multiple' && picked.length >= g.maxChoices
        return (
          <fieldset key={g.id}>
            <legend className="gap-2 text-sm font-semibold flex w-full flex-wrap items-center">
              {g.name}
              {g.required ? <Pill tone="accent">Required</Pill> : <Pill>Optional</Pill>}
              {g.selection === 'multiple' && (
                <span className="text-xs font-normal text-[color:var(--sf-muted)]">
                  Pick up to {g.maxChoices}
                </span>
              )}
            </legend>
            <div className="mt-2 divide-y divide-[color:var(--sf-line)] rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)]">
              {g.selection === 'single' && !g.required && (
                <ChoiceRow
                  name={g.id}
                  type="radio"
                  label="None"
                  price={null}
                  checked={!picked.length}
                  onChange={() => detail.toggleChoice(g, '')}
                />
              )}
              {g.options.map((o) => {
                const left = detail.modifierAvailable(o.id)
                return (
                  <ChoiceRow
                    key={o.id}
                    name={g.id}
                    type={g.selection === 'single' ? 'radio' : 'checkbox'}
                    label={o.name}
                    hint={
                      left === 0 ? 'Sold out' : left !== null && left <= 5 ? `Only ${left} left` : undefined
                    }
                    price={o.priceDelta}
                    checked={picked.includes(o.id)}
                    disabled={!picked.includes(o.id) && (left === 0 || full)}
                    onChange={() => detail.toggleChoice(g, o.id)}
                  />
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

function ChoiceRow({
  name,
  type,
  label,
  hint,
  price,
  checked,
  disabled,
  onChange,
}: {
  name: string
  type: 'radio' | 'checkbox'
  label: string
  hint?: string
  price: number | null
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={cn(
        'min-h-12 gap-3 px-4 py-2 text-sm flex cursor-pointer items-center',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 accent-[var(--sf-primary)]"
      />
      <span className="min-w-0 flex-1">
        {label}
        {hint && <span className="text-xs block text-[color:var(--sf-muted)]">{hint}</span>}
      </span>
      {price !== null && (
        <span className={cn('font-semibold shrink-0', price === 0 && 'text-[color:var(--sf-muted)]')}>
          {price ? `+${fmtIdr(price)}` : 'Free'}
        </span>
      )}
    </label>
  )
}

export function StockLine({ detail, className }: { detail: ProductDetail; className?: string }) {
  if (detail.product.assisted) return null
  if (!detail.variant && detail.options.length)
    return (
      <p className={cn('text-sm text-[color:var(--sf-muted)]', className)}>Choose options to see stock</p>
    )
  const out = detail.available !== null && detail.available <= 0
  return (
    <p className={cn('gap-2 text-sm flex items-center', className)}>
      <span
        aria-hidden="true"
        className={cn('size-2 rounded-full', out ? 'bg-danger' : 'bg-[var(--sf-primary)]')}
      />
      {stockNote(detail.available)}
    </p>
  )
}

export function SpecTable({ detail, className }: { detail: ProductDetail; className?: string }) {
  if (!detail.specs.length) return null
  return (
    <dl className={cn('text-sm divide-y divide-[color:var(--sf-line)]', className)}>
      {detail.specs.map(({ def, value }) => (
        <div key={def.id} className="gap-4 py-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dt className="text-[color:var(--sf-muted)]">{def.name}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Confirmation after Add to cart: the line, the free-shipping progress, and the next steps. */
export function AddedDrawer({ item, onClose }: { item: CartItem | null; onClose: () => void }) {
  const { store, totals } = useShop()
  return (
    <Drawer
      open={!!item}
      onOpenChange={(open) => !open && onClose()}
      title="Added to your cart"
      description={item ? `${totals.count} ${totals.count === 1 ? 'item' : 'items'} in your cart` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Keep shopping
          </Button>
          <ButtonLink to={paths.cart(store)} variant="primary" className="flex-1">
            View cart
          </ButtonLink>
        </>
      }
    >
      {item && (
        <div className="space-y-5">
          <div className="gap-4 flex">
            <ProductImage
              product={item.product}
              size="sm"
              className="size-20 shrink-0 rounded-[var(--sf-tile-radius)]"
            />
            <div className="min-w-0 flex-1">
              <p className="gap-1.5 text-xs font-semibold flex items-center text-[color:var(--sf-primary)]">
                <Check className="size-4" aria-hidden="true" /> Added
              </p>
              <p className="sf-display mt-1 font-bold">{item.product.name}</p>
              {item.variant.name !== 'Standard' && (
                <p className="text-sm text-[color:var(--sf-muted)]">{item.variant.name}</p>
              )}
              {item.modifiers.map((m) => (
                <p key={m.optionId} className="text-xs text-[color:var(--sf-muted)]">
                  {m.groupName}: {m.name}
                  {m.priceDelta ? ` (+${fmtIdr(m.priceDelta)})` : ''}
                </p>
              ))}
              <p className="mt-1 text-sm">
                {item.line.qty} × {fmtIdr(item.unit)} = <strong>{fmtIdr(item.total)}</strong>
              </p>
            </div>
          </div>
          <FreeShippingProgress />
          <div className="space-y-2 text-sm">
            <p className="flex justify-between">
              <span>Cart subtotal</span>
              <strong>{fmtIdr(totals.subtotal)}</strong>
            </p>
            {totals.discounts.map((discount) => (
              <p key={discount.promotionId} className="flex justify-between text-[color:var(--sf-primary)]">
                <span>{discount.label}</span>
                <span>−{fmtIdr(discount.amount)}</span>
              </p>
            ))}
            {totals.discounts.length > 0 && (
              <p className="pt-2 flex justify-between border-t border-[color:var(--sf-line)]">
                <span>After offers, before shipping</span>
                <strong>{fmtIdr(Math.max(0, totals.subtotal - totals.discount))}</strong>
              </p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}
