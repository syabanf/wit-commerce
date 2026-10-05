import { newId, nowIso, plural } from '@rc/fixtures'
import type { Product, ProductType } from '@rc/types'
import { PRODUCT_TYPE_LABEL } from '@rc/types'
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
  Textarea,
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { CategoryPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import {
  type OptionDraft,
  OptionsEditor,
  type RowOverride,
  VariantRows,
  buildRows,
  combinationCount,
  initialOverrides,
  optionErrorsFor,
  toOptionDrafts,
  usableOptions,
} from './VariantBuilder'
import { MAX_VARIANTS, nextProductCode } from './lib'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Product | null
  onSaved: (product: Product) => void
}

export function ProductDialog({ open, onOpenChange, editing, onSaved }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <ProductForm
            editing={editing}
            onDone={(product) => {
              if (product) onSaved(product)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Draft = {
  name: string
  categoryId: string | null
  type: ProductType
  assisted: boolean
  price: string
  compareAt: string
  memberPrice: string
  cost: string
  description: string
  bestFor: string
  tags: string
  options: OptionDraft[]
  overrides: Record<string, RowOverride>
}

const TYPE_OPTIONS = (Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map((t) => ({
  value: t,
  label: PRODUCT_TYPE_LABEL[t],
}))

const money = (value: number | null) => (value ? String(value) : '')
const digitsOnly = (value: string) => value.replace(/[^\d]/g, '')
const toAmount = (value: string) => Number(value) || 0

function toDraft(product: Product | null): Draft {
  if (!product) {
    return {
      name: '',
      categoryId: null,
      type: 'physical',
      assisted: false,
      price: '',
      compareAt: '',
      memberPrice: '',
      cost: '',
      description: '',
      bestFor: '',
      tags: '',
      options: [],
      overrides: {},
    }
  }
  return {
    name: product.name,
    categoryId: product.categoryId,
    type: product.type,
    assisted: product.assisted,
    price: money(product.price),
    compareAt: money(product.compareAt),
    memberPrice: money(product.memberPrice),
    cost: money(product.cost),
    description: product.description,
    bestFor: product.bestFor,
    tags: product.tags.join(', '),
    options: toOptionDrafts(product.options),
    overrides: initialOverrides(product),
  }
}

function ProductForm({
  editing,
  onDone,
}: {
  editing: Product | null
  onDone: (product: Product | null) => void
}) {
  const { products, tenant, tenantId, dispatch } = useScoped()
  const [code] = useState(() => editing?.code ?? nextProductCode(products, tenant.code))
  const [draft, setDraft] = useState<Draft>(() => toDraft(editing))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setRow = (key: string, change: RowOverride) =>
    setDraft((d) => ({ ...d, overrides: { ...d.overrides, [key]: { ...d.overrides[key], ...change } } }))

  const price = toAmount(draft.price)
  const compareAt = toAmount(draft.compareAt)
  const memberPrice = toAmount(draft.memberPrice)

  const options = usableOptions(draft.options)
  const combos = combinationCount(options)
  const rows = buildRows(options, draft.overrides, code, editing)
  const live = rows.filter((r) => r.enabled)

  const optionErrors = optionErrorsFor(draft.options)

  const takenSkus = new Map(
    products
      .filter((p) => p.id !== editing?.id)
      .flatMap((p) => p.variants.map((v) => [v.sku.toUpperCase(), p.name] as const)),
  )
  const skuCount = new Map<string, number>()
  for (const r of live) {
    const sku = r.sku.trim().toUpperCase()
    if (sku) skuCount.set(sku, (skuCount.get(sku) ?? 0) + 1)
  }
  const rowErrors: Record<string, string | undefined> = {}
  for (const r of live) {
    const sku = r.sku.trim().toUpperCase()
    const owner = takenSkus.get(sku)
    rowErrors[r.key] = !sku
      ? `Give ${r.label} a SKU.`
      : (skuCount.get(sku) ?? 0) > 1
        ? `Use SKU ${sku} on one variant only.`
        : owner
          ? `SKU ${sku} already belongs to ${owner}. Choose another.`
          : undefined
  }

  const errors = {
    name: !draft.name.trim() ? 'Name the product.' : undefined,
    category: !draft.categoryId ? 'Choose a category.' : undefined,
    price: !draft.assisted && price <= 0 ? 'Enter a price above Rp 0, or turn on Talk to sales.' : undefined,
    compareAt:
      compareAt && compareAt <= price
        ? 'Set the compare-at price above the price, or leave it empty.'
        : undefined,
    memberPrice:
      memberPrice && price && memberPrice >= price
        ? 'Set the member price below the price, or leave it empty.'
        : undefined,
    options: Object.values(optionErrors).find(Boolean),
    variants:
      combos > MAX_VARIANTS
        ? `These options make ${combos} combinations. Remove values until there are ${MAX_VARIANTS} or fewer.`
        : !live.length
          ? 'Switch on at least one variant.'
          : Object.values(rowErrors).find(Boolean),
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean) || !draft.categoryId) return
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t, i, all) => t && all.indexOf(t) === i)
    const product: Product = {
      ...(editing ?? {
        id: newId('prd'),
        tenantId,
        code,
        status: 'draft',
        rating: 0,
        reviewCount: 0,
        views30d: 0,
        createdAt: nowIso(),
        publishAt: null,
        attributes: {},
      }),
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      type: draft.type,
      assisted: draft.assisted,
      price,
      compareAt: compareAt || null,
      memberPrice: memberPrice || null,
      cost: toAmount(draft.cost),
      description: draft.description.trim(),
      bestFor: draft.bestFor.trim(),
      tags,
      options,
      variants: live.map((r) => ({
        id: r.id ?? newId('var'),
        name: r.label,
        optionValues: r.values,
        sku: r.sku.trim().toUpperCase(),
        barcode: r.barcode,
        price: toAmount(r.price) || price,
      })),
    }
    dispatch({ type: 'products/save', product })
    toast(editing ? 'Product saved' : 'Product created', {
      tone: 'success',
      description: `${product.code} · ${product.name}${editing ? '' : ' · saved as a draft'}`,
    })
    onDone(product)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.code}` : 'New product'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Changes show on the storefront and every personal store right away.'
            : `It gets the code ${code} and starts as a draft. Activate it when the price and variants are ready.`}
        </DialogDescription>
      </DialogHeader>

      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField
          label="Name"
          required
          htmlFor="product-name"
          error={show(errors.name)}
          className="sm:col-span-2"
        >
          <Input
            id="product-name"
            variant="soft"
            autoFocus
            value={draft.name}
            placeholder="Velocity Pro 3"
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="Category" required htmlFor="product-category" error={show(errors.category)}>
          <CategoryPicker
            id="product-category"
            variant="soft"
            invalid={!!show(errors.category)}
            value={draft.categoryId}
            onChange={(categoryId) => set({ categoryId })}
          />
        </FormField>
        <FormField
          label="Type"
          htmlFor="product-type"
          hint="Digital, service and subscription products do not track stock."
        >
          <NativeSelect
            id="product-type"
            variant="soft"
            value={draft.type}
            options={TYPE_OPTIONS}
            onChange={(e) => set({ type: e.target.value as ProductType })}
          />
        </FormField>

        <label className="gap-3 rounded-2xl px-4 py-3 sm:col-span-2 flex items-center justify-between bg-surface">
          <span>
            <span className="text-sm font-medium block">Talk to sales</span>
            <span className="text-xs block text-muted">
              Customers ask for a quote instead of adding it to the cart. The price becomes optional.
            </span>
          </span>
          <Switch
            checked={draft.assisted}
            onCheckedChange={(assisted) => set({ assisted })}
            aria-label="Talk to sales"
          />
        </label>

        <FormField
          label="Price (Rp)"
          required={!draft.assisted}
          htmlFor="product-price"
          error={show(errors.price)}
          hint={draft.assisted ? 'Optional. Shown to sales as a guide.' : undefined}
        >
          <Input
            id="product-price"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.price}
            placeholder="2499000"
            onChange={(e) => set({ price: digitsOnly(e.target.value) })}
          />
        </FormField>
        <FormField
          label="Compare-at price (Rp)"
          htmlFor="product-compare"
          hint="Shown struck through beside the price."
          error={show(errors.compareAt)}
        >
          <Input
            id="product-compare"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.compareAt}
            onChange={(e) => set({ compareAt: digitsOnly(e.target.value) })}
          />
        </FormField>
        <FormField
          label="Member price (Rp)"
          htmlFor="product-member"
          hint="Signed-in members pay this."
          error={show(errors.memberPrice)}
        >
          <Input
            id="product-member"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.memberPrice}
            onChange={(e) => set({ memberPrice: digitsOnly(e.target.value) })}
          />
        </FormField>
        <FormField
          label="Cost (Rp)"
          htmlFor="product-cost"
          hint="Your cost per unit. Only your team sees it."
        >
          <Input
            id="product-cost"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.cost}
            onChange={(e) => set({ cost: digitsOnly(e.target.value) })}
          />
        </FormField>

        <FormField label="Description" htmlFor="product-description" className="sm:col-span-2">
          <Textarea
            id="product-description"
            variant="soft"
            className="min-h-20"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </FormField>
        <FormField label="Best for" htmlFor="product-best" hint="One line that helps a customer choose.">
          <Input
            id="product-best"
            variant="soft"
            value={draft.bestFor}
            placeholder="Half and full marathon racing"
            onChange={(e) => set({ bestFor: e.target.value })}
          />
        </FormField>
        <FormField label="Tags" htmlFor="product-tags" hint="Separate tags with commas.">
          <Input
            id="product-tags"
            variant="soft"
            value={draft.tags}
            placeholder="carbon plate, race"
            onChange={(e) => set({ tags: e.target.value })}
          />
        </FormField>
      </div>

      <section aria-labelledby="product-options" className="mt-5">
        <h3 id="product-options" className="text-sm font-semibold">
          Options
        </h3>
        <p className="mb-3 mt-1 text-xs text-muted">
          Up to 3, such as Size, Colour or Material. Type each value and press Enter or a comma.
        </p>
        <OptionsEditor
          options={draft.options}
          onChange={(next) => set({ options: next })}
          optionErrors={tried ? optionErrors : {}}
        />
      </section>

      <section aria-labelledby="product-variants" className="mt-5">
        <div className="gap-2 flex flex-wrap items-baseline justify-between">
          <h3 id="product-variants" className="text-sm font-semibold">
            Variants
          </h3>
          <p className="text-xs text-muted tabular-nums">
            {options.length
              ? `${live.length} of ${plural(combos, 'combination')} on · ${options.map((o) => o.name).join(' × ')}`
              : 'One variant'}
          </p>
        </div>
        <p className="mb-3 mt-1 text-xs text-muted">
          Switch off a combination you do not sell. Leave a price empty to use the product price.
        </p>
        {rows.length > 0 && (
          <VariantRows
            rows={rows}
            basePrice={draft.price}
            multiple={options.length > 0}
            rowErrors={tried ? rowErrors : {}}
            onChange={setRow}
          />
        )}
        {(show(errors.variants) || combos > MAX_VARIANTS) && (
          <p role="alert" className="mt-2 text-xs font-medium text-danger">
            {errors.variants}
          </p>
        )}
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create product'}</Button>
      </DialogFooter>
    </form>
  )
}
