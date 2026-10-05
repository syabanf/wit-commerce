import { fmtDate, fmtIdr, fmtIdrShort } from '@rc/fixtures'
import type { Promotion } from '@rc/types'
import { cn, toast } from '@rc/ui'
import { Check, Copy } from 'lucide-react'
import { type ReactNode, useState } from 'react'

/** The offer as a big value and a small unit: "20%" / "off", "Buy 2" / "get 1 free". */
export function promoHeadline(p: Promotion): { value: string; unit: string } {
  switch (p.kind) {
    case 'percentage':
      return { value: `${p.value}%`, unit: 'off' }
    case 'fixed':
      return { value: fmtIdrShort(p.value), unit: 'off' }
    case 'bxgy':
      return {
        value: `Buy ${p.buyQty ?? 1}`,
        unit:
          (p.getDiscountPct ?? 100) >= 100
            ? `get ${p.getQty ?? 1} free`
            : `get ${p.getQty ?? 1} at ${p.getDiscountPct}% off`,
      }
    case 'free_shipping':
      return { value: 'Free', unit: 'shipping' }
    default:
      return { value: 'Bundle', unit: 'price' }
  }
}

/** One line of terms: minimum spend, cap and end date, whichever apply. */
export function promoTerms(p: Promotion): string {
  return [
    p.minSpend ? `Min. spend ${fmtIdr(p.minSpend)}` : null,
    p.maxDiscount ? `Up to ${fmtIdrShort(p.maxDiscount)}` : null,
    `Ends ${fmtDate(p.endAt)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function PromoValue({ promotion, className }: { promotion: Promotion; className?: string }) {
  const { value, unit } = promoHeadline(promotion)
  return (
    <p className={cn('sf-display leading-none', className)}>
      <span className="font-black tracking-tight block text-[1em] tabular-nums">{value}</span>
      <span className="mt-1 font-bold block text-[0.32em] tracking-[0.18em] uppercase">{unit}</span>
    </p>
  )
}

/** A voucher code on a dashed outline, with a button that copies it. */
export function CouponCode({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast('Code copied', { description: `Paste ${code} at checkout.` })
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast(`Use code ${code} at checkout.`)
    }
  }
  return (
    <span
      className={cn(
        'h-11 gap-1 pr-1 pl-3 inline-flex items-center rounded-full border-2 border-dashed border-current',
        className,
      )}
    >
      <span className="text-sm font-black tracking-[0.14em] tabular-nums">{code}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy code ${code}`}
        className="size-9 inline-flex items-center justify-center rounded-full hover:bg-[var(--sf-text)]/10"
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </button>
    </span>
  )
}

/**
 * A voucher: a stub with the offer value, a dashed tear line with two half-circle notches, and the body.
 * On phones the stub sits on top and the tear line runs across. `notchClassName` paints the notches in
 * the colour behind the ticket.
 */
export function Ticket({
  stub,
  children,
  className,
  stubClassName,
  notchClassName = 'sf-hole',
}: {
  stub: ReactNode
  children: ReactNode
  className?: string
  stubClassName?: string
  notchClassName?: string
}) {
  const notch = cn('size-6 absolute rounded-full', notchClassName)
  return (
    <div
      className={cn(
        'md:grid-cols-[auto_minmax(0,1fr)] relative grid grid-cols-1 overflow-hidden rounded-[var(--sf-card-radius)]',
        className,
      )}
    >
      <div
        className={cn(
          'p-6 md:p-8 md:border-r-2 md:border-b-0 relative flex items-center border-b-2 border-dashed border-current/30',
          stubClassName,
        )}
      >
        {stub}
        <span
          aria-hidden="true"
          className={cn(notch, '-bottom-3 -left-3 md:-top-3 md:-right-3 md:bottom-auto md:left-auto')}
        />
        <span aria-hidden="true" className={cn(notch, '-right-3 -bottom-3')} />
      </div>
      <div className="min-w-0 p-6 md:p-8">{children}</div>
    </div>
  )
}

/** Product page line for a code offer: the saving on the left, the copyable code on the right. */
export function CodeOfferStrip({ code, value }: { code: string; value: number }) {
  return (
    <div
      className="gap-3 py-2 pr-2 pl-4 flex items-center justify-between rounded-[var(--sf-tile-radius)] border border-dashed border-[color:var(--sf-primary)]"
      style={{ background: 'color-mix(in srgb, var(--sf-primary) 6%, var(--sf-bg))' }}
    >
      <p className="text-sm">
        <span className="font-bold text-[color:var(--sf-primary)]">Extra {value}% off</span> at checkout
      </p>
      <CouponCode code={code} className="h-10 shrink-0 text-[color:var(--sf-primary)]" />
    </div>
  )
}
