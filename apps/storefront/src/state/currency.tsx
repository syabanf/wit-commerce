import type { ShopRate } from '@rc/api'
import { FALLBACK_RATES, convertFromIdr, fmtCurrency, isDisplayCurrency } from '@rc/fixtures'
import type { Tenant } from '@rc/types'
import { type ReactNode, createContext, useContext, useMemo } from 'react'
import { usePersisted } from '../lib/storage'

export const IDR = 'IDR'

export interface CurrencyValue {
  /** IDR, or the foreign currency the shopper chose for estimates. */
  code: string
  /** The codes the store offers, IDR first. Only IDR when the store offers no other. */
  options: string[]
  setCode: (code: string) => void
  /** "US$12.40" for a rupiah amount, or null while the shopper reads rupiah. */
  convert: (amountIdr: number) => string | null
}

const CurrencyContext = createContext<CurrencyValue | null>(null)
/** Set inside checkout and order pages, which always show rupiah. */
const RupiahOnly = createContext(false)

/**
 * The shopper's display currency for one store, remembered on this device. Rates come with the
 * store's state; without the API, or for a code the API sent no rate for, the built-in table applies.
 */
export function CurrencyProvider({
  tenant,
  rates,
  children,
}: {
  tenant: Tenant
  rates: ShopRate[]
  children: ReactNode
}) {
  const [stored, setStored] = usePersisted<string>('local', `rc.storefront.currency.${tenant.id}`, IDR)
  const value = useMemo<CurrencyValue>(() => {
    const rateOf = new Map<string, number>()
    for (const code of tenant.displayCurrencies ?? []) {
      const rate =
        rates.find((r) => r.code === code)?.rate ??
        (isDisplayCurrency(code) ? FALLBACK_RATES[code] : undefined)
      if (rate && rate > 0) rateOf.set(code, rate)
    }
    const code = rateOf.has(stored) ? stored : IDR
    const rate = rateOf.get(code)
    return {
      code,
      options: [IDR, ...rateOf.keys()],
      setCode: (next) => setStored(next === IDR ? null : next),
      convert: (amountIdr) => (rate ? fmtCurrency(convertFromIdr(amountIdr, rate, code), code) : null),
    }
  }, [tenant.displayCurrencies, rates, stored, setStored])
  return <CurrencyContext value={value}>{children}</CurrencyContext>
}

/** Marks its content as rupiah only: checkout, payment and order pages. */
export function RupiahOnlyArea({ children }: { children: ReactNode }) {
  return <RupiahOnly value>{children}</RupiahOnly>
}

export function useCurrency(): CurrencyValue {
  const ctx = useContext(CurrencyContext)
  const rupiahOnly = useContext(RupiahOnly)
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider')
  return rupiahOnly ? { ...ctx, convert: () => null } : ctx
}
