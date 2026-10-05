import {
  cartAbandonment,
  channelMix,
  dailyRevenue,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  periodKpis,
} from '@rc/fixtures'
import { CHANNEL_LABEL, type Channel } from '@rc/types'
import { BarList, ColumnChart, Donut, EmptyState, LineChart, StatCard } from '@rc/ui'
import { Eye, Receipt, ShoppingBag, ShoppingCart, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useScoped } from '../../state/scoped'
import { ChartCard } from './ChartCard'
import { changeHint, revenueByCategory, soldInWindow, visitorsPerDay, windowStart } from './lib'

const CHANNEL_ORDER: Channel[] = ['web', 'personal_store', 'marketplace', 'whatsapp', 'pos']
const CHANNEL_COLOR: Record<Channel, string> = {
  web: 'var(--color-ink)',
  personal_store: 'var(--color-info)',
  marketplace: 'var(--color-accent)',
  whatsapp: 'var(--color-warning)',
  pos: 'var(--color-success)',
}

export function CommerceTab({ days, today }: { days: number; today: number }) {
  const s = useScoped()

  const d = useMemo(() => {
    const sold = soldInWindow(s.orders, windowStart(days, today))
    const mix = channelMix(sold)
    return {
      kpis: periodKpis(s.orders, s.traffic, days, today),
      revenue: dailyRevenue(s.orders, days, today),
      visitors: visitorsPerDay(s.traffic, days, today),
      abandonment: cartAbandonment(s.traffic, days, today),
      mix: CHANNEL_ORDER.map((c) => ({
        key: c,
        label: CHANNEL_LABEL[c],
        value: mix[c],
        color: CHANNEL_COLOR[c],
      })),
      categories: revenueByCategory(sold, (id) => s.maps.product.get(id)?.categoryId),
    }
  }, [s.orders, s.traffic, s.maps.product, days, today])

  const { kpis } = d
  const prevAov = kpis.prev.orders ? kpis.prev.revenue / kpis.prev.orders : 0
  const revenueChange = changeHint(kpis.revenue, kpis.prev.revenue, days)
  const ordersChange = changeHint(kpis.orders, kpis.prev.orders, days)
  const aovChange = changeHint(kpis.aov, prevAov, days)
  const conversionChange = changeHint(kpis.conversion, kpis.prev.conversion, days)
  const mixTotal = d.mix.reduce((n, m) => n + m.value, 0)
  const hasRevenue = d.revenue.some((p) => p.revenue > 0)
  const hasVisitors = d.visitors.some((p) => p.value !== null)

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 md:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Revenue"
          value={fmtIdrShort(kpis.revenue)}
          hint={revenueChange.hint}
          icon={<Wallet />}
          tone={revenueChange.tone}
        />
        <StatCard
          label="Orders"
          value={fmtNumber(kpis.orders)}
          hint={ordersChange.hint}
          icon={<Receipt />}
          tone={ordersChange.tone}
        />
        <StatCard
          label="Average order value"
          value={fmtIdrShort(kpis.aov)}
          hint={aovChange.hint}
          icon={<ShoppingBag />}
          tone={aovChange.tone}
        />
        <StatCard
          label="Conversion"
          value={fmtPercent(kpis.conversion, 1)}
          hint={conversionChange.hint}
          icon={<Eye />}
          tone={conversionChange.tone}
        />
      </div>

      <div className="gap-4 xl:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title="Revenue per day"
          method="Paid orders net of refunds, by order date in WIB. Today is highlighted."
          table={{ columns: ['Day', 'Revenue'], rows: d.revenue.map((p) => [p.label, fmtIdr(p.revenue)]) }}
        >
          <ColumnChart
            ariaLabel={`Revenue per day, last ${days} days`}
            data={
              hasRevenue
                ? d.revenue.map((p, i) => ({
                    label: p.label,
                    value: p.revenue,
                    highlight: i === d.revenue.length - 1,
                  }))
                : []
            }
            format={fmtIdrShort}
            height={220}
          />
        </ChartCard>
        <ChartCard
          title="Visitors per day"
          method="Unique visitors to the main store, personal stores left out. Gaps are days without a traffic record."
          table={{
            columns: ['Day', 'Visitors'],
            rows: d.visitors.map((p) => [p.label, p.value === null ? 'No data' : fmtNumber(p.value)]),
          }}
        >
          <LineChart
            ariaLabel={`Store visitors per day, last ${days} days`}
            data={hasVisitors ? d.visitors : []}
            format={(v) => fmtNumber(v)}
            area
            height={220}
          />
        </ChartCard>
      </div>

      <div className="gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] grid grid-cols-1">
        <ChartCard
          title="Revenue per category"
          method={`Order line revenue before discounts, last ${days} days.`}
        >
          {d.categories.length ? (
            <BarList
              ariaLabel={`Revenue per category, last ${days} days`}
              items={d.categories.slice(0, 8).map(([id, value]) => ({
                key: id,
                label: s.categoryName(id),
                value,
                display: fmtIdrShort(value),
              }))}
            />
          ) : (
            <EmptyState
              compact
              title="No category sales"
              description="Widen the window to see which categories sell."
            />
          )}
        </ChartCard>
        <div className="gap-4 grid grid-cols-1 content-start">
          <ChartCard
            title="Revenue per channel"
            method={`Share of paid revenue by sales channel, last ${days} days.`}
          >
            {mixTotal ? (
              <div className="gap-6 flex flex-wrap items-center">
                <Donut
                  ariaLabel={`Revenue per channel, last ${days} days`}
                  segments={d.mix}
                  centerValue={fmtIdrShort(mixTotal)}
                  centerLabel="revenue"
                />
                <dl className="min-w-48 space-y-2.5 text-sm flex-1">
                  {d.mix.map((m) => (
                    <div key={m.key} className="gap-2 flex items-center justify-between">
                      <dt className="min-w-0 gap-2 flex items-center text-muted">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-sm shrink-0"
                          style={{ background: m.color }}
                        />
                        <span className="truncate">{m.label}</span>
                      </dt>
                      <dd className="gap-2 flex items-baseline">
                        <span className="font-semibold tabular-nums">{fmtIdrShort(m.value)}</span>
                        <span className="w-10 text-xs text-right text-muted tabular-nums">
                          {fmtPercent(m.value / mixTotal)}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <EmptyState
                compact
                title="No sales in this window"
                description="Widen the window to see the channel mix."
              />
            )}
          </ChartCard>
          <StatCard
            label="Cart abandonment"
            value={fmtPercent(d.abandonment)}
            hint={`Carts that did not reach checkout, last ${days} days`}
            icon={<ShoppingCart />}
            tone={d.abandonment > 0.7 ? 'warning' : 'default'}
          />
        </div>
      </div>
    </div>
  )
}
