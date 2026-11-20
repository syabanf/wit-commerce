import type {
  Order,
  OrderLine,
  OrderTax,
  OrderTaxLine,
  Product,
  SellerLegal,
  TaxProfile,
  TaxSettings,
  Tenant,
} from '@rc/types'

// PPN (Indonesian VAT). Since 2025 the rate is 12%. Most goods are taxed on a base (DPP) of 11/12 of
// the selling price, so 11% in effect; luxury goods pay 12% on the full price. Only a PKP charges it.
// The Go twin is apps/api/internal/rules/tax.go; both must give the same rupiah for the same order.

export const DEFAULT_PPN_RATE = 12
export const DEFAULT_DPP_NUMERATOR = 11
export const DEFAULT_DPP_DENOMINATOR = 12
export const TAX_PROFILES: readonly TaxProfile[] = ['standard', 'luxury', 'exempt']
export const TAX_PROFILE_LABEL: Record<TaxProfile, string> = {
  standard: 'Standard: 12% on a base of 11/12',
  luxury: 'Luxury: 12% on the full price',
  exempt: 'Exempt: no PPN',
}
/** How many product and category overrides a brand may keep. */
export const MAX_TAX_OVERRIDES = 500

/** Whole rupiah, halves up. Both sides use the same float steps, so they round alike. */
export const roundHalfUp = (x: number) => Math.floor(x + 0.5)

/** Drops unset fields and empty override lists, so equal settings compare equal. */
export function normalizeTax(tax: TaxSettings): TaxSettings {
  return {
    pkp: tax.pkp,
    pricesIncludeTax: tax.pricesIncludeTax,
    profile: tax.profile,
    ...(tax.ratePct !== undefined && { ratePct: tax.ratePct }),
    ...(tax.dppNumerator !== undefined && { dppNumerator: tax.dppNumerator }),
    ...(tax.dppDenominator !== undefined && { dppDenominator: tax.dppDenominator }),
    ...(tax.overrides?.length && { overrides: tax.overrides.map((o) => ({ ...o, id: o.id.trim() })) }),
  }
}

/** Why the settings cannot be saved, or null. A PKP needs an NPWP in the legal details. */
export function taxBlocker(tax: TaxSettings, legal: SellerLegal | undefined): string | null {
  if (!TAX_PROFILES.includes(tax.profile)) return 'Pick standard, luxury or exempt as the default profile.'
  if (tax.pkp && !legal?.npwp) return 'Add the NPWP in the seller identity before turning PKP on.'
  if (tax.ratePct !== undefined && !(Number.isFinite(tax.ratePct) && tax.ratePct > 0 && tax.ratePct <= 100))
    return 'The PPN rate is a percentage above 0 and up to 100.'
  const num = tax.dppNumerator
  const den = tax.dppDenominator
  if ((num === undefined) !== (den === undefined))
    return 'Set both parts of the tax base fraction, or neither.'
  if (
    num !== undefined &&
    den !== undefined &&
    !(Number.isInteger(num) && Number.isInteger(den) && num > 0 && den > 0 && num <= den && den <= 1000)
  )
    return 'The tax base is a fraction such as 11/12, at most 1.'
  const overrides = tax.overrides ?? []
  if (overrides.length > MAX_TAX_OVERRIDES) return `Keep at most ${MAX_TAX_OVERRIDES} overrides.`
  const seen = new Set<string>()
  for (const o of overrides) {
    if ((o.kind !== 'product' && o.kind !== 'category') || !o.id.trim() || !TAX_PROFILES.includes(o.profile))
      return 'Each override names a product or category and a profile.'
    const key = `${o.kind}:${o.id.trim()}`
    if (seen.has(key)) return 'Each product or category takes one override.'
    seen.add(key)
  }
  return null
}

