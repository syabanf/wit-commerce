import { fmtIdr } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { Truck } from 'lucide-react'
import { useShop } from '../state/shop'

/** "You are Rp 250.000 away from free shipping", with a progress bar. */
export function FreeShippingProgress({ className }: { className?: string }) {
  const { totals, tenant } = useShop()
  const min = tenant.loyalty.freeShippingMin
  const done = totals.freeShipping
  const pct = done ? 100 : Math.min(100, Math.round((totals.subtotal / min) * 100))
  return (
    <div className={cn('gap-3 flex items-start', className)}>
      <Truck className="mt-0.5 size-5 shrink-0 text-[color:var(--sf-primary)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {done
            ? 'Your order ships free.'
            : `You are ${fmtIdr(totals.freeShippingGap)} away from free shipping.`}
        </p>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--sf-soft)]"
          role="progressbar"
          aria-label="Progress to free shipping"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-[var(--sf-primary)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
