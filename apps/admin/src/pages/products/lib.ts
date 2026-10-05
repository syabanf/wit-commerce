import {
  DAY,
  type StockSummary,
  dayKey,
  fmtDateShort,
  isSold,
  nextCode,
  startOfDay,
  stockState,
  toMs,
} from '@rc/fixtures'
import type { Order, Product, StockState } from '@rc/types'

const NO_STOCK: StockSummary = { onHand: 0, reserved: 0, available: 0, safety: 0 }

export function productStock(
  product: Product,
  byProduct: Map<string, StockSummary>,
): { summary: StockSummary; state: StockState } {
  const summary = byProduct.get(product.id) ?? NO_STOCK
  return { summary, state: stockState(product, summary) }
}

/**
 * Next product code for the tenant, following the prefix its products already use ("LR-101" → "LR-124").
 * A tenant without products starts from its own code.
 */
export function nextProductCode(products: readonly Product[], tenantCode: string): string {
  const counts = new Map<string, { count: number; digits: number }>()
  for (const p of products) {
    const match = /^([A-Z]+-)(\d+)$/.exec(p.code)
    if (!match) continue
    const [, prefix = '', digits = ''] = match
    const entry = counts.get(prefix) ?? { count: 0, digits: digits.length }
    counts.set(prefix, { count: entry.count + 1, digits: Math.max(entry.digits, digits.length) })
  }
  const best = [...counts].sort((a, b) => b[1].count - a[1].count)[0]
  const prefix = best?.[0] ?? `${tenantCode.slice(0, 2).toUpperCase()}-`
  const codes = products.map((p) => p.code)
  return nextCode(codes, prefix, best?.[1].digits ?? 3)
}

/** Units of one product on sold orders per day, for the last `days` days, today included. */
export function dailyUnits(productId: string, orders: readonly Order[], days: number, now: number) {
  const start = startOfDay(now) - (days - 1) * DAY
  const points = Array.from({ length: days }, (_, i) => ({
    day: dayKey(start + i * DAY),
    label: fmtDateShort(start + i * DAY),
    value: 0,
  }))
  const index = new Map(points.map((p, i) => [p.day, i]))
  for (const o of orders) {
    if (!isSold(o)) continue
    const i = index.get(dayKey(toMs(o.createdAt)))
    if (i === undefined) continue
    for (const l of o.lines) if (l.productId === productId) points[i]!.value += l.qty
  }
  return points
}

/** Option dimensions a product may have, and the most combinations the builder generates. */
export const MAX_OPTIONS = 3
export const MAX_VARIANTS = 100

/** Stable key of one combination in option order, for matching rows across edits. */
export const comboKey = (options: readonly { name: string }[], values: Record<string, string>) =>
  options.map((o) => `${o.name}=${values[o.name] ?? ''}`).join('|')

/** "LR-101-42-NAVY": the product code and the values, uppercase, without spaces. */
export const defaultSku = (code: string, values: readonly string[]) =>
  [code, ...values].join('-').replace(/\s+/g, '').toUpperCase()

/** True when two option-value maps name the same options with the same values. */
export function sameValues(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

/** "Size × Colour", or null for a single-variant product. */
export const optionAxes = (product: Pick<Product, 'options'>) =>
  product.options.length ? product.options.map((o) => o.name).join(' × ') : null
