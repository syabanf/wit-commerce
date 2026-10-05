import {
  type SellerStats,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  periodKpis,
  sellerPerformance,
} from '@rc/fixtures'
import { SELLER_KIND_LABEL, type Seller, type SellerKind } from '@rc/types'
import {
  Avatar,
  Banner,
  BarList,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  Donut,
  EmptyState,
  PageHeader,
  PillTabs,
  StatCard,
} from '@rc/ui'
import { HandCoins, PieChart, ShoppingBag, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { storeHost } from '../sellers/lib'

const WINDOWS = ['7', '30', '90'] as const
type Window = (typeof WINDOWS)[number]
const KINDS = Object.keys(SELLER_KIND_LABEL) as SellerKind[]
/** Categorical order from the chart rules: ink, info, accent, warning. */
const KIND_COLOR: Record<SellerKind, string> = {
  sales: 'var(--color-ink)',
  agent: 'var(--color-info)',
  reseller: 'var(--color-accent)',
  affiliate: 'var(--color-warning)',
}
const LEADERS = 8

type Row = SellerStats & { seller: Seller }

export function PerformancePage() {
  const s = useScoped()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [range, setRange] = useHistoryState<Window>('window', '30')
  const table = useTableHistory()
  const days = Number(range)

  const rows = useMemo<Row[]>(() => {
    const perf = sellerPerformance(s.sellers, s.orders, s.traffic, s.leads, days, now)
    return s.sellers.map((seller) => ({ ...perf.get(seller.id)!, seller }))
  }, [s.sellers, s.orders, s.traffic, s.leads, days, now])

  const totals = useMemo(() => {
    const sum = (pick: (r: Row) => number) => rows.reduce((n, r) => n + pick(r), 0)
    const revenue = sum((r) => r.revenue)
    const storeRevenue = periodKpis(s.orders, s.traffic, days, now).revenue
    const byKind = KINDS.map((kind) => ({
      kind,
      value: rows.filter((r) => r.seller.kind === kind).reduce((n, r) => n + r.revenue, 0),
    }))
    return {
      revenue,
      orders: sum((r) => r.orders),
      commission: sum((r) => r.commission),
      share: storeRevenue ? revenue / storeRevenue : 0,
      storeRevenue,
      byKind,
    }
  }, [rows, s.orders, s.traffic, days, now])

  const leaders = rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue)
  const example = leaders[0]?.seller ?? s.sellers.find((x) => x.status === 'active')
  const exampleSlug = example?.slug ?? 'fahmi'

  const columns: Column<Row>[] = [
    {
      id: 'seller',
      header: 'Seller',
      sortValue: (r) => r.seller.name,
      cell: (r) => (
        <span className="min-w-0 gap-2 inline-flex items-center">
          <Avatar name={r.seller.name} color={r.seller.color} size="sm" />
          <span className="min-w-0">
            <span className="font-medium block truncate">{r.seller.name}</span>
            <span className="block font-mono text-[11px] text-muted">{r.seller.code}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'kind',
      header: 'Kind',
      hideBelow: 'lg',
      sortValue: (r) => r.seller.kind,
      cell: (r) => <span className="whitespace-nowrap">{SELLER_KIND_LABEL[r.seller.kind]}</span>,
    },
    num('views', 'Page views', (r) => r.pageViews, fmtNumber, 'xl'),
    num('visitors', 'Visitors', (r) => r.visitors, fmtNumber, 'lg'),
    num('leads', 'Leads', (r) => r.leads, fmtNumber, 'xl'),
    num('orders', 'Orders', (r) => r.orders, fmtNumber, 'sm'),
    {
      id: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortValue: (r) => r.revenue,
      cell: (r) => (
        <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdrShort(r.revenue)}</span>
      ),
    },
    num(
      'conversion',
      'Conversion',
      (r) => r.conversion,
      (v) => fmtPercent(v, 1),
      'md',
    ),
    num('aov', 'AOV', (r) => r.aov, fmtIdrShort, 'xl'),
    num('repeat', 'Repeat buyers', (r) => r.repeatCustomers, fmtNumber, 'xl'),
    num('commission', 'Commission', (r) => r.commission, fmtIdrShort, 'lg'),
  ]

  return (
    <>
      <PageHeader
        title="Sales performance"
        description="Which sellers bring in revenue through their personal stores and ref links, and what you owe them in commission."
        actions={
          <PillTabs
            size="sm"
            items={WINDOWS.map((w) => ({ value: w, label: `${w} days` }))}
            value={range}
            onValueChange={(v) => setRange(v as Window)}
          />
        }
      />
      <div className="space-y-4">
        <Banner tone="info" title="How attribution works">
          Orders from {storeHost(s.tenant)}/{exampleSlug} or any link with ?ref={exampleSlug} count for that
          seller. Commission is the seller&apos;s rate on that revenue, after refunds.
        </Banner>

        <div className="gap-3 sm:gap-4 md:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Revenue via sellers"
            value={fmtIdrShort(totals.revenue)}
            hint={`Last ${days} days`}
            icon={<Wallet />}
            tone="ink"
          />
          <StatCard
            label="Share of total revenue"
            value={fmtPercent(totals.share)}
            hint={`Of ${fmtIdrShort(totals.storeRevenue)} across every channel`}
            icon={<PieChart />}
            tone="info"
          />
          <StatCard
            label="Orders"
            value={fmtNumber(totals.orders)}
            hint={totals.orders ? `${fmtIdrShort(totals.revenue / totals.orders)} average` : 'None yet'}
            icon={<ShoppingBag />}
            tone="default"
          />
          <StatCard
            label="Commission owed"
            value={fmtIdrShort(totals.commission)}
            hint={fmtIdr(totals.commission)}
            icon={<HandCoins />}
            tone="warning"
          />
        </div>

        <div className="gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] grid grid-cols-1">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Revenue by seller</CardTitle>
              <CardDescription>
                Attributed revenue in the last {days} days. The top seller is highlighted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leaders.length === 0 ? (
                <EmptyState
                  compact
                  title="No attributed sales yet"
                  description="Widen the window, or share personal store links with customers."
                />
              ) : (
                <BarList
                  ariaLabel={`Revenue by seller, last ${days} days`}
                  items={leaders.slice(0, LEADERS).map((r, i) => ({
                    key: r.seller.id,
                    label: r.seller.name,
                    hint: SELLER_KIND_LABEL[r.seller.kind],
                    value: r.revenue,
                    display: fmtIdrShort(r.revenue),
                    emphasis: i === 0,
                    onClick: () => navigate(paths.seller(r.seller.id)),
                  }))}
                />
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Revenue by seller kind</CardTitle>
              <CardDescription>Last {days} days.</CardDescription>
            </CardHeader>
            <CardContent className="gap-6 flex flex-wrap items-center justify-center">
              <Donut
                ariaLabel={`Revenue by seller kind, last ${days} days`}
                segments={totals.byKind.map((k) => ({
                  key: k.kind,
                  label: SELLER_KIND_LABEL[k.kind],
                  value: k.value,
                  color: KIND_COLOR[k.kind],
                }))}
                centerValue={fmtIdrShort(totals.revenue)}
                centerLabel="via sellers"
              />
              <dl className="space-y-2.5 text-sm min-w-[12rem] flex-1">
                {totals.byKind.map((k) => (
                  <div key={k.kind} className="gap-2 flex items-center justify-between">
                    <dt className="min-w-0 gap-2 flex items-center text-muted">
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-sm shrink-0"
                        style={{ background: KIND_COLOR[k.kind] }}
                      />
                      <span className="truncate">{SELLER_KIND_LABEL[k.kind]}</span>
                    </dt>
                    <dd className="gap-2 flex items-center">
                      <span className="font-semibold tabular-nums">{fmtIdrShort(k.value)}</span>
                      <span className="w-11 text-xs text-right text-muted tabular-nums">
                        {totals.revenue ? fmtPercent(k.value / totals.revenue) : '0%'}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Every seller</CardTitle>
            <CardDescription>
              Personal store traffic, leads and attributed orders in the last {days} days. Click a column
              header to sort.
            </CardDescription>
          </CardHeader>
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.seller.id}
            onRowClick={(r) => navigate(paths.seller(r.seller.id))}
            initialSort={{ id: 'revenue', desc: true }}
            pageSize={15}
            empty={
              <EmptyState
                compact
                title="No sellers yet"
                description="Invite sellers to give them a personal store and track what they sell."
              />
            }
            {...table}
          />
        </Card>
      </div>
    </>
  )
}

function num(
  id: string,
  header: string,
  pick: (r: Row) => number,
  format: (v: number) => string,
  hideBelow: Column<Row>['hideBelow'],
): Column<Row> {
  return {
    id,
    header,
    align: 'right',
    hideBelow,
    sortValue: pick,
    cell: (r) => <span className="whitespace-nowrap tabular-nums">{format(pick(r))}</span>,
  }
}
