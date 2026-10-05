import { fmtAgo, metricsFor, plural } from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { Avatar } from '@rc/ui'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../lib/paths'
import { useSellerScope } from '../state/scope'
import { TierBadge } from './badges'

/** A customer in a list: avatar, name, tier, order count and last purchase. */
export function CustomerCard({ customer, now }: { customer: Customer; now: number }) {
  const { metrics } = useSellerScope()
  const m = metricsFor(metrics, customer.id)
  return (
    <Link
      to={paths.customer(customer.id)}
      className="gap-3 p-4 flex items-center rounded-[24px] bg-card shadow-card transition-transform focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]"
    >
      <Avatar name={customer.name} color={customer.color} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="gap-2 flex items-center">
          <p className="font-semibold truncate text-[15px]">{customer.name}</p>
          <TierBadge tier={customer.tier} />
        </div>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          {plural(m.orders, 'order')} ·{' '}
          {m.lastAt === null ? 'No purchase yet' : `last bought ${fmtAgo(m.lastAt, now)}`}
        </p>
      </div>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
    </Link>
  )
}