/** The profile of one product: its own override, else its category's, else the brand's default. */
export function taxProfileOf(
  tax: TaxSettings,
  productId: string,
  categoryId: string | undefined,
): TaxProfile {
  const overrides = tax.overrides ?? []
  const own = overrides.find((o) => o.kind === 'product' && o.id === productId)
  if (own) return own.profile
  const category = categoryId
    ? overrides.find((o) => o.kind === 'category' && o.id === categoryId)
    : undefined
  return category?.profile ?? tax.profile
}

/**
 * The PPN of a set of lines after an order-level discount. The discount is spread over the lines in
 * proportion to their value, rounding the running total so the shares add up to the discount. Each
 * line rounds its own DPP and PPN to whole rupiah, and the order's totals are the sums of the lines.
 *
 * Prices including PPN: ppn = price × rate × base / (100 + rate × base), and net = price − ppn.
 * Prices excluding PPN: net = price, dpp = net × base, ppn = dpp × rate / 100.
 */
export function orderTax(
  lines: readonly Pick<OrderLine, 'productId' | 'qty' | 'price'>[],
  discount: number,
  tax: TaxSettings,
  categoryOf: (productId: string) => string | undefined,
): OrderTax {
  const ratePct = tax.ratePct ?? DEFAULT_PPN_RATE
  const dppNumerator = tax.dppNumerator ?? DEFAULT_DPP_NUMERATOR
  const dppDenominator = tax.dppDenominator ?? DEFAULT_DPP_DENOMINATOR
  const gross = lines.map((l) => l.qty * l.price)
  const total = gross.reduce((a, b) => a + b, 0)
  const off = Math.max(0, Math.min(discount, total))
  let running = 0
  let shared = 0
  const taxLines = lines.map((l, i): OrderTaxLine => {
    running += gross[i]!
    const upTo = total > 0 ? roundHalfUp((off * running) / total) : 0
    const share = upTo - shared
    shared = upTo
    const amount = gross[i]! - share
    const profile = taxProfileOf(tax, l.productId, categoryOf(l.productId))
    if (profile === 'exempt') return { profile, net: amount, dpp: 0, ppn: 0 }
    const num = profile === 'luxury' ? 1 : dppNumerator
    const den = profile === 'luxury' ? 1 : dppDenominator
    if (tax.pricesIncludeTax) {
      const ppn = roundHalfUp((amount * ratePct * num) / (100 * den + ratePct * num))
      const net = amount - ppn
      return { profile, net, dpp: roundHalfUp((net * num) / den), ppn }
    }
    const dpp = roundHalfUp((amount * num) / den)
    return { profile, net: amount, dpp, ppn: roundHalfUp((dpp * ratePct) / 100) }
  })
  return {
    pricesIncludeTax: tax.pricesIncludeTax,
    ratePct,
    dppNumerator,
    dppDenominator,
    lines: taxLines,
    dpp: taxLines.reduce((n, l) => n + l.dpp, 0),
    ppn: taxLines.reduce((n, l) => n + l.ppn, 0),
  }
}

/** PPN the shopper pays on top of the prices: none when prices include it or the brand is no PKP. */
export const addedTax = (tax: OrderTax | undefined) => (tax && !tax.pricesIncludeTax ? tax.ppn : 0)

/**
 * The order as `orders/place` stores it. A PKP brand's order carries its PPN; with prices excluding
 * PPN the total becomes subtotal − discount + PPN + shipping. Shipping is the courier's charge passed
 * through and carries no PPN from the brand. Any other brand's order is stored without tax.
 */
export function withOrderTax(
  order: Order,
  tenant: Pick<Tenant, 'tax'> | undefined,
  products: readonly Pick<Product, 'id' | 'categoryId'>[],
): Order {
  const settings = tenant?.tax
  if (!settings?.pkp) {
    if (!('tax' in order)) return order
    const { tax: _, ...rest } = order
    return rest
  }
  const tax = orderTax(
    order.lines,
    order.discount,
    settings,
    (id) => products.find((p) => p.id === id)?.categoryId,
  )
  const total = settings.pricesIncludeTax
    ? order.total
    : Math.max(0, order.subtotal - order.discount + tax.ppn + order.shipping)
  return { ...order, tax, total }
}
