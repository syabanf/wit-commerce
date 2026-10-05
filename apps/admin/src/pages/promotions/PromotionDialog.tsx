import {
  DAY,
  describePromotion,
  fmtIdr,
  fromInput,
  newId,
  nowMs,
  toDateInput,
  toIso,
  toMs,
} from '@rc/fixtures'
import {
  PROMOTION_KIND_LABEL,
  PROMOTION_TRIGGER_LABEL,
  type Promotion,
  type PromotionKind,
  type PromotionTrigger,
} from '@rc/types'
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
  cn,
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import {
  CategoriesPicker,
  PaymentTypesPicker,
  ProductsPicker,
  SegmentPicker,
  SellerPicker,
} from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { CODE, KIND_HINT, autoCode, onStatus, sampleCart } from './lib'

const KINDS = Object.keys(PROMOTION_KIND_LABEL) as PromotionKind[]
const TRIGGERS = (['automatic', 'code'] as const).map((t) => ({
  value: t,
  label: PROMOTION_TRIGGER_LABEL[t],
}))
/** Kinds that discount items, so a category and product scope means something. */
const SCOPED: PromotionKind[] = ['percentage', 'fixed', 'bxgy']

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null creates a promotion. */
  editing: Promotion | null
  /** Shows the fields without a save button, for roles that cannot manage promotions. */
  readOnly?: boolean
}

