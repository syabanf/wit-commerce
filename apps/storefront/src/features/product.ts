import { attributesFor, formatAttribute, nowMs } from '@rc/fixtures'
import type { AttributeDef, Category, ModifierGroup, Product, Variant } from '@rc/types'
import { useMemo, useState } from 'react'
import { type CartItem, MAX_QTY, priceItem } from '../lib/cart'
import {
  categoryPath,
  compareAtPct,
  isBuyable,
  modifierAvailable,
  modifiersFor,
  productsIn,
  promoFor,
  sortProducts,
  variantAvailable,
} from '../lib/catalog'
import { useShop } from '../state/shop'

export interface OptionValueState {
  value: string
  /** In stock in combination with the other values chosen so far. */
  available: boolean
  selected: boolean
}

export interface OptionState {
  name: string
  kind: 'size' | 'colour' | 'other'
  values: OptionValueState[]
  selected: string
}

export interface ProductDetail {
  product: Product
  path: Category[]
  options: OptionState[]
  selectValue: (option: string, value: string) => void
  variant: Variant | null
  /** Units left of the chosen variant; null when always available. */
  available: number | null
  qty: number
  setQty: (qty: number) => void
  maxQty: number
  groups: ModifierGroup[]
  modifierAvailable: (optionId: string) => number | null
  choices: Record<string, string[]>
  /** Picks or drops an add-on option; an empty id clears the group. */
  toggleChoice: (group: ModifierGroup, optionId: string) => void
  /** The sentence beside a disabled Add to cart, or null when the shopper may add. */
  blocker: string | null
  unitPrice: number
  lineTotal: number
  discountPct: number | null
  cartDiscountPct: number | null
  /** A code offer that covers the product, shown as a hint. */
  codeOffer: { code: string; value: number } | null
  specs: { def: AttributeDef; value: string }[]
  related: Product[]
  /** Adds the line; returns the added cart line for the confirmation drawer. */
  add: () => CartItem | null
}

const kindOf = (name: string): OptionState['kind'] =>
  /colou?r|shade|warna/i.test(name) ? 'colour' : /size|ukuran/i.test(name) ? 'size' : 'other'

const fits = (v: Variant, values: Record<string, string>) =>
  Object.entries(values).every(([k, val]) => v.optionValues[k] === val)

