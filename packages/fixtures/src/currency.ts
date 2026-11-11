// Estimated prices in other currencies. Stores sell, charge and report in rupiah; these helpers only
// change what a shopper reads. Rates are units of the currency per 1 IDR.

/** Currencies a store may offer besides rupiah. Mirrors domain.DisplayCurrencies in the API. */
export const DISPLAY_CURRENCIES = ['USD', 'SGD', 'MYR', 'EUR', 'JPY', 'AUD', 'GBP', 'CNY', 'THB'] as const
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]

export const CURRENCY_LABEL: Record<DisplayCurrency, string> = {
  USD: 'US dollar',
  SGD: 'Singapore dollar',
  MYR: 'Malaysian ringgit',
  EUR: 'Euro',
  JPY: 'Japanese yen',
  AUD: 'Australian dollar',
  GBP: 'British pound',
  CNY: 'Chinese yuan',
  THB: 'Thai baht',
}

/**
 * Rates for when the API has none or the app runs without it (ECB reference rates, November 2026).
 * The API keeps the same table in internal/modules/currency, and a Go test compares the two.
 */
export const FALLBACK_RATES: Record<DisplayCurrency, number> = {
  USD: 0.000055364,
  SGD: 0.000070773,
  MYR: 0.00022456,
  EUR: 0.000049371,
  JPY: 0.0087573,
  AUD: 0.000080197,
  GBP: 0.000041247,
  CNY: 0.0003693,
  THB: 0.0018525,
}

export const isDisplayCurrency = (code: string): code is DisplayCurrency =>
  (DISPLAY_CURRENCIES as readonly string[]).includes(code)

// en-GB writes US$12.40, €12.40 and JP¥1,240, so a shopper never mistakes one dollar for another.
const formats = new Map<string, Intl.NumberFormat>()
function formatOf(currency: string) {
  let f = formats.get(currency)
  if (!f) {
    f = new Intl.NumberFormat('en-GB', { style: 'currency', currency })
    formats.set(currency, f)
  }
  return f
}

/** The currency's minor units as Intl knows them: 2 for USD, 0 for JPY. */
export const minorUnits = (currency: string) =>
  formatOf(currency).resolvedOptions().maximumFractionDigits ?? 2

/** A rupiah amount in another currency, rounded to that currency's minor units. */
export function convertFromIdr(amountIdr: number, rate: number, currency: string): number {
  const scale = 10 ** minorUnits(currency)
  return Math.round(amountIdr * rate * scale) / scale
}

/** US$12.40, JP¥1,240 */
export const fmtCurrency = (amount: number, currency: string) =>
  formatOf(currency)
    .format(amount)
    .replace(/\u00a0/g, ' ')
