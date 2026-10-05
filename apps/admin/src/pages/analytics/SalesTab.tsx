import { fmtIdrShort, fmtNumber, fmtPercent, periodKpis, plural, sellerPerformance } from '@rc/fixtures'
import { Avatar, BarList, Button, EmptyState, StatCard } from '@rc/ui'
import { ArrowRight, BadgePercent, Store, UserRoundSearch, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { ChartCard } from './ChartCard'

export function SalesTab({ days, today }: { days: number; today: number }) {
  const s = useScoped()

  const d = useMemo(() => {
    const rows = [...sellerPerformance(s.sellers, s.orders, s.traffic, s.leads, days, today).values()].sort(
      (a, b) => b.revenue - a.revenue,
    )
    const sum = (key: 'revenue' | 'orders' | 'leads' | 'commission') => rows.reduce((n, r) => n + r[key], 0)
    return {
      rows,
      revenue: sum('revenue'),
      orders: sum('orders'),
      leads: sum('leads'),
      commission: sum('commission'),
      storeRevenue: periodKpis(s.orders, s.traffic, days, today).revenue,
    }
  }, [s.sellers, s.orders, s.traffic, s.leads, days, today])

  const selling = d.rows.filter((r) => r.revenue > 0)

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 md:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Seller revenue"
          value={fmtIdrShort(d.revenue)}
          hint={
            d.storeRevenue
              ? `${fmtPercent(d.revenue / d.storeRevenue)} of all revenue`
              : 'No revenue in the window'
          }
          icon={<Wallet />}
          tone="ink"
        />
        <StatCard
          label="Seller orders"
          value={fmtNumber(d.orders)}
          hint="Through personal stores and ref links"
          icon={<Store />}
        />
        <StatCard
          label="Leads"
          value={fmtNumber(d.leads)}
          hint={`Raised by sellers, last ${days} days`}
          icon={<UserRoundSearch />}
          tone="info"
        />
        <StatCard
          label="Commission"
          value={fmtIdrShort(d.commission)}
          hint="Revenue times each seller's rate"
          icon={<BadgePercent />}
        />
      </div>

      <ChartCard
        title="Revenue per seller"
        method={`Paid orders attributed to a seller's personal store or ref link, last ${days} days. Conversion is orders over store visitors.`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/sales/performance">
              Sales performance
              <ArrowRight />
            </Link>
          </Button>
        }
      >
        {selling.length ? (
          <BarList
            ariaLabel={`Revenue per seller, last ${days} days`}
            items={selling.slice(0, 10).map((r) => {
              const seller = s.maps.seller.get(r.sellerId)
              return {
                key: r.sellerId,
                label: (
                  <Link
                    to={paths.seller(r.sellerId)}
                    className="gap-2 inline-flex max-w-full items-center align-middle hover:text-accent"
                  >
                    <Avatar name={seller?.name ?? 'Seller'} color={seller?.color} size="xs" />
                    <span className="truncate">{s.sellerName(r.sellerId)}</span>
                  </Link>
                ),
                hint: `${plural(r.orders, 'order')} · ${fmtPercent(r.conversion, 1)}`,
                value: r.revenue,
                display: fmtIdrShort(r.revenue),
              }
            })}
          />
        ) : (
          <EmptyState
            compact
            title="No seller sales in this window"
            description="Widen the window, or share personal store links with sellers."
          />
        )}
      </ChartCard>
    </div>
  )
}
