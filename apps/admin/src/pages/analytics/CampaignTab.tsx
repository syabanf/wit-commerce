import { DAY, fmtIdrShort, fmtNumber, fmtPercent } from '@rc/fixtures'
import type { Campaign } from '@rc/types'
import {
  BarList,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  StatCard,
} from '@rc/ui'
import { Megaphone, ShoppingBag, TicketPercent, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { CampaignStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { ChartCard } from './ChartCard'
import { campaignsInWindow, fmtSignedPercent, roi, windowStart } from './lib'

export function CampaignTab({ days, today }: { days: number; today: number }) {
  const s = useScoped()
  const navigate = useNavigate()

  const campaigns = useMemo(
    () =>
      campaignsInWindow(s.campaigns, windowStart(days, today), today + DAY).sort(
        (a, b) => b.revenue - a.revenue,
      ),
    [s.campaigns, days, today],
  )
  const promotions = useMemo(
    () => s.promotions.filter((p) => p.used > 0).sort((a, b) => b.used - a.used),
    [s.promotions],
  )

  const revenue = campaigns.reduce((n, c) => n + c.revenue, 0)
  const budget = campaigns.reduce((n, c) => n + c.budget, 0)
  const purchases = campaigns.reduce((n, c) => n + c.funnel.purchased, 0)
  const sent = campaigns.reduce((n, c) => n + c.funnel.sent, 0)
  const totalRoi = roi({ revenue, budget })
  const redemptions = promotions.reduce((n, p) => n + p.used, 0)

  const columns: Column<Campaign>[] = [
    {
      id: 'name',
      header: 'Campaign',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{c.name}</p>
          <p className="font-mono text-[0.6875rem] text-muted">{c.code}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'lg',
      sortValue: (c) => c.status,
      cell: (c) => <CampaignStatusBadge status={c.status} />,
    },
    {
      id: 'sent',
      header: 'Sent',
      align: 'right',
      hideBelow: 'md',
      sortValue: (c) => c.funnel.sent,
      cell: (c) => <Num value={c.funnel.sent} />,
    },
    {
      id: 'clicked',
      header: 'Clicked',
      align: 'right',
      hideBelow: 'md',
      sortValue: (c) => c.funnel.clicked,
      cell: (c) => <Num value={c.funnel.clicked} />,
    },
    {
      id: 'purchased',
      header: 'Purchased',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (c) => c.funnel.purchased,
      cell: (c) => <Num value={c.funnel.purchased} />,
    },
    {
      id: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortValue: (c) => c.revenue,
      cell: (c) => (
        <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdrShort(c.revenue)}</span>
      ),
    },
    {
      id: 'roi',
      header: 'ROI',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (c) => roi(c),
      cell: (c) => {
        const r = roi(c)
        return r === null ? (
          <span className="text-muted">No budget</span>
        ) : (
          <span className="whitespace-nowrap tabular-nums">{fmtSignedPercent(r)}</span>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 md:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Campaign revenue"
          value={fmtIdrShort(revenue)}
          hint={`${campaigns.length} campaigns ran in the window`}
          icon={<Megaphone />}
          tone="ink"
        />
        <StatCard
          label="Purchases"
          value={fmtNumber(purchases)}
          hint={
            sent
              ? `${fmtPercent(purchases / sent, 1)} of ${fmtNumber(sent)} messages sent`
              : 'No messages sent'
          }
          icon={<ShoppingBag />}
        />
        <StatCard
          label="Return on budget"
          value={totalRoi === null ? 'None' : fmtSignedPercent(totalRoi)}
          hint={`Revenue against ${fmtIdrShort(budget)} budget`}
          icon={<TrendingUp />}
          tone={totalRoi === null ? 'default' : totalRoi >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          label="Voucher redemptions"
          value={fmtNumber(redemptions)}
          hint="All promotions, since each started"
          icon={<TicketPercent />}
          tone="info"
        />
      </div>

      <div className="gap-4 xl:grid-cols-2 grid grid-cols-1">
        <ChartCard
          title="Revenue per campaign"
          method="Orders attributed to each campaign over its whole run, for campaigns active at any point in the window."
        >
          {campaigns.some((c) => c.revenue > 0) ? (
            <BarList
              ariaLabel="Revenue per campaign"
              items={campaigns
                .filter((c) => c.revenue > 0)
                .slice(0, 8)
                .map((c) => ({
                  key: c.id,
                  label: (
                    <Link to={paths.campaign(c.id)} className="hover:text-accent">
                      {c.name}
                    </Link>
                  ),
                  value: c.revenue,
                  display: fmtIdrShort(c.revenue),
                }))}
            />
          ) : (
            <EmptyState
              compact
              title="No campaign revenue"
              description="Widen the window or launch a campaign to see attributed revenue."
            />
          )}
        </ChartCard>
        <ChartCard
          title="Voucher usage per promotion"
          method="Times each voucher was redeemed since the promotion started, against its usage limit."
        >
          {promotions.length ? (
            <BarList
              tone="info"
              ariaLabel="Voucher usage per promotion"
              items={promotions.slice(0, 8).map((p) => ({
                key: p.id,
                label: (
                  <Link to={paths.promotion(p.id)} className="hover:text-accent">
                    {p.name}
                  </Link>
                ),
                hint: <span className="font-mono">{p.code}</span>,
                value: p.used,
                display: p.usageLimit
                  ? `${fmtNumber(p.used)} of ${fmtNumber(p.usageLimit)}`
                  : fmtNumber(p.used),
              }))}
            />
          ) : (
            <EmptyState
              compact
              title="No vouchers redeemed yet"
              description="Promotions appear here after their first redemption."
            />
          )}
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
          <CardDescription className="text-xs">
            Funnel counts and attributed revenue per campaign. ROI is revenue minus budget, over budget.
          </CardDescription>
        </CardHeader>
        <DataTable
          columns={columns}
          rows={campaigns}
          getRowKey={(c) => c.id}
          onRowClick={(c) => navigate(paths.campaign(c.id))}
          initialSort={{ id: 'revenue', desc: true }}
          pageSize={10}
          empty={
            <EmptyState
              compact
              title="No campaigns in this window"
              description="Pick a longer window to include earlier campaigns."
            />
          }
        />
      </Card>
    </div>
  )
}

const Num = ({ value }: { value: number }) => <span className="tabular-nums">{fmtNumber(value)}</span>
