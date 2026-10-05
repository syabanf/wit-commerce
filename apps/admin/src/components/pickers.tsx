import { LOYALTY_TIER_LABEL, PAYMENT_METHOD_LABEL, TEMPLATE_SCOPE_LABEL, type TemplateScope } from '@rc/types'
import { fmtIdr, metricsFor, plural } from '@rc/fixtures'
import { Avatar, Combobox, MultiCombobox } from '@rc/ui'
import { useMemo } from 'react'
import { useScoped } from '../state/scoped'

type Common = {
  id?: string
  /** Name for screen readers when no visible label points at the picker (filters, inline rows). */
  'aria-label'?: string
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  invalid?: boolean
  variant?: 'default' | 'soft' | 'inline'
  className?: string
}
type Single = Common & { value: string | null; onChange: (value: string | null) => void }
type Multi = Common & { values: string[]; onChange: (values: string[]) => void }

export function CustomerPicker(p: Single) {
  const { customers, crm } = useScoped()
  return (
    <Combobox
      {...p}
      items={customers}
      placeholder={p.placeholder ?? 'Select customer'}
      searchPlaceholder="Search name, email, phone or code"
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getDescription={(c) => {
        const m = metricsFor(crm.metrics, c.id)
        return `${c.code} · ${LOYALTY_TIER_LABEL[c.tier]} · ${plural(m.orders, 'order')}`
      }}
      getKeywords={(c) => [c.email, c.phone, c.code, c.city]}
      renderIcon={(c) => <Avatar name={c.name} color={c.color} size="xs" />}
    />
  )
}

export function ProductPicker({ activeOnly = true, ...p }: Single & { activeOnly?: boolean }) {
  const { products, categoryName } = useScoped()
  const items = useMemo(
    () => products.filter((x) => !activeOnly || x.status === 'active'),
    [products, activeOnly],
  )
  return (
    <Combobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Select product'}
      searchPlaceholder="Search name, code or tag"
      getKey={(x) => x.id}
      getLabel={(x) => x.name}
      getDescription={(x) =>
        `${x.code} · ${categoryName(x.categoryId)} · ${x.assisted ? 'Talk to sales' : fmtIdr(x.price)}`
      }
      getKeywords={(x) => [x.code, ...x.tags, ...x.variants.map((v) => v.sku)]}
    />
  )
}

export function ProductsPicker(p: Multi) {
  const { products, categoryName } = useScoped()
  const items = useMemo(() => products.filter((x) => x.status === 'active'), [products])
  return (
    <MultiCombobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Choose products'}
      searchPlaceholder="Search products"
      getKey={(x) => x.id}
      getLabel={(x) => x.name}
      getDescription={(x) => `${x.code} · ${categoryName(x.categoryId)}`}
      getKeywords={(x) => [x.code, ...x.tags]}
    />
  )
}

/** Variant of one product, or of every product when productId is null. */
export function VariantPicker({ productId, ...p }: Single & { productId: string | null }) {
  const { products } = useScoped()
  const items = useMemo(
    () =>
      products
        .filter((x) => !productId || x.id === productId)
        .flatMap((x) => x.variants.map((v) => ({ ...v, productId: x.id, productName: x.name }))),
    [products, productId],
  )
  return (
    <Combobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Select variant'}
      searchPlaceholder="Search SKU or size"
      getKey={(v) => v.id}
      getLabel={(v) => (productId ? v.name : `${v.productName} · ${v.name}`)}
      getDescription={(v) => v.sku}
      getKeywords={(v) => [v.barcode, v.productName]}
    />
  )
}

export function CategoryPicker({
  topLevelOnly = false,
  excludeId,
  ...p
}: Single & { topLevelOnly?: boolean; excludeId?: string }) {
  const { categories: all, products, categoryName } = useScoped()
  const categories = useMemo(
    () => all.filter((c) => c.id !== excludeId && (!topLevelOnly || !c.parentId)),
    [all, excludeId, topLevelOnly],
  )
  return (
    <Combobox
      {...p}
      items={categories}
      placeholder={p.placeholder ?? 'Select category'}
      searchPlaceholder="Search categories"
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getDescription={(c) =>
        `${c.parentId ? `In ${categoryName(c.parentId)} · ` : ''}${plural(products.filter((x) => x.categoryId === c.id).length, 'product')}`
      }
    />
  )
}

export function CategoriesPicker(p: Multi) {
  const { categories, categoryName } = useScoped()
  return (
    <MultiCombobox
      {...p}
      items={categories}
      placeholder={p.placeholder ?? 'All products'}
      searchPlaceholder="Search categories"
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getDescription={(c) => (c.parentId ? `In ${categoryName(c.parentId)}` : 'Top level')}
    />
  )
}