export function useProductDetail(product: Product): ProductDetail {
  const { catalog, cart } = useShop()
  const inStock = (v: Variant) => {
    const n = variantAvailable(catalog, product, v.id)
    return n === null || n > 0
  }
  const firstVariant = product.variants.find(inStock) ?? product.variants[0] ?? null
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      product.options
        .filter((option) => option.values.length === 1)
        .map((option) => [option.name, option.values[0]!]),
    ),
  )
  const [qty, setQty] = useState(1)
  const groups = useMemo(() => modifiersFor(catalog, product.id), [catalog, product.id])
  const optionById = new Map(groups.flatMap((g) => g.options.map((o) => [o.id, o] as const)))
  const availableForModifier = (optionId: string) => {
    const option = optionById.get(optionId)
    return option ? modifierAvailable(catalog, option) : null
  }
  const [choices, setChoices] = useState<Record<string, string[]>>({})

  const missingOptions = product.options.filter((option) => !values[option.name])
  const variant = product.options.length
    ? missingOptions.length
      ? null
      : (product.variants.find((v) => fits(v, values)) ?? null)
    : firstVariant
  const available = variant ? variantAvailable(catalog, product, variant.id) : null
  const options: OptionState[] = product.options.map((o) => ({
    name: o.name,
    kind: kindOf(o.name),
    selected: values[o.name] ?? '',
    values: o.values.map((value) => {
      const combo = { ...values, [o.name]: value }
      return {
        value,
        available: product.variants.some((v) => fits(v, combo) && inStock(v)),
        selected: values[o.name] === value,
      }
    }),
  }))

  const missing = groups.find((g) => g.required && !choices[g.id]?.length)
  const deltas = groups.flatMap((g) => g.options.filter((o) => choices[g.id]?.includes(o.id)))
  const modifierLimit = deltas.reduce<number>((left, option) => {
    const count = modifierAvailable(catalog, option)
    return count === null ? left : Math.min(left, count)
  }, MAX_QTY)
  const maxQty = variant ? Math.max(1, Math.min(MAX_QTY, available ?? MAX_QTY, modifierLimit)) : 1
  let blocker: string | null = null
  if (product.assisted) blocker = 'This product is sold through our sales team.'
  else if (missingOptions.length)
    blocker = `Choose ${missingOptions.map((option) => option.name.toLowerCase()).join(' and ')} to continue.`
  else if (!variant) blocker = 'This combination is not made. Choose another option.'
  else if (available !== null && available <= 0)
    blocker = product.options.length
      ? `${variant.name} is sold out. Choose another option.`
      : 'This product is sold out.'
  else if (available !== null && qty > available)
    blocker = `Only ${available} left. Lower the quantity to continue.`
  else if (deltas.some((option) => (modifierAvailable(catalog, option) ?? Infinity) < qty)) {
    const option = deltas.find((o) => (modifierAvailable(catalog, o) ?? Infinity) < qty)!
    blocker = `Only ${modifierAvailable(catalog, option)} left of ${option.name}. Lower the quantity or choose another option.`
  } else if (missing) blocker = `Choose ${missing.name.toLowerCase()} to continue.`

  const unitPrice = (variant?.price ?? product.price) + deltas.reduce((n, o) => n + o.priceDelta, 0)
  const promo = promoFor(catalog, product, nowMs())
  const related = useMemo(() => {
    const same = productsIn(catalog, product.categoryId).filter((p) => p.id !== product.id)
    const parent = catalog.categoryMap.get(product.categoryId)?.parentId
    const wider = parent
      ? productsIn(catalog, parent).filter((p) => p.id !== product.id && !same.includes(p))
      : []
    return sortProducts([...same, ...wider], 'best')
      .filter((p) => isBuyable(catalog, p) || p.assisted)
      .slice(0, 4)
  }, [catalog, product])

  return {
    product,
    path: categoryPath(catalog, product.categoryId),
    options,
    selectValue: (name, value) => setValues((v) => ({ ...v, [name]: value })),
    variant,
    available,
    qty,
    setQty,
    maxQty,
    groups,
    modifierAvailable: availableForModifier,
    choices,
    toggleChoice: (group, optionId) =>
      setChoices((c) => {
        const current = c[group.id] ?? []
        if (!optionId) return { ...c, [group.id]: [] }
        if (group.selection === 'single')
          return { ...c, [group.id]: current.includes(optionId) && !group.required ? [] : [optionId] }
        if (current.includes(optionId)) return { ...c, [group.id]: current.filter((x) => x !== optionId) }
        if (current.length >= group.maxChoices) return c
        return { ...c, [group.id]: [...current, optionId] }
      }),
    blocker,
    unitPrice,
    lineTotal: unitPrice * qty,
    discountPct: compareAtPct(product) ?? (promo?.trigger === 'automatic' ? promo.value : null),
    cartDiscountPct: promo?.trigger === 'automatic' ? promo.value : null,
    codeOffer: promo && promo.trigger === 'code' ? { code: promo.code, value: promo.value } : null,
    specs: attributesFor(product.categoryId, catalog.attributes, catalog.categories)
      // How to use has its own callout on the page.
      .filter((d) => product.attributes[d.id] && d.code !== 'how_to_use')
      .map((def) => ({ def, value: formatAttribute(def, product.attributes[def.id]) })),
    related,
    add: () => {
      if (blocker || !variant) return null
      const modifiers = groups.flatMap((g) =>
        (choices[g.id] ?? []).map((optionId) => ({ groupId: g.id, optionId })),
      )
      const line = { productId: product.id, variantId: variant.id, qty, modifiers }
      cart.add(line)
      return priceItem(catalog, { ...line, key: '' })
    },
  }
}
