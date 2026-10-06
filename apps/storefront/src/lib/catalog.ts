import { type AppState, type StockSummary, collectionProducts, sumStock, toMs } from '@rc/fixtures'
import type {
  AttributeDef,
  Category,
  Collection,
  ModifierGroup,
  Page,
  PaymentType,
  Product,
  Promotion,
  Seller,
  Template,
  Tenant,
  Warehouse,
} from '@rc/types'

/** One tenant's storefront data, built once per state change. */
export interface Catalog {
  tenant: Tenant
  categories: Category[]
  topCategories: Category[]
  categoryMap: Map<string, Category>
  childrenOf: Map<string, Category[]>
  /** Products a shopper can see: active only. */
  products: Product[]
  /** Every product of the tenant, for order lines that outlive a product. */
  productMap: Map<string, Product>
  /** Stock per variant over the tenant's warehouses. */
  stock: Map<string, StockSummary>
  /** Stock per tracked modifier option over the tenant's warehouses. */
  modifierStock: Map<string, StockSummary>
  modifiers: ModifierGroup[]
  attributes: AttributeDef[]
  promotions: Promotion[]
  sellers: Seller[]
  warehouses: Warehouse[]
  pages: Page[]
  templates: Template[]
  collections: Collection[]
  paymentTypes: PaymentType[]
}

export function buildCatalog(state: AppState, tenant: Tenant): Catalog {
  const mine = <T extends { tenantId: string | null }>(list: readonly T[]) =>
    list.filter((x) => x.tenantId === tenant.id)
  const categories = mine(state.categories)
  const childrenOf = new Map<string, Category[]>()
  for (const c of categories) {
    if (!c.parentId) continue
    childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c])
  }
  const all = mine(state.products)
  const warehouses = mine(state.warehouses)
  const warehouseIds = new Set(warehouses.map((w) => w.id))
  const levels = new Map<string, AppState['stock']>()
  for (const s of state.stock) {
    if (!warehouseIds.has(s.warehouseId)) continue
    levels.set(s.variantId, [...(levels.get(s.variantId) ?? []), s])
  }
  const modifierLevels = new Map<string, AppState['modifierStock']>()
  for (const level of state.modifierStock) {
    if (!warehouseIds.has(level.warehouseId)) continue
    modifierLevels.set(level.optionId, [...(modifierLevels.get(level.optionId) ?? []), level])
  }
  return {
    tenant,
    categories,
    topCategories: categories.filter((c) => !c.parentId),
    categoryMap: new Map(categories.map((c) => [c.id, c])),
    childrenOf,
    products: all.filter((p) => p.status === 'active'),
    productMap: new Map(all.map((p) => [p.id, p])),
    stock: new Map([...levels].map(([id, list]) => [id, sumStock(list)])),
    modifierStock: new Map([...modifierLevels].map(([id, list]) => [id, sumStock(list)])),
    modifiers: mine(state.modifiers),
    attributes: mine(state.attributes),
    promotions: mine(state.promotions),
    sellers: mine(state.sellers),
    warehouses,
    pages: mine(state.pages),
    templates: state.templates.filter((t) => t.tenantId === null || t.tenantId === tenant.id),
    collections: mine(state.collections),
    paymentTypes: mine(state.paymentTypes ?? []),
  }
}

// --- stock ---

const UNTRACKED = new Set<Product['type']>(['digital', 'service', 'subscription'])

/** Units a shopper can buy of one variant; services and digital products have no stock limit. */
export function variantAvailable(catalog: Catalog, product: Product, variantId: string): number | null {
  if (UNTRACKED.has(product.type)) return null
  const summary = catalog.stock.get(variantId)
  return Math.max(0, summary?.available ?? 0)
}

export function modifierAvailable(
  catalog: Catalog,
  option: { id: string; stockTracked?: boolean },
): number | null {
  if (!option.stockTracked) return null
  return Math.max(0, catalog.modifierStock.get(option.id)?.available ?? 0)
}