export function PromotionDialog({ open, onOpenChange, editing, readOnly = false }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <PromotionForm
            key={editing?.id ?? 'new'}
            editing={editing}
            readOnly={readOnly}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const digitsOnly = (value: string) => value.replace(/[^\d]/g, '')
const numberOr = (value: string, fallback: number) => (value.trim() ? Number(value) : fallback)
const isWhole = (n: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(n) && n >= min && n <= max

function initialDraft(editing: Promotion | null) {
  const start = editing ? toMs(editing.startAt) : nowMs()
  const amount = (n: number | null | undefined) => (n ? String(n) : '')
  return {
    code: editing?.code ?? '',
    name: editing?.name ?? '',
    kind: editing?.kind ?? ('percentage' as PromotionKind),
    trigger: editing?.trigger ?? ('code' as PromotionTrigger),
    value:
      editing && editing.kind !== 'free_shipping' && editing.kind !== 'bxgy' ? String(editing.value) : '',
    maxDiscount: amount(editing?.maxDiscount),
    buyQty: editing?.buyQty ? String(editing.buyQty) : '2',
    getQty: editing?.getQty ? String(editing.getQty) : '1',
    getDiscountPct: editing?.getDiscountPct ? String(editing.getDiscountPct) : '100',
    minSpend: amount(editing?.minSpend),
    categoryIds: editing?.categoryIds ?? [],
    productIds: editing?.productIds ?? [],
    paymentTypeIds: editing?.paymentTypeIds ?? [],
    segmentId: editing?.segmentId ?? null,
    sellerId: editing?.sellerId ?? null,
    start: toDateInput(toIso(start)),
    end: toDateInput(editing?.endAt ?? toIso(start + 30 * DAY)),
    usageLimit: amount(editing?.usageLimit),
  }
}

function PromotionForm({
  editing,
  readOnly,
  onDone,
}: {
  editing: Promotion | null
  readOnly: boolean
  onDone: () => void
}) {
  const s = useScoped()
  const [draft, setDraft] = useState(() => initialDraft(editing))
  const [id] = useState(() => editing?.id ?? newId('promo'))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))
  const paymentName = (pid: string) => s.maps.paymentType.get(pid)?.name ?? 'a removed payment type'

  const { kind, trigger } = draft
  const scoped = SCOPED.includes(kind)
  const code = draft.code.trim()
  const value = numberOr(draft.value, 0)
  const maxDiscount = numberOr(draft.maxDiscount, 0)
  const buyQty = numberOr(draft.buyQty, 0)
  const getQty = numberOr(draft.getQty, 0)
  const getDiscountPct = numberOr(draft.getDiscountPct, 100)
  const minSpend = numberOr(draft.minSpend, 0)
  const limit = draft.usageLimit ? Number(draft.usageLimit) : null
  const used = editing?.used ?? 0
  const others = s.promotions.filter((p) => p.id !== editing?.id)
  const taken = others.find((p) => p.code.toUpperCase() === code)
  const bundleTotal = draft.productIds.reduce((n, pid) => n + (s.maps.product.get(pid)?.price ?? 0), 0)

  const errors = {
    code:
      trigger === 'code' && !code
        ? 'Enter the code shoppers type at checkout.'
        : code && !CODE.test(code)
          ? 'Use 3 to 20 letters and digits, no spaces.'
          : taken
            ? `${taken.name} already uses ${code}. Choose another code.`
            : undefined,
    name: draft.name.trim() ? undefined : 'Enter a name your team will recognise.',
    value:
      kind === 'percentage' && !isWhole(value, 1, 100)
        ? 'Enter a percentage between 1 and 100.'
        : kind === 'fixed' && !isWhole(value, 1)
          ? 'Enter the amount off in Rupiah, above zero.'
          : kind === 'bundle' && !isWhole(value, 1)
            ? 'Enter the bundle price in Rupiah.'
            : kind === 'bundle' && bundleTotal && value >= bundleTotal
              ? `Set the bundle price below ${fmtIdr(bundleTotal)}, what the products cost together.`
              : undefined,
    maxDiscount:
      kind === 'percentage' && draft.maxDiscount && !isWhole(maxDiscount, 1)
        ? 'Enter the cap in Rupiah, or leave it empty.'
        : undefined,
    buyQty:
      kind === 'bxgy' && !isWhole(buyQty, 1, 99)
        ? 'Enter how many items the shopper buys, 1 or more.'
        : undefined,
    getQty:
      kind === 'bxgy' && !isWhole(getQty, 1, 99)
        ? 'Enter how many items the shopper gets, 1 or more.'
        : undefined,
    getDiscountPct:
      kind === 'bxgy' && !isWhole(getDiscountPct, 1, 100)
        ? 'Enter a discount between 1 and 100 percent. 100 makes them free.'
        : undefined,
    bundle:
      kind === 'bundle' && draft.productIds.length < 2
        ? 'Choose at least two products for the bundle.'
        : undefined,
    minSpend: isWhole(minSpend, 0) ? undefined : 'Enter the minimum spend in Rupiah, or leave it empty.',
    start: draft.start ? undefined : 'Choose the start date.',
    end: !draft.end
      ? 'Choose the end date.'
      : draft.end < draft.start
        ? 'Choose an end date on or after the start date.'
        : undefined,
    usageLimit:
      limit === null || (isWhole(limit, 1) && limit >= used)
        ? undefined
        : used
          ? `Enter a limit of at least ${used}, the redemptions so far.`
          : 'Enter a whole number above zero, or leave it empty.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const startAt = draft.start ? fromInput(`${draft.start}T00:00`) : (editing?.startAt ?? toIso(nowMs()))
  const endAt = draft.end ? fromInput(`${draft.end}T23:59`) : (editing?.endAt ?? startAt)
  // The promotion as it would be saved, which also drives the live preview.
  const promotion: Promotion = {
    id,
    tenantId: s.tenantId,
    status: editing?.status ?? 'draft',
    used,
    revenue: editing?.revenue ?? 0,
    code: code || autoCode(draft.name, new Set(others.map((p) => p.code.toUpperCase()))),
    name: draft.name.trim(),
    kind,
    trigger,
    value: kind === 'percentage' || kind === 'fixed' || kind === 'bundle' ? value : 0,
    maxDiscount: kind === 'percentage' && maxDiscount > 0 ? maxDiscount : null,
    buyQty: kind === 'bxgy' ? buyQty : null,
    getQty: kind === 'bxgy' ? getQty : null,
    getDiscountPct: kind === 'bxgy' ? getDiscountPct : null,
    minSpend,
    categoryIds: scoped ? draft.categoryIds : [],
    productIds: scoped || kind === 'bundle' ? draft.productIds : [],
    paymentTypeIds: draft.paymentTypeIds,
    segmentId: draft.segmentId,
    sellerId: draft.sellerId,
    startAt,
    endAt,
    usageLimit: limit,
  }
  const sample = sampleCart(promotion, s.products, s.categories)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const now = nowMs()
    // A new promotion, or an expired one given new dates, goes live on its start date.
    const relive = !editing || (editing.status === 'expired' && toMs(endAt) >= now)
    const saved: Promotion = { ...promotion, status: relive ? onStatus({ startAt }, now) : promotion.status }
    s.dispatch({ type: 'promotions/save', promotion: saved })
    toast(editing ? 'Promotion saved' : 'Promotion created', {
      tone: 'success',
      description: `${saved.trigger === 'code' ? `${saved.code} · ` : ''}${describePromotion(saved, paymentName)}`,
    })
    onDone()
  }

  const numberField = (
    key: 'value' | 'maxDiscount' | 'buyQty' | 'getQty' | 'getDiscountPct',
    label: string,
    options: { required?: boolean; hint?: string; placeholder?: string },
  ) => (
    <FormField
      label={label}
      required={options.required}
      htmlFor={`promo-${key}`}
      error={show(errors[key])}
      hint={options.hint}
    >
      <Input
        id={`promo-${key}`}
        inputMode="numeric"
        inputClassName="tabular-nums"
        value={draft[key]}
        placeholder={options.placeholder}
        onChange={(e) => set({ [key]: digitsOnly(e.target.value) })}
      />
    </FormField>
  )

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `${readOnly ? '' : 'Edit '}${editing.name}` : 'New promotion'}</DialogTitle>
        <DialogDescription>
          {readOnly
            ? 'You can see this promotion. Ask a marketing or tenant admin to change it.'
            : 'Automatic offers apply in the cart by themselves. Code offers wait for the shopper to type the code.'}
        </DialogDescription>
      </DialogHeader>

      <fieldset disabled={readOnly} className="min-w-0 gap-4 sm:grid-cols-2 grid grid-cols-1">
        <div
          role="radiogroup"
          aria-label="Kind of offer"
          className="gap-2 sm:col-span-2 sm:grid-cols-2 grid grid-cols-1"
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => set({ kind: k })}
              className={cn(
                'min-h-12 rounded-2xl px-4 py-2.5 flex flex-col items-start text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed',
                kind === k ? 'bg-ink text-on-ink' : 'bg-surface text-body hover:bg-surface-2',
              )}
            >
              <span className="text-sm font-semibold">{PROMOTION_KIND_LABEL[k]}</span>
              <span className={cn('text-xs', kind === k ? 'text-on-ink-muted' : 'text-muted')}>
                {KIND_HINT[k]}
              </span>
            </button>
          ))}
        </div>

        <FormField label="Applies" className="sm:col-span-2">
          <SegmentedControl
            className="sm:w-auto w-full"
            aria-label="How the offer applies"
            disabled={readOnly}
            value={trigger}
            onChange={(v) => set({ trigger: v as PromotionTrigger })}
            options={TRIGGERS}
          />
        </FormField>

        <FormField
          label={trigger === 'code' ? 'Voucher code' : 'Reference code'}
          required={trigger === 'code'}
          htmlFor="promo-code"
          error={show(errors.code)}
          hint={
            trigger === 'code'
              ? undefined
              : `Optional. Your team sees it in reports; shoppers never type it.${code ? '' : ` Saved as ${promotion.code}.`}`
          }
        >
          <Input
            id="promo-code"
            autoFocus={!editing}
            inputClassName="font-mono uppercase"
            value={draft.code}
            placeholder={trigger === 'code' ? 'RUNMONTH15' : promotion.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, '') })}
          />
        </FormField>
        <FormField label="Name" required htmlFor="promo-name" error={show(errors.name)}>
          <Input
            id="promo-name"
            value={draft.name}
            placeholder="Running Month 15% off road shoes"
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>

        {kind === 'percentage' && (
          <>
            {numberField('value', 'Discount (%)', { required: true, placeholder: '15' })}
            {numberField('maxDiscount', 'Maximum discount (Rp)', {
              hint: 'Optional. Empty means no cap.',
            })}
          </>
        )}
        {kind === 'fixed' &&
          numberField('value', 'Amount off (Rp)', { required: true, placeholder: '100000' })}
        {kind === 'bxgy' && (
          <div className="gap-3 sm:col-span-2 sm:grid-cols-3 grid grid-cols-1">
            {numberField('buyQty', 'Buy', { required: true, hint: 'Items the shopper pays for.' })}
            {numberField('getQty', 'Get', { required: true, hint: 'Items given on top.' })}
            {numberField('getDiscountPct', 'Off the given items (%)', {
              required: true,
              hint: '100 makes them free.',
            })}
          </div>
        )}
        {kind === 'bundle' && (
          <>
            <FormField
              label="Bundle products"
              required
              htmlFor="promo-bundle"
              error={show(errors.bundle)}
              hint={bundleTotal ? `${fmtIdr(bundleTotal)} when bought separately.` : 'Two or more products.'}
              className="sm:col-span-2"
            >
              <ProductsPicker
                id="promo-bundle"
                disabled={readOnly}
                invalid={!!show(errors.bundle)}
                values={draft.productIds}
                onChange={(productIds) => set({ productIds })}
              />
            </FormField>
            {numberField('value', 'Bundle price (Rp)', { required: true })}
          </>
        )}

        <FormField
          label="Minimum spend (Rp)"
          htmlFor="promo-min"
          error={show(errors.minSpend)}
          hint={
            kind === 'free_shipping'
              ? 'Shipping is free once the order reaches it. Empty means any order.'
              : 'Optional. Empty means any order.'
          }
        >
          <Input
            id="promo-min"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.minSpend}
            onChange={(e) => set({ minSpend: digitsOnly(e.target.value) })}
          />
        </FormField>
        <FormField
          label="Usage limit"
          htmlFor="promo-limit"
          error={show(errors.usageLimit)}
          hint={used ? `Optional. ${used} used so far.` : 'Optional. Empty means unlimited.'}
        >
          <Input
            id="promo-limit"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.usageLimit}
            onChange={(e) => set({ usageLimit: digitsOnly(e.target.value) })}
          />
        </FormField>

        {scoped && (
          <>
            <FormField
              label="Categories"
              htmlFor="promo-categories"
              hint="Sub-categories count too. Empty means everything."
            >
              <CategoriesPicker
                id="promo-categories"
                placeholder="Every category"
                disabled={readOnly}
                values={draft.categoryIds}
                onChange={(categoryIds) => set({ categoryIds })}
              />
            </FormField>
            <FormField label="Products" htmlFor="promo-products" hint="Counted on top of the categories.">
              <ProductsPicker
                id="promo-products"
                placeholder="No single products"
                disabled={readOnly}
                values={draft.productIds}
                onChange={(productIds) => set({ productIds })}
              />
            </FormField>
          </>
        )}
        <FormField
          label="Only when paying with"
          htmlFor="promo-payments"
          hint="Empty means any payment type."
        >
          <PaymentTypesPicker
            id="promo-payments"
            disabled={readOnly}
            values={draft.paymentTypeIds}
            onChange={(paymentTypeIds) => set({ paymentTypeIds })}
          />
        </FormField>
        <FormField label="Segment" htmlFor="promo-segment" hint="Only customers in this segment get it.">
          <SegmentPicker
            id="promo-segment"
            clearable
            placeholder="Any customer"
            disabled={readOnly}
            value={draft.segmentId}
            onChange={(segmentId) => set({ segmentId })}
          />
        </FormField>
        <FormField
          label="Seller"
          htmlFor="promo-seller"
          hint="Makes it a personal-store promotion."
          className="sm:col-span-2"
        >
          <SellerPicker
            id="promo-seller"
            clearable
            placeholder="Every channel"
            disabled={readOnly}
            value={draft.sellerId}
            onChange={(sellerId) => set({ sellerId })}
          />
        </FormField>
        <FormField label="Start date" required htmlFor="promo-start" error={show(errors.start)}>
          <Input
            id="promo-start"
            type="date"
            value={draft.start}
            onChange={(e) => set({ start: e.target.value })}
          />
        </FormField>
        <FormField label="End date" required htmlFor="promo-end" error={show(errors.end)}>
          <Input
            id="promo-end"
            type="date"
            value={draft.end}
            onChange={(e) => set({ end: e.target.value })}
          />
        </FormField>

        <div className="rounded-2xl p-3 text-sm sm:col-span-2 bg-surface-2" aria-live="polite">
          <p className="text-xs font-semibold text-muted">What the shopper gets</p>
          <p className="mt-1 font-medium">{describePromotion(promotion, paymentName)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {trigger === 'code'
              ? `After typing ${code || 'the code'} at checkout.`
              : 'Applied in the cart by itself.'}
          </p>
          {sample && <p className="mt-2 text-xs tabular-nums">{sample}</p>}
        </div>
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {readOnly ? 'Close' : 'Cancel'}
        </Button>
        {!readOnly && <Button type="submit">{editing ? 'Save changes' : 'Create promotion'}</Button>}
      </DialogFooter>
    </form>
  )
}
