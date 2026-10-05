import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { Combobox } from '@rc/ui'

/** Searchable product picker for the tenant's active catalog. A bottom sheet on phones. */
export function ProductPicker({
  id,
  products,
  value,
  onChange,
  invalid,
  placeholder = 'Choose a product',
}: {
  id?: string
  products: Product[]
  value: string | null
  onChange: (id: string | null) => void
  invalid?: boolean
  placeholder?: string
}) {
  return (
    <Combobox
      id={id}
      variant="soft"
      items={products}
      getKey={(p) => p.id}
      getLabel={(p) => p.name}
      getDescription={(p) => `${p.code} · ${p.assisted ? 'Talk to sales' : fmtIdr(p.price)}`}
      getKeywords={(p) => [p.code, ...p.tags]}
      value={value}
      onChange={onChange}
      clearable
      invalid={invalid}
      placeholder={placeholder}
      searchPlaceholder="Search products"
      emptyText="No product matches"
      className="h-12"
    />
  )
}
