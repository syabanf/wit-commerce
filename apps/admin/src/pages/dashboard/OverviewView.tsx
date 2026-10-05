import {
  channelMix,
  dailyRevenue,
  fmtAgo,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  isSold,
  periodKpis,
  plural,
  productPerformance,
  toMs,
} from '@rc/fixtures'
import type { Channel, OrderStatus } from '@rc/types'
import { CHANNEL_LABEL, FUNNEL_FLOW, FUNNEL_STEP_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CountBadge,
  Donut,
  EmptyState,
  Kicker,
  ProgressBar,
  Sparkline,
  StatCard,
  cn,
} from '@rc/ui'
import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleAlert,
  MousePointerClick,
  PackageCheck,
  ShoppingBag,
  Truck,
  Wallet,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ORDER_STATUS_TONE, OrderStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import type { Scoped } from '../../state/scoped'
import { type Queue, isLate, toFulfil } from './lib'

const OVERVIEW: OrderStatus[] = ['new', 'paid', 'processing', 'packed', 'shipped', 'delivered']
const CHANNEL_COLOR: Record<Channel, string> = {
  web: 'var(--color-ink)',
  personal_store: 'var(--color-accent)',
  whatsapp: 'var(--color-info)',
  marketplace: 'var(--color-warning)',
  pos: 'var(--color-chart-muted)',
}
const CHANNEL_DOT: Record<Channel, string> = {
  web: 'bg-ink',
  personal_store: 'bg-accent',
  whatsapp: 'bg-info',
  marketplace: 'bg-warning',
  pos: 'bg-chart-muted',
}

