import {
  fmtAgo,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  isSold,
  periodKpis,
  repeatRate,
  sellerPerformance,
  toMs,
} from '@rc/fixtures'
import type { LifecycleStage } from '@rc/types'
import { CUSTOMER_EVENT_LABEL, LIFECYCLE_STAGE_LABEL } from '@rc/types'
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  SegmentBar,
  StatCard,
  cn,
} from '@rc/ui'
import { Megaphone, Repeat, Store, UserPlus } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import type { Scoped } from '../../state/scoped'

const STAGES: { stage: LifecycleStage; className: string }[] = [
  { stage: 'registered', className: 'bg-chart-muted' },
  { stage: 'first_buyer', className: 'bg-info' },
  { stage: 'repeat_buyer', className: 'bg-ink' },
  { stage: 'loyal', className: 'bg-success' },
  { stage: 'vip', className: 'bg-accent' },
  { stage: 'at_risk', className: 'bg-warning' },
]

export function GrowthView({ s, now }: { s: Scoped; now: number }) {
  const data = useMemo(() => {
    const month = periodKpis(s.orders, s.traffic, 30, now)
    const recent = s.orders.filter((o) => isSold(o) && now - toMs(o.createdAt) < 30 * 86_400_000)
    const campaignRevenue = recent.filter((o) => o.campaignId).reduce((sum, o) => sum + o.total, 0)
    const sellerRevenue = recent.filter((o) => o.sellerId).reduce((sum, o) => sum + o.total, 0)
    const perf = sellerPerformance(s.sellers, s.orders, s.traffic, s.leads, 30, now)
    const sellers = [...perf.values()]
      .filter((p) => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
    const stages = STAGES.map((st) => ({
      ...st,
      count: s.customers.filter((c) => c.stage === st.stage).length,
    }))
    const activity = s.customerEvents.filter((e) => e.kind !== 'registered').slice(0, 8)
    return {
      month,
      campaignRevenue,
      sellerRevenue,
      revenue30: recent.reduce((sum, o) => sum + o.total, 0),
      sellers,
      stages,
      activity,
      repeat: repeatRate(s.orders),
    }
  }, [s, now])

  const topRevenue = data.sellers[0]?.revenue ?? 0

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="New customers, 30 days"
          value={fmtNumber(data.month.newCustomers)}
          hint={`${fmtNumber(data.month.returningCustomers)} returning buyers`}
          icon={<UserPlus />}
          tone="ink"
        />
        <StatCard
          label="Repeat purchase rate"
          value={fmtPercent(data.repeat)}
          hint="Buyers with two or more orders"
          icon={<Repeat />}
          tone={data.repeat >= 0.3 ? 'success' : 'warning'}
        />
        <StatCard
          label="Campaign revenue, 30 days"
          value={fmtIdrShort(data.campaignRevenue)}
          hint={`${fmtPercent(data.revenue30 ? data.campaignRevenue / data.revenue30 : 0)} of all revenue`}
          icon={<Megaphone />}
          tone="info"
        />
        <StatCard
          label="Personal stores, 30 days"
          value={fmtIdrShort(data.sellerRevenue)}
          hint={`${fmtPercent(data.revenue30 ? data.sellerRevenue / data.revenue30 : 0)} of all revenue`}
          icon={<Store />}
          tone="default"
        />
      </div>

      <Card className="p-5">
        <div className="gap-2 flex flex-wrap items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Customers by lifecycle stage</h2>
            <p className="text-xs text-muted">
              Stages move on their own as customers buy, repeat or go quiet.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/customers/segments">Segments</Link>
          </Button>
        </div>
        <SegmentBar
          className="mt-4"
          segments={data.stages.map((st) => ({
            key: st.stage,
            value: st.count,
            className: st.className,
            label: LIFECYCLE_STAGE_LABEL[st.stage],
          }))}
        />
        <div className="mt-3 gap-4 text-xs flex flex-wrap text-muted">
          {data.stages.map((st) => (
            <span key={st.stage} className="gap-1.5 inline-flex items-center">
              <span className={cn('size-2 rounded-full', st.className)} />
              {LIFECYCLE_STAGE_LABEL[st.stage]}
              <span className="font-semibold text-foreground tabular-nums">{st.count}</span>
            </span>
          ))}
        </div>
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/sales/performance">Performance</Link>
              </Button>
            }
          >
            <CardTitle>Top sellers, 30 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.sellers.length === 0 ? (
              <EmptyState
                compact
                title="No seller sales yet"
                description="Orders from personal stores and ?ref= links count here."
              />
            ) : (
              data.sellers.map((p, i) => {
                const seller = s.maps.seller.get(p.sellerId)!
                return (
                  <Link
                    key={p.sellerId}
                    to={paths.seller(p.sellerId)}
                    className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2 transition-colors hover:bg-surface"
                  >
                    <span className="size-9 rounded-xl text-xs font-bold flex shrink-0 items-center justify-center bg-card tabular-nums shadow-card">
                      {i + 1}
                    </span>
                    <Avatar name={seller.name} color={seller.color} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="gap-2 flex items-baseline justify-between">
                        <span className="text-sm font-semibold truncate">{seller.name}</span>
                        <span className="text-sm font-semibold shrink-0 tabular-nums">
                          {fmtIdrShort(p.revenue)}
                        </span>
                      </span>
                      <span className="mt-1.5 gap-2 flex items-center">
                        <ProgressBar
                          className="flex-1"
                          value={topRevenue ? p.revenue / topRevenue : 0}
                          tone={i === 0 ? 'accent' : 'ink'}
                          aria-label={`${seller.name} revenue`}
                        />
                        <span className="shrink-0 text-[0.6875rem] text-muted tabular-nums">
                          {p.orders} orders · {fmtPercent(p.conversion, 1)}
                        </span>
                      </span>
                    </span>
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.activity.map((e) => (
              <Link
                key={e.id}
                to={paths.customer(e.customerId)}
                className="gap-3 rounded-2xl px-3 py-2 flex items-start hover:bg-surface-2"
              >
                <span className="w-16 pt-0.5 text-xs shrink-0 text-muted tabular-nums">
                  {fmtAgo(e.at, now)}
                </span>
                <span className="min-w-0">
                  <span className="text-sm block truncate">
                    <span className="font-semibold">{s.customerName(e.customerId)}</span> ·{' '}
                    {CUSTOMER_EVENT_LABEL[e.kind].toLowerCase()}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-muted">{e.label}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
