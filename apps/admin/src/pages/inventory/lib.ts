import { stockState, sumStock } from '@rc/fixtures'
import type { Product, StockLevel, StockState, Variant, Warehouse } from '@rc/types'

export interface StockRow {
  level: StockLevel
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

export function stockRows(levels: readonly StockLevel[], maps: Maps): StockRow[] {
  return levels.map((level) => {
    const product = maps.product.get(level.productId)
    const summary = sumStock([level])
    return {
      level,
      product,
      variant: maps.variant.get(level.variantId),
      warehouse: maps.warehouse.get(level.warehouseId),
      available: summary.available,
      state: product ? stockState(product, summary) : 'untracked',
    }
  })
}

/** The reducer refuses an adjustment that drops on hand below reserved; this is the same check with its sentence. */
