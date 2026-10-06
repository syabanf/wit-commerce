import { fmtNumber, plural, stockAdjustBlocker } from '@rc/fixtures'
import type { ModifierStockLevel, StockLevel } from '@rc/types'
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
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import {
  CategoryPicker,
  ModifierGroupPicker,
  ModifierOptionPicker,
  ProductPicker,
  VariantPicker,
  WarehousePicker,
} from '../../components/pickers'
import { useScoped } from '../../state/scoped'

const toQty = (value: string) => value.replace(/[^\d]/g, '')

export function AdjustDialog({
  level,
  onOpenChange,
}: {
  level: StockLevel | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!level} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {level && <AdjustForm level={level} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

export function AdjustModifierDialog({
  level,
  onOpenChange,
}: {
  level: ModifierStockLevel | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!level} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {level && <AdjustForm level={level} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AdjustForm({ level, onDone }: { level: StockLevel | ModifierStockLevel; onDone: () => void }) {
  const { maps, modifiers, productName, dispatch } = useScoped()
  const [direction, setDirection] = useState<'add' | 'remove'>('remove')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const modifier = 'optionId' in level
  const variant = 'variantId' in level ? maps.variant.get(level.variantId) : undefined
  const group = modifier ? modifiers.find((g) => g.id === level.groupId) : undefined
  const option = modifier ? group?.options.find((o) => o.id === level.optionId) : undefined
  const item = modifier
    ? `${group?.name ?? 'Modifier'} · ${option?.name ?? 'Removed option'}`
    : `${productName((level as StockLevel).productId)} · ${variant?.name}`
  const warehouse = maps.warehouse.get(level.warehouseId)
  const amount = Number(qty) || 0
  const delta = direction === 'add' ? amount : -amount
  const errors = {
    qty: amount < 1 ? 'Enter a quantity of at least 1.' : (stockAdjustBlocker(level, delta) ?? undefined),
    reason: !reason.trim() ? 'Say why the count changed, such as a recount or a damaged pair.' : undefined,
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.qty || errors.reason) return
    dispatch(
      modifier
        ? { type: 'modifierStock/adjust', levelId: level.id, delta, note: reason.trim() }
        : { type: 'stock/adjust', levelId: level.id, delta, note: reason.trim() },
    )
    toast('Stock adjusted', {
      tone: 'success',
      description: `${modifier ? (option?.name ?? 'Modifier') : (variant?.sku ?? 'Variant')} · ${warehouse?.name ?? 'warehouse'} · ${delta > 0 ? '+' : ''}${delta}, on hand now ${fmtNumber(level.onHand + delta)}`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>
          Adjust {modifier ? (option?.name ?? 'modifier stock') : (variant?.sku ?? 'stock')}
        </DialogTitle>
        <DialogDescription>
          {item} at {warehouse?.name}. {fmtNumber(level.onHand)} on hand, {fmtNumber(level.reserved)} reserved
          for open orders.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <SegmentedControl
          aria-label="Add or remove units"
          value={direction}
          onChange={(value) => setDirection(value === 'add' ? 'add' : 'remove')}
          options={[
            { value: 'remove', label: 'Remove' },
            { value: 'add', label: 'Add' },
          ]}
        />
        <FormField
          label="Units"
          required
          htmlFor="adjust-qty"
          error={show(errors.qty)}
          hint={
            amount
              ? `On hand goes from ${fmtNumber(level.onHand)} to ${fmtNumber(level.onHand + delta)}.`
              : undefined
          }
        >
          <Input
            id="adjust-qty"
            variant="soft"
            autoFocus
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={qty}
            onChange={(e) => setQty(toQty(e.target.value))}
          />
        </FormField>
        <FormField
          label="Reason"
          required
          htmlFor="adjust-reason"
          error={show(errors.reason)}
          hint="Shown in recent stock moves."
        >
          <Input
            id="adjust-reason"
            variant="soft"
            value={reason}
            placeholder="Stock count difference"
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">
          {amount ? `${direction === 'add' ? 'Add' : 'Remove'} ${plural(amount, 'unit')}` : 'Adjust stock'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ReceiveDialog({
  open,
  onOpenChange,
  initialTarget = 'variant',
  initialCategoryId,
  initialProductId,
  initialVariantId,
  initialGroupId,
  initialOptionId,
  initialWarehouseId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTarget?: 'variant' | 'modifier'
  initialCategoryId?: string
  initialProductId?: string
  initialVariantId?: string
  initialGroupId?: string
  initialOptionId?: string
  initialWarehouseId?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {open && <ReceiveForm
            initialTarget={initialTarget}
            initialCategoryId={initialCategoryId}
            initialProductId={initialProductId}
            initialVariantId={initialVariantId}
            initialGroupId={initialGroupId}
          initialOptionId={initialOptionId}
          initialWarehouseId={initialWarehouseId}
          onDone={() => onOpenChange(false)}
        />}
      </DialogContent>
    </Dialog>
  )
}

function ReceiveForm({
  initialTarget,
  initialCategoryId,
  initialProductId,
  initialVariantId,
  initialGroupId,
  initialOptionId,
  initialWarehouseId,
  onDone,
}: {
  initialTarget: 'variant' | 'modifier'
  initialCategoryId?: string
  initialProductId?: string
  initialVariantId?: string
  initialGroupId?: string
  initialOptionId?: string
  initialWarehouseId?: string
  onDone: () => void
}) {
  const { maps, modifiers, tenantId, productName, dispatch } = useScoped()
  const [target, setTarget] = useState(initialTarget)
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId ?? null)
  const [productId, setProductId] = useState<string | null>(initialProductId ?? null)
  const [variantId, setVariantId] = useState<string | null>(initialVariantId ?? null)
  const [groupId, setGroupId] = useState<string | null>(initialGroupId ?? null)
  const [optionId, setOptionId] = useState<string | null>(initialOptionId ?? null)
  const [warehouseId, setWarehouseId] = useState<string | null>(initialWarehouseId ?? null)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const amount = Number(qty) || 0
  const variant = variantId ? maps.variant.get(variantId) : undefined
  const group = modifiers.find((g) => g.id === groupId)
  const option = group?.options.find((o) => o.id === optionId && o.stockTracked)
  const errors = {
    category: target === 'variant' && !categoryId ? 'Choose a product category.' : undefined,
    product: target === 'variant' && !productId ? 'Choose the product you received.' : undefined,
    variant: target === 'variant' && !variant ? 'Choose the variant you received.' : undefined,
    group: target === 'modifier' && !group ? 'Choose the modifier group.' : undefined,
    option: target === 'modifier' && !option ? 'Choose the tracked option you received.' : undefined,
    warehouse: !warehouseId ? 'Choose the warehouse it arrived at.' : undefined,
    qty: amount < 1 ? 'Enter a quantity of at least 1.' : undefined,
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!warehouseId || errors.qty) return
    if (target === 'variant') {
      if (!categoryId || !productId || !variant || variant.productId !== productId) return
      dispatch({
        type: 'stock/receive',
        tenantId,
        productId: variant.productId,
        variantId: variant.id,
        warehouseId,
        qty: amount,
        note: note.trim() || 'Stock received',
      })
    } else {
      if (!group || !option) return
      dispatch({
        type: 'modifierStock/receive',
        tenantId,
        groupId: group.id,
        optionId: option.id,
        warehouseId,
        qty: amount,
        note: note.trim() || 'Modifier stock received',
      })
    }
    toast(`${plural(amount, 'unit')} received`, {
      tone: 'success',
      description: `${target === 'variant' && variant ? `${productName(variant.productId)} · ${variant.sku}` : `${group?.name} · ${option?.name}`} · ${maps.warehouse.get(warehouseId)?.name ?? 'warehouse'}`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Receive stock</DialogTitle>
        <DialogDescription>
          Record a delivery for a product variant or a physical modifier option. The units become available
          when you save.
        </DialogDescription>
      </DialogHeader>
      <SegmentedControl
        className="mb-4 w-full"
        aria-label="Stock item type"
        value={target}
        onChange={(value) => setTarget(value === 'modifier' ? 'modifier' : 'variant')}
        options={[
          { value: 'variant', label: 'Product variant' },
          { value: 'modifier', label: 'Modifier option' },
        ]}
      />
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        {target === 'variant' ? (
          <>
            <FormField label="Category" required htmlFor="receive-category" error={show(errors.category)}>
              <CategoryPicker
                id="receive-category"
                variant="soft"
                value={categoryId}
                onChange={(next) => {
                  setCategoryId(next)
                  setProductId(null)
                  setVariantId(null)
                }}
              />
            </FormField>
            <FormField label="Product" required htmlFor="receive-product" error={show(errors.product)}>
              <ProductPicker
                id="receive-product"
                variant="soft"
                categoryId={categoryId}
                includeDescendants
                disabled={!categoryId}
                placeholder={categoryId ? 'Select product' : 'Choose category first'}
                activeOnly={false}
                value={productId}
                onChange={(next) => {
                  setProductId(next)
                  setVariantId(null)
                }}
              />
            </FormField>
            <FormField
              label="Variant"
              required
              htmlFor="receive-variant"
              error={show(errors.variant)}
              className="sm:col-span-2"
            >
              <VariantPicker
                id="receive-variant"
                variant="soft"
                productId={productId}
                disabled={!productId}
                placeholder={productId ? 'Select variant' : 'Choose product first'}
                value={variantId}
                onChange={setVariantId}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Modifier group" required htmlFor="receive-group" error={show(errors.group)}>
              <ModifierGroupPicker
                id="receive-group"
                variant="soft"
                value={groupId}
                onChange={(next) => {
                  setGroupId(next)
                  setOptionId(null)
                }}
              />
            </FormField>
            <FormField label="Option" required htmlFor="receive-option" error={show(errors.option)}>
              <ModifierOptionPicker
                id="receive-option"
                variant="soft"
                groupId={groupId}
                value={optionId}
                onChange={setOptionId}
                disabled={!groupId}
                placeholder={groupId ? 'Select option' : 'Choose group first'}
              />
            </FormField>
          </>
        )}
        <FormField label="Warehouse" required htmlFor="receive-warehouse" error={show(errors.warehouse)}>
          <WarehousePicker
            id="receive-warehouse"
            variant="soft"
            value={warehouseId}
            onChange={setWarehouseId}
          />
        </FormField>
        <FormField label="Units" required htmlFor="receive-qty" error={show(errors.qty)}>
          <Input
            id="receive-qty"
            variant="soft"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={qty}
            onChange={(e) => setQty(toQty(e.target.value))}
          />
        </FormField>
        <FormField
          label="Note"
          htmlFor="receive-note"
          hint="Optional. A purchase order or delivery number."
          className="sm:col-span-2"
        >
          <Input
            id="receive-note"
            variant="soft"
            inputClassName="font-mono"
            value={note}
            placeholder="PO-2455"
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Receive stock</Button>
      </DialogFooter>
    </form>
  )
}
