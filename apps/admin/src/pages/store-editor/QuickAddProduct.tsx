import { attributesFor, fmtIdr, newId, nowIso, productActivateBlocker } from '@rc/fixtures'
import type { Category, Product } from '@rc/types'
import {
  Button,
  Combobox,
  FormField,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { ImageUpload } from '../../components/ImageUpload'
import { useScoped } from '../../state/scoped'
import { nextProductCode } from '../products/lib'

const digits = (value: string) => value.replace(/\D/g, '')

/**
 * "Add a product" from the editor: name, price, photo, stock and category, nothing else. It saves the
 * product, puts it on sale when nothing blocks that, and receives the stock into the main warehouse.
 */
export function QuickAddProduct({ onClose }: { onClose: () => void }) {
  const s = useScoped()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [imageUrl, setImageUrl] = useState<string | undefined>()
  const [categoryId, setCategoryId] = useState<string | null>(s.categories[0]?.id ?? null)
  const [newCategory, setNewCategory] = useState<Category | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const categories = newCategory ? [...s.categories, newCategory] : s.categories
  const amount = Number(price) || 0
  const errors = {
    name: name.trim() ? undefined : 'Name the product.',
    price: amount > 0 ? undefined : 'Enter a price above Rp 0.',
    category: categoryId ? undefined : 'Choose a category, or type a new one.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean) || !categoryId) return
    const code = nextProductCode(s.products, s.tenant.code)
    const product: Product = {
      id: newId('prd'),
      tenantId: s.tenantId,
      code,
      name: name.trim(),
      categoryId,
      type: 'physical',
      status: 'draft',
      price: amount,
      compareAt: null,
      memberPrice: null,
      cost: 0,
      tags: [],
      options: [],
      attributes: {},
      description: '',
      bestFor: '',
      variants: [
        { id: newId('var'), sku: code, name: 'Standard', optionValues: {}, price: amount, barcode: '' },
      ],
      rating: 0,
      reviewCount: 0,
      views30d: 0,
      assisted: false,
      createdAt: nowIso(),
      publishAt: null,
      ...(imageUrl && { imageUrl }),
    }
    const defs = s.attributes.filter((a) => a.tenantId === s.tenantId)
    const blocker = productActivateBlocker(product, attributesFor(categoryId, defs, categories))
    const warehouse = s.warehouses[0]
    const qty = Number(stock) || 0
    setBusy(true)
    try {
      if (newCategory?.id === categoryId)
        await s.dispatchAsync({ type: 'categories/save', category: newCategory })
      await s.dispatchAsync({ type: 'products/save', product })
      if (!blocker) await s.dispatchAsync({ type: 'products/setStatus', id: product.id, status: 'active' })
      if (qty > 0 && warehouse)
        await s.dispatchAsync({
          type: 'stock/receive',
          tenantId: s.tenantId,
          productId: product.id,
          variantId: product.variants[0]!.id,
          warehouseId: warehouse.id,
          qty,
          note: 'Added from the store editor',
        })
      toast(blocker ? 'Product saved as a draft' : 'Product added', {
        tone: 'success',
        description: blocker
          ? `${product.name}. ${blocker} Open it in Products to finish.`
          : `${product.name} · ${fmtIdr(amount)}${qty && warehouse ? ` · ${qty} in stock` : ''}`,
      })
      onClose()
    } catch (err) {
      toast('The product was not saved', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <form noValidate onSubmit={(e) => void submit(e)} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Add a product</SheetTitle>
            <SheetDescription>
              It goes on sale in your store right away. Add sizes and more in Products.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <FormField label="Name" required htmlFor="quick-name" error={show(errors.name)}>
              <Input
                id="quick-name"
                variant="soft"
                autoFocus
                value={name}
                placeholder="Iced palm sugar coffee"
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <FormField label="Price" required htmlFor="quick-price" error={show(errors.price)}>
              <Input
                id="quick-price"
                variant="soft"
                inputMode="numeric"
                inputClassName="tabular-nums"
                leftIcon={<span className="text-sm font-medium">Rp</span>}
                value={amount ? fmtIdr(amount).replace(/^Rp\s*/, '') : ''}
                placeholder="25.000"
                onChange={(e) => setPrice(digits(e.target.value))}
              />
            </FormField>
            <FormField label="Photo" htmlFor="quick-photo">
              <ImageUpload
                id="quick-photo"
                tenantId={s.tenantId}
                label="Product photo"
                value={imageUrl}
                onChange={setImageUrl}
              />
            </FormField>
            <FormField
              label="Stock"
              htmlFor="quick-stock"
              hint={
                s.warehouses[0]
                  ? `How many you have now, kept in ${s.warehouses[0].name}.`
                  : 'Add a warehouse in Inventory to track stock.'
              }
            >
              <Input
                id="quick-stock"
                variant="soft"
                inputMode="numeric"
                inputClassName="tabular-nums"
                value={stock}
                placeholder="10"
                disabled={!s.warehouses[0]}
                onChange={(e) => setStock(digits(e.target.value))}
              />
            </FormField>
            <FormField label="Category" required htmlFor="quick-category" error={show(errors.category)}>
              <Combobox
                id="quick-category"
                variant="soft"
                items={categories}
                value={categoryId}
                onChange={setCategoryId}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                placeholder={categories.length ? 'Choose a category' : 'Type a name to add one'}
                searchPlaceholder="Search or type a new category"
                createLabel={(query) => `Add "${query}"`}
                onCreate={(query) => {
                  const category: Category = {
                    id: newId('cat'),
                    tenantId: s.tenantId,
                    name: query.trim(),
                    description: '',
                    parentId: null,
                  }
                  setNewCategory(category)
                  setCategoryId(category.id)
                }}
              />
            </FormField>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Add product
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
