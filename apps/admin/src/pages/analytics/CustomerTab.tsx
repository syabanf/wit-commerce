import {
  cohorts,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  monthlyRevenue,
  periodKpis,
  plural,
  repeatRate,
} from '@rc/fixtures'
import { ColumnChart, StatCard, cn } from '@rc/ui'
import { Gem, Repeat, UserPlus, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useScoped } from '../../state/scoped'
import { ChartCard } from './ChartCard'
import { HEAT_LEGEND, heatClass, lifetimeValue } from './lib'

const HORIZON = 5

export function CustomerTab({ days, today }: { days: number; today: number }) {
  const s = useScoped()

  const d = useMemo(
    () => ({
      kpis: periodKpis(s.orders, s.traffic, days, today),
      repeat: repeatRate(s.orders),
      ltv: lifetimeValue(s.crm.metrics),
      cohorts: cohorts(s.orders, 6, HORIZON, today),
      monthly: monthlyRevenue(s.orders, 12, today),
    }),
    [s.orders, s.traffic, s.crm.metrics, days, today],
  )
  const buyers = d.kpis.newCustomers + d.kpis.returningCustomers
  const hasMonthly = d.monthly.some((m) => m.revenue > 0)

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 md:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="New customers"
          value={fmtNumber(d.kpis.newCustomers)}
          hint={
            buyers
              ? `${fmtPercent(d.kpis.newCustomers / buyers)} of buyers, first order in the window`
              : 'First order in the window'
          }
          icon={<UserPlus />}
          tone="info"
        />
        <StatCard
          label="Returning customers"
          value={fmtNumber(d.kpis.returningCustomers)}
          hint={`Bought before and again in the last ${days} days`}
          icon={<Users />}
        />
        <StatCard
          label="Repeat purchase rate"
          value={fmtPercent(d.repeat)}
          hint="Buyers with two or more orders, all time"
          icon={<Repeat />}
        />
        <StatCard
          label="Average lifetime value"
          value={fmtIdrShort(d.ltv.value)}
          hint={`Net spend per buyer, ${plural(d.ltv.buyers, 'buyer')}`}
          icon={<Gem />}
          tone="ink"
        />
      </div>

      <div className="gap-4 xl:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title="Repeat purchase by first-purchase month"
          method="Share of each month's new buyers who ordered again 1 to 5 months later. Blank cells are months still ahead."
          footnote={<HeatLegend />}
        >
          <CohortTable rows={d.cohorts} />
        </ChartCard>
        <ChartCard
          title="Revenue per month"
          method="Paid orders net of refunds over the last 12 months. The current month runs to today and is highlighted."
          table={{ columns: ['Month', 'Revenue'], rows: d.monthly.map((m) => [m.label, fmtIdr(m.revenue)]) }}
        >
          <ColumnChart
            ariaLabel="Revenue per month, last 12 months"
            data={
              hasMonthly
                ? d.monthly.map((m, i) => ({
                    label: m.label,
                    value: m.revenue,
                    highlight: i === d.monthly.length - 1,
                  }))
                : []
            }
            format={fmtIdrShort}
            tone="muted"
            height={240}
          />
        </ChartCard>
      </div>
    </div>
  )
}

function CohortTable({ rows }: { rows: ReturnType<typeof cohorts> }) {
  if (!rows.some((r) => r.size > 0))
    return <p className="h-40 text-sm flex items-center justify-center text-muted">No data</p>
  return (
    <div className="relative overflow-x-auto">
      <table className="border-spacing-1 text-sm w-full min-w-[26rem] border-separate">
        <caption className="sr-only">Repeat purchase rate per first-purchase month</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="pr-2 text-xs font-semibold tracking-wide text-left text-muted uppercase"
            >
              Cohort
            </th>
            {Array.from({ length: HORIZON }, (_, k) => (
              <th
                key={k}
                scope="col"
                className="text-xs font-semibold tracking-wide text-center text-muted uppercase"
              >
                M{k + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="pr-2 font-medium text-left whitespace-nowrap">
                {r.label}
                <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
                  {fmtNumber(r.size)}
                </span>
              </th>
              {r.retention.map((v, k) => (
                <td
                  key={k}
                  className={cn(
                    'h-9 rounded-lg text-xs font-semibold text-center tabular-nums',
                    v === null ? 'bg-transparent' : r.size ? heatClass(v) : 'bg-surface-2 text-muted',
                  )}
                >
                  {v === null ? <span className="sr-only">Not yet</span> : r.size ? fmtPercent(v) : 'None'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatLegend() {
  return (
    <span className="gap-1.5 flex flex-wrap items-center" aria-hidden="true">
      <span className="mr-1">Lower</span>
      {HEAT_LEGEND.map((h) => (
        <span key={h.min} className={cn('h-3 w-6 rounded', h.className)} />
      ))}
      <span className="ml-1">Higher repeat rate</span>
    </span>
  )
}
