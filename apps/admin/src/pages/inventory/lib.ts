import { stockState, sumStock } from '@rc/fixtures'
import type {
  ModifierGroup,
  ModifierOption,
  ModifierStockLevel,
  Product,
  StockLevel,
  StockState,
  Variant,
  Warehouse,
} from '@rc/types'

export interface StockRow {
  level: StockLevel
  recorded: boolean
  product: Product | undefined
  variant: Variant | undefined
  warehouse: Warehouse | undefined
  available: number
  state: StockState
}

type Maps = {
  product: Map<string, Product>
  variant: Map<string, Variant>
  warehouse: Map<string, Warehouse>
}

export function stockRows(
  levels: readonly StockLevel[],
  maps: Maps,
  products: readonly Product[],
  warehouses: readonly Warehouse[],
): StockRow[] {
  const recorded = new Set(levels.map((s) => `${s.variantId}:${s.warehouseId}`))
  const missing: StockLevel[] = products
    .filter((product) => product.type === 'physical')
    .flatMap((product) =>
      product.variants.flatMap((variant) =>
        warehouses
          .filter((warehouse) => warehouse.tenantId === product.tenantId)
          .filter((warehouse) => !recorded.has(`${variant.id}:${warehouse.id}`))
          .map((warehouse) => ({
            id: `unreceived:${variant.id}:${warehouse.id}`,
            tenantId: product.tenantId,
            productId: product.id,
            variantId: variant.id,
            warehouseId: warehouse.id,
            onHand: 0,
            reserved: 0,
            safety: 5,
          })),
      ),
    )
  return [...levels, ...missing].map((level) => {
    const product = maps.product.get(level.productId)
    const summary = sumStock([level])
    return {
      level,
      recorded: recorded.has(`${level.variantId}:${level.warehouseId}`),
      product,
      variant: maps.variant.get(level.variantId),
      warehouse: maps.warehouse.get(level.warehouseId),
      available: summary.available,
      state: product ? stockState(product, summary) : 'untracked',
    }
  })
}

export interface ModifierStockRow {
  key: string
  group: ModifierGroup
  option: ModifierOption
  warehouse: Warehouse | null
  level: ModifierStockLevel | null
  available: number | null
  state: StockState
}

export function modifierStockRows(
  groups: readonly ModifierGroup[],
  warehouses: readonly Warehouse[],
  levels: readonly ModifierStockLevel[],
): ModifierStockRow[] {
  return groups.flatMap((group) =>
    group.options.flatMap<ModifierStockRow>((option) => {
      if (!option.stockTracked) {
        return [
          {
            key: `${option.id}:untracked`,
            group,
            option,
            warehouse: null,
            level: null,
            available: null,
            state: 'untracked' as const,
          },
        ]
      }
      return warehouses.map((warehouse) => {
        const level = levels.find((s) => s.optionId === option.id && s.warehouseId === warehouse.id) ?? null
        const available = (level?.onHand ?? 0) - (level?.reserved ?? 0)
        return {
          key: `${option.id}:${warehouse.id}`,
          group,
          option,
          warehouse,
          level,
          available,
          state: (available <= 0
            ? 'out'
            : available <= (level?.safety ?? 5)
              ? 'low'
              : 'in_stock') as StockState,
        }
      })
    }),
  )
}

/** The reducer refuses an adjustment that drops on hand below reserved; this is the same check with its sentence. */