export function productAvailable(catalog: Catalog, product: Product): number | null {
  let total = 0
  for (const v of product.variants) {
    const n = variantAvailable(catalog, product, v.id)
    if (n === null) return null
    total += n
  }
  return total
}

export const isBuyable = (catalog: Catalog, product: Product) => {
  if (product.assisted) return false
  const n = productAvailable(catalog, product)
  return n === null || n > 0
}

/** "In stock", "Only 3 left", "Sold out". */
export function stockNote(available: number | null): string {
  if (available === null) return 'Always available'
  if (available <= 0) return 'Sold out'
  if (available <= 5) return `Only ${available} left`
  return 'In stock'
}

// --- categories ---

export function categoryIdsUnder(catalog: Catalog, id: string): Set<string> {
  return new Set([id, ...(catalog.childrenOf.get(id) ?? []).map((c) => c.id)])
}

export function productsIn(catalog: Catalog, categoryId: string): Product[] {
  const ids = categoryIdsUnder(catalog, categoryId)
  return catalog.products.filter((p) => ids.has(p.categoryId))
}

/** Top-level category first. */
export function categoryPath(catalog: Catalog, id: string): Category[] {
  const c = catalog.categoryMap.get(id)
  if (!c) return []
  const parent = c.parentId ? catalog.categoryMap.get(c.parentId) : undefined
  return parent ? [parent, c] : [c]
}

export const categoryName = (catalog: Catalog, id: string) => catalog.categoryMap.get(id)?.name ?? 'Other'

/** Top-level categories by how much shoppers look at them. */
export function popularCategories(catalog: Catalog): Category[] {
  const views = (c: Category) => productsIn(catalog, c.id).reduce((n, p) => n + p.views30d, 0)
  return [...catalog.topCategories]
    .filter((c) => productsIn(catalog, c.id).length)
    .sort((a, b) => views(b) - views(a))
}

// --- pricing ---

export const fromPrice = (p: Product) =>
  p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : p.price

/** Percent off the compare-at price, when there is one. */
export function compareAtPct(p: Product): number | null {
  if (!p.compareAt || p.compareAt <= p.price || p.assisted) return null
  return Math.round(((p.compareAt - p.price) / p.compareAt) * 100)
}

/** Public promotions open right now: no seller, no segment, no payment condition, inside their window. */
export function runningPromotions(catalog: Catalog, now: number): Promotion[] {
  return catalog.promotions.filter(
    (p) =>
      p.status === 'active' &&
      !p.sellerId &&
      !p.segmentId &&
      !p.paymentTypeIds.length &&
      toMs(p.startAt) <= now &&
      toMs(p.endAt) >= now &&
      (p.usageLimit === null || p.used < p.usageLimit),
  )
}

/** Whether a promotion's scope (categories with their sub-categories, or products) covers a product. */
export function promotionCovers(catalog: Catalog, p: Promotion, product: Product): boolean {
  if (!p.categoryIds.length && !p.productIds.length) return true
  const parent = catalog.categoryMap.get(product.categoryId)?.parentId ?? ''
  return (
    p.productIds.includes(product.id) ||
    p.categoryIds.includes(product.categoryId) ||
    p.categoryIds.includes(parent)
  )
}

/** The scoped percentage offer that covers a product, automatic ones first. */
export function promoFor(catalog: Catalog, product: Product, now: number): Promotion | null {
  const scoped = runningPromotions(catalog, now).filter(
    (p) =>
      p.kind === 'percentage' &&
      (p.categoryIds.length || p.productIds.length) &&
      promotionCovers(catalog, p, product),
  )
  return scoped.find((p) => p.trigger === 'automatic') ?? scoped[0] ?? null
}

