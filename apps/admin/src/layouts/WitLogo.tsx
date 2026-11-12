import { cn } from '@rc/ui'

const BASE = import.meta.env.BASE_URL

/** The WIT wordmark: ink on light surfaces, white on ink ones. */
export function WitLogo({ onDark, className }: { onDark?: boolean; className?: string }) {
  return (
    <img
      src={`${BASE}${onDark ? 'wit-logo.png' : 'wit-logo-ink.png'}`}
      alt="WIT"
      width={528}
      height={166}
      className={cn('h-5 w-auto', className)}
    />
  )
}

/** The product lockup, "WIT Commerce", with the wordmark standing for WIT. */
export function WitCommerce({ onDark, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <WitLogo onDark={onDark} />
      <span className="font-bold tracking-tight">Commerce</span>
    </span>
  )
}
