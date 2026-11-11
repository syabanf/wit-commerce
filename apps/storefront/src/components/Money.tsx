import { fmtIdr } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { Coins } from 'lucide-react'
import { IDR, useCurrency } from '../state/currency'

/**
 * A rupiah amount. With a foreign currency chosen it reads "≈ US$12.40" with the rupiah price smaller
 * beside it; inside checkout and order pages it stays rupiah. `prefix` is text such as "From ", and
 * `sign` a "+" or "−" that sits next to the number.
 */
export function Money({
  idr,
  prefix = '',
  sign = '',
  className,
}: {
  idr: number
  prefix?: string
  sign?: '+' | '−' | ''
  className?: string
}) {
  const converted = useCurrency().convert(idr)
  if (!converted) return <span className={className}>{prefix + sign + fmtIdr(idr)}</span>
  return (
    <span className={cn('gap-x-1.5 inline-flex flex-wrap items-baseline', className)}>
      <span>{`${prefix}≈ ${sign}${converted}`}</span>
      <span className="font-normal text-[0.75em] text-[color:var(--sf-muted)]">{sign + fmtIdr(idr)}</span>
    </span>
  )
}

/** The header's currency picker: rupiah plus the store's display currencies. Hidden when there are none. */
export function CurrencySwitcher({ className }: { className?: string }) {
  const { code, options, setCode } = useCurrency()
  if (options.length < 2) return null
  return (
    <label
      className={cn(
        'h-11 gap-1.5 px-3 text-sm font-semibold relative inline-flex shrink-0 items-center rounded-full hover:bg-[var(--sf-soft)]',
        className,
      )}
    >
      <Coins className="size-4" aria-hidden="true" />
      <span className="sr-only">Show prices in</span>
      <select
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="pr-1 cursor-pointer appearance-none bg-transparent focus:outline-none"
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The one line checkout, payment and order pages show while the shopper browses in another currency. */
export function PayInRupiahNote({ className }: { className?: string }) {
  const { code } = useCurrency()
  if (code === IDR) return null
  return (
    <p className={cn('text-sm text-[color:var(--sf-muted)]', className)}>
      You pay in Indonesian rupiah. {code} prices are estimates.
    </p>
  )
}