export function WarehousePicker(p: Single) {
  const { warehouses } = useScoped()
  return (
    <Combobox
      {...p}
      items={warehouses}
      placeholder={p.placeholder ?? 'Select warehouse'}
      searchPlaceholder="Search warehouses"
      getKey={(w) => w.id}
      getLabel={(w) => w.name}
      getDescription={(w) => `${w.code} · ${w.city}`}
    />
  )
}

export function SellerPicker({ activeOnly = true, ...p }: Single & { activeOnly?: boolean }) {
  const { sellers } = useScoped()
  const items = useMemo(
    () => sellers.filter((s) => !activeOnly || s.status === 'active'),
    [sellers, activeOnly],
  )
  return (
    <Combobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Select seller'}
      searchPlaceholder="Search sellers"
      getKey={(s) => s.id}
      getLabel={(s) => s.name}
      getDescription={(s) => `${s.code} · ${s.city} · /${s.slug}`}
      getDisabledReason={(s) => (s.status === 'suspended' ? 'Suspended' : null)}
      renderIcon={(s) => <Avatar name={s.name} color={s.color} size="xs" />}
    />
  )
}

export function SegmentPicker(p: Single) {
  const { segments } = useScoped()
  return (
    <Combobox
      {...p}
      items={segments}
      placeholder={p.placeholder ?? 'Select segment'}
      searchPlaceholder="Search segments"
      getKey={(s) => s.id}
      getLabel={(s) => s.name}
      getDescription={(s) => `${s.builtIn ? 'Built-in' : 'Custom'} · ${s.description}`}
    />
  )
}

export function UserPicker(p: Single) {
  const { users } = useScoped()
  return (
    <Combobox
      {...p}
      items={users}
      placeholder={p.placeholder ?? 'Select person'}
      searchPlaceholder="Search people"
      getKey={(u) => u.id}
      getLabel={(u) => u.name}
      getDescription={(u) => u.title}
      getKeywords={(u) => [u.email, u.role]}
      renderIcon={(u) => <Avatar name={u.name} color={u.color} size="xs" />}
    />
  )
}

export function TemplatePicker({
  scope,
  allowedIds,
  ...p
}: Single & { scope?: TemplateScope; allowedIds?: string[] }) {
  const { templates } = useScoped()
  const items = useMemo(() => templates.filter((t) => !scope || t.scope === scope), [templates, scope])
  return (
    <Combobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Select template'}
      searchPlaceholder="Search templates"
      getKey={(t) => t.id}
      getLabel={(t) => t.name}
      getDescription={(t) => `${TEMPLATE_SCOPE_LABEL[t.scope]} · ${t.bestFor}`}
      getDisabledReason={(t) =>
        allowedIds && !allowedIds.includes(t.id) ? 'Not allowed for this seller' : null
      }
    />
  )
}

export function PromotionPicker(p: Single) {
  const { promotions } = useScoped()
  const items = useMemo(() => promotions.filter((x) => x.status !== 'expired'), [promotions])
  return (
    <Combobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Select promotion'}
      searchPlaceholder="Search code or name"
      getKey={(x) => x.id}
      getLabel={(x) => (x.trigger === 'code' ? `${x.code} · ${x.name}` : x.name)}
      getDescription={(x) => x.status}
    />
  )
}

export function PagePicker(p: Single) {
  const { pages } = useScoped()
  const items = useMemo(() => pages.filter((x) => x.kind !== 'personal'), [pages])
  return (
    <Combobox
      {...p}
      items={items}
      placeholder={p.placeholder ?? 'Select page'}
      searchPlaceholder="Search pages"
      getKey={(x) => x.id}
      getLabel={(x) => x.title}
      getDescription={(x) => `${x.slug} · ${x.status}`}
    />
  )
}

export function PaymentTypesPicker(p: Multi) {
  const { paymentTypes } = useScoped()
  return (
    <MultiCombobox
      {...p}
      items={paymentTypes}
      placeholder={p.placeholder ?? 'Any payment type'}
      searchPlaceholder="Search payment types"
      getKey={(t) => t.id}
      getLabel={(t) => t.name}
      getDescription={(t) =>
        `${PAYMENT_METHOD_LABEL[t.method]} · ${t.provider}${t.enabled ? '' : ' · Off at checkout'}`
      }
      getKeywords={(t) => [t.provider, t.method]}
    />
  )
}