/** The first-order code a guest sees, such as WELCOME10. */
export function welcomePromotion(catalog: Catalog, now: number): Promotion | null {
  const open = runningPromotions(catalog, now).filter((p) => p.trigger === 'code')
  return (
    open.find((p) => p.code.startsWith('WELCOME')) ??
    open.find((p) => p.kind === 'percentage' && !p.categoryIds.length && !p.productIds.length) ??
    null
  )
}

// --- collections ---

export const collectionItems = (catalog: Catalog, c: Collection) =>
  collectionProducts(c, catalog.products, catalog.categories).filter((p) => p.status === 'active')

/** Featured collections that hold at least one product. */
export const featuredCollections = (catalog: Catalog) =>
  catalog.collections.filter((c) => c.featured && collectionItems(catalog, c).length)

// --- search and sort ---

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')

/** Every word of the query appears in the name, a tag or the category path. */
export function matchesQuery(catalog: Catalog, p: Product, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = normalize(
    [p.name, p.code, ...p.tags, p.bestFor, ...categoryPath(catalog, p.categoryId).map((c) => c.name)].join(
      ' ',
    ),
  )
  return words.every((w) => haystack.includes(w.replace(/s$/, '')))
}

export type SortKey = 'featured' | 'best' | 'new' | 'price_asc' | 'price_desc'
export const SORT_LABEL: Record<SortKey, string> = {
  featured: 'Featured',
  best: 'Best selling',
  new: 'New arrivals',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
}
export const isSortKey = (value: string | null): value is SortKey => !!value && value in SORT_LABEL

/** Talk-to-sales products have no price, so price sorts put them last. */
export function sortProducts(list: readonly Product[], sort: SortKey): Product[] {
  const priced = (p: Product, dir: 1 | -1) => (p.assisted ? Infinity : dir * fromPrice(p))
  const out = [...list]
  switch (sort) {
    case 'best':
      return out.sort((a, b) => b.views30d - a.views30d)
    case 'new':
      return out.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
    case 'price_asc':
      return out.sort((a, b) => priced(a, 1) - priced(b, 1))
    case 'price_desc':
      return out.sort((a, b) => priced(a, -1) - priced(b, -1))
    default:
      return out
  }
}

export const bestSellers = (catalog: Catalog, n = 8) => sortProducts(catalog.products, 'best').slice(0, n)

// --- product details ---

export const modifiersFor = (catalog: Catalog, productId: string) =>
  catalog.modifiers.filter((g) => g.productIds.includes(productId))

/** Products that open the cart straight from a card: one variant, no required add-ons. */
export function quickAddable(catalog: Catalog, p: Product): boolean {
  return (
    isBuyable(catalog, p) && p.variants.length === 1 && !modifiersFor(catalog, p.id).some((g) => g.required)
  )
}

/** Bundles, gift-wrappable products and anything in a gift category. */
export function giftable(catalog: Catalog, p: Product): boolean {
  return (
    p.type === 'bundle' ||
    p.tags.some((t) => /gift/i.test(t)) ||
    categoryPath(catalog, p.categoryId).some((c) => /gift/i.test(c.name)) ||
    modifiersFor(catalog, p.id).some((g) => /gift/i.test(g.name))
  )
}

/** The running offer that ends soonest, with the products it covers. */
export function currentDeal(
  catalog: Catalog,
  now: number,
): { promotion: Promotion; products: Product[] } | null {
  const ending = runningPromotions(catalog, now)
    .filter((p) => p.kind !== 'free_shipping')
    .sort((a, b) => toMs(a.endAt) - toMs(b.endAt))[0]
  if (!ending) return null
  const best = sortProducts(
    catalog.products.filter((p) => isBuyable(catalog, p)),
    'best',
  )
  const covered = best.filter((p) => promotionCovers(catalog, ending, p))
  return { promotion: ending, products: (covered.length ? covered : best).slice(0, 6) }
}

/** True when a good share of the catalog sells through Talk to sales (B2B tenants). */
export const sellsThroughSales = (catalog: Catalog) =>
  catalog.products.filter((p) => p.assisted).length * 4 >= catalog.products.length