export function OverviewView({ s, now, queues }: { s: Scoped; now: number; queues: Queue[] }) {
  const data = useMemo(() => {
    const week = periodKpis(s.orders, s.traffic, 7, now)
    const days = dailyRevenue(s.orders, 14, now)
    const recent = s.orders.filter((o) => now - toMs(o.createdAt) < 30 * 86_400_000)
    const mix = channelMix(recent)
    const perf = productPerformance(s.products, s.orders, 7, now)
    const top = [...perf.values()]
      .filter((p) => p.units > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
    const fulfil = s.orders.filter(toFulfil)
    const late = fulfil.filter((o) => isLate(o, now))
    const shippedToday = s.orders.filter((o) =>
      o.events.some((e) => e.status === 'shipped' && now - toMs(e.at) < 24 * 3_600_000),
    ).length
    const running = s.campaigns.filter((c) => c.status === 'running').sort((a, b) => b.budget - a.budget)[0]
    const campaignOrders = running
      ? s.orders
          .filter((o) => o.campaignId === running.id && isSold(o))
          .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      : []
    return { week, days, mix, top, fulfil, late, shippedToday, running, campaignOrders }
  }, [s, now])

  const recentOrders = useMemo(
    () => [...s.orders].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)).slice(0, 5),
    [s.orders],
  )
  const mixTotal = Object.values(data.mix).reduce((a, b) => a + b, 0)
  const revenueChange = data.week.prev.revenue
    ? (data.week.revenue - data.week.prev.revenue) / data.week.prev.revenue
    : null

  return (
    <div className="space-y-4">
      <AttentionCard queues={queues} />

      <div className="gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] grid grid-cols-1">
        <Card variant="ink" className="p-5 flex flex-col">
          {data.running ? (
            <>
              <div className="gap-3 flex flex-wrap items-start justify-between">
                <div className="min-w-0">
                  <Kicker className="text-on-ink-muted">Running campaign</Kicker>
                  <p className="mt-1 text-2xl font-bold tracking-tight truncate">{data.running.name}</p>
                  <p className="text-sm text-on-ink-muted">
                    {data.running.code} · {s.segmentName(data.running.segmentId)} · ends{' '}
                    {fmtAgo(data.running.endAt, now)}
                  </p>
                </div>
              </div>
              <div className="mt-6 gap-2 flex items-end leading-none">
                <span className="text-5xl font-bold tracking-tight sm:text-6xl tabular-nums">
                  {fmtIdrShort(data.running.revenue)}
                </span>
                <span className="pb-1 text-sm font-semibold text-on-ink-muted">attributed revenue</span>
              </div>
              <div className="mt-4 gap-2 flex flex-wrap">
                {FUNNEL_FLOW.filter(
                  (f) => f === 'sent' || f === 'opened' || f === 'clicked' || f === 'purchased',
                ).map((f) => (
                  <span
                    key={f}
                    className={cn(
                      'h-8 gap-1.5 px-3 text-xs font-semibold inline-flex items-center rounded-full border',
                      f === 'purchased'
                        ? 'text-white border-accent-strong bg-accent-strong'
                        : 'border-white/10 bg-white/10 text-white',
                    )}
                  >
                    {FUNNEL_STEP_LABEL[f]}{' '}
                    <span className="tabular-nums">{fmtNumber(data.running!.funnel[f])}</span>
                  </span>
                ))}
              </div>
              {data.campaignOrders[0] && (
                <Link
                  to={paths.order(data.campaignOrders[0].id)}
                  className="mt-4 gap-3 rounded-2xl bg-white/5 p-3 text-sm hover:bg-white/10 flex items-center transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      Latest order <span className="text-xs font-mono">{data.campaignOrders[0].code}</span>{' '}
                      from {s.customerName(data.campaignOrders[0].customerId)}
                    </span>
                    <span className="text-xs block text-on-ink-muted">
                      {fmtIdr(data.campaignOrders[0].total)} · {fmtAgo(data.campaignOrders[0].createdAt, now)}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              )}
              <div className="gap-2 pt-5 mt-auto flex flex-wrap items-center justify-between">
                <p className="text-sm text-on-ink-muted">
                  {plural(data.campaignOrders.length, 'order')} ·{' '}
                  {fmtPercent(
                    data.running.funnel.clicked
                      ? data.running.funnel.purchased / data.running.funnel.clicked
                      : 0,
                    1,
                  )}{' '}
                  click to purchase
                </p>
                <Button asChild variant="onInk" size="sm">
                  <Link to={paths.campaign(data.running.id)}>Open campaign</Link>
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              className="text-on-ink [&_p]:text-on-ink-muted"
              icon={null}
              title="No campaign running"
              description="Launch a campaign to a segment and its revenue shows here."
              action={
                <Button asChild variant="onInk" size="sm">
                  <Link to="/marketing/campaigns">Open campaigns</Link>
                </Button>
              }
            />
          )}
        </Card>

        <div className="gap-3 sm:gap-4 grid grid-cols-1">
          <Card variant="accent" className="p-5 flex flex-col">
            <p className="font-semibold text-white/80 text-[0.8125rem]">Orders to pack and ship</p>
            <p className="mt-2 text-5xl font-bold tracking-tight leading-none tabular-nums">
              {data.fulfil.length}
            </p>
            <p className="mt-2 text-sm text-white/80">
              {data.late.length ? `${data.late.length} waiting over 48 hours` : 'Everything within 48 hours'}{' '}
              · {data.shippedToday} shipped in the last 24 hours
            </p>
            <ProgressBar
              className="mt-4 bg-white/25"
              tone="white"
              value={
                data.fulfil.length + data.shippedToday
                  ? data.shippedToday / (data.fulfil.length + data.shippedToday)
                  : 1
              }
              aria-label="Shipped against waiting"
            />
            <div className="mt-4">
              <Button asChild variant="onInk" size="sm">
                <Link to="/commerce/orders?view=to-fulfil">Open the queue</Link>
              </Button>
            </div>
          </Card>
          <div className="gap-3 sm:gap-4 grid grid-cols-2">
            <StatCard
              label="Revenue, 7 days"
              value={fmtIdrShort(data.week.revenue)}
              hint={
                revenueChange === null
                  ? 'No earlier week'
                  : `${revenueChange >= 0 ? '+' : ''}${fmtPercent(revenueChange)} on last week`
              }
              icon={<Wallet />}
              tone="ink"
            >
              <Sparkline
                className="mt-4 w-full"
                height={40}
                data={data.days.map((d) => d.revenue)}
                labels={data.days.map((d) => d.label)}
                format={fmtIdrShort}
                ariaLabel="Revenue per day, last 14 days"
              />
            </StatCard>
            <StatCard
              label="Conversion, 7 days"
              value={fmtPercent(data.week.conversion, 1)}
              hint={`${fmtNumber(data.week.visitors)} visitors · AOV ${fmtIdrShort(data.week.aov)}`}
              icon={<MousePointerClick />}
              tone="info"
            />
          </div>
        </div>
      </div>

      <div className="gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6 grid grid-cols-2">
        {OVERVIEW.map((st) => (
          <Link
            key={st}
            to="/commerce/orders"
            className="block rounded-card focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <StatCard
              label={ORDER_STATUS_LABEL[st]}
              value={s.orders.filter((o) => o.status === st).length}
              hint={
                st === 'new'
                  ? 'Not yet confirmed'
                  : st === 'delivered'
                    ? 'Inside the return window'
                    : 'Orders right now'
              }
              icon={st === 'shipped' ? <Truck /> : st === 'packed' ? <PackageCheck /> : <ShoppingBag />}
              tone={ORDER_STATUS_TONE[st] === 'ink' ? 'default' : ORDER_STATUS_TONE[st]}
              className="h-full transition-colors hover:bg-surface-2"
            />
          </Link>
        ))}
      </div>

      <div className="gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20rem] grid grid-cols-1">
        <Card>
          <CardHeader
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/commerce/orders">View all</Link>
              </Button>
            }
          >
            <CardTitle>Latest orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentOrders.map((o) => (
              <Link
                key={o.id}
                to={paths.order(o.id)}
                className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2 transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">{s.customerName(o.customerId)}</span>
                  <span className="text-xs block truncate text-muted">
                    <span className="font-mono">{o.code}</span> · {CHANNEL_LABEL[o.channel]} ·{' '}
                    {fmtAgo(o.createdAt, now)}
                  </span>
                  <span className="mt-1.5 gap-2 sm:hidden flex flex-wrap items-center">
                    <OrderStatusBadge status={o.status} />
                  </span>
                </span>
                <span className="gap-1 sm:flex hidden shrink-0 flex-col items-end">
                  <OrderStatusBadge status={o.status} />
                  <span className="text-xs text-muted tabular-nums">{fmtIdr(o.total)}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/analytics?tab=product">Analytics</Link>
              </Button>
            }
          >
            <CardTitle>Best sellers this week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.top.length === 0 ? (
              <EmptyState
                compact
                title="No sales this week"
                description="Products appear here once paid orders come in."
              />
            ) : (
              data.top.map((p, i) => (
                <Link
                  key={p.productId}
                  to={paths.product(p.productId)}
                  className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2 transition-colors hover:bg-surface"
                >
                  <span className="size-9 rounded-xl text-xs font-bold flex shrink-0 items-center justify-center bg-card tabular-nums shadow-card">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-semibold block truncate">{s.productName(p.productId)}</span>
                    <span className="text-xs block truncate text-muted">
                      {plural(p.units, 'unit')} · {fmtPercent(p.conversion, 1)} of viewers bought
                    </span>
                  </span>
                  <span className="text-sm font-semibold shrink-0 tabular-nums">
                    {fmtIdrShort(p.revenue)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Revenue by channel</CardTitle>
            <p className="text-xs text-muted">Sold orders, last 30 days.</p>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <Donut
                ariaLabel="Revenue by channel, last 30 days"
                segments={(Object.keys(data.mix) as Channel[]).map((c) => ({
                  key: c,
                  label: CHANNEL_LABEL[c],
                  value: data.mix[c],
                  color: CHANNEL_COLOR[c],
                }))}
                centerValue={fmtIdrShort(mixTotal)}
                centerLabel="30 days"
              />
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              {(Object.keys(data.mix) as Channel[]).map((c) => (
                <div key={c} className="gap-2 flex items-center justify-between">
                  <dt className="min-w-0 gap-2 flex items-center text-muted">
                    <span className={cn('size-2.5 rounded-sm shrink-0', CHANNEL_DOT[c])} />
                    <span className="truncate">{CHANNEL_LABEL[c]}</span>
                  </dt>
                  <dd className="gap-3 flex items-center">
                    <span className="font-semibold tabular-nums">{fmtIdrShort(data.mix[c])}</span>
                    <span className="w-11 text-xs text-right text-muted tabular-nums">
                      {mixTotal ? fmtPercent(data.mix[c] / mixTotal) : '0%'}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              to="/analytics"
              className="mt-4 gap-1 text-xs font-semibold flex items-center hover:text-accent"
            >
              <ChartNoAxesCombined className="size-3.5" />
              Open analytics
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AttentionCard({ queues }: { queues: Queue[] }) {
  return (
    <Card className="p-4" aria-labelledby="attention-title">
      <div className="gap-3 flex flex-wrap items-center justify-between">
        <div>
          <h2 id="attention-title" className="gap-2 font-semibold flex items-center">
            Attention required <CountBadge count={queues.filter((q) => q.urgent).length} />
          </h2>
          <p className="text-xs text-muted">Open the queue that needs action first.</p>
        </div>
        <div className="gap-2 sm:grid-cols-3 xl:w-auto xl:grid-cols-4 grid w-full grid-cols-2">
          {queues.length === 0 ? (
            <p className="py-3 text-sm col-span-2 text-muted">No open issues.</p>
          ) : (
            queues.slice(0, 8).map((q) => (
              <Link
                key={q.key}
                to={q.to}
                className={cn(
                  'min-w-0 gap-3 rounded-2xl px-3 py-2.5 [&_svg]:size-4 flex items-center transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                  q.urgent
                    ? 'bg-accent-soft text-accent-strong hover:bg-accent-soft/70'
                    : 'bg-surface text-foreground hover:bg-surface-2',
                )}
              >
                {q.urgent ? (
                  <CircleAlert className="shrink-0" />
                ) : (
                  <ArrowRight className="shrink-0 text-muted" />
                )}
                <span className="min-w-0">
                  <span className="text-lg font-bold block leading-none tabular-nums">{q.count}</span>
                  <span className="font-semibold block truncate text-[0.6875rem]">{q.label}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </Card>
  )
}
