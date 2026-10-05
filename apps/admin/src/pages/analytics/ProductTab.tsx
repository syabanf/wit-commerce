import { fmtIdrShort, fmtNumber, fmtPercent, plural, productPerformance, stockState } from '@rc/fixtures'
import type { SearchTerm } from '@rc/types'
import {
  Badge,
  BarList,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  ProgressBar,
  StatCard,
} from '@rc/ui'
import { Boxes, PackageMinus, SearchX, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { ChartCard } from './ChartCard'
import { viewsWithoutSales } from './lib'

// Terms that return this many results or fewer count as weak answers.
const LOW_RESULTS = 3
const EMPTY_STOCK = { onHand: 0, reserved: 0, available: 0, safety: 0 }

export function ProductTab({ days, today }: { days: number; today: number }) {
  const s = useScoped()
  const navigate = useNavigate()

  const d = useMemo(() => {
    const stats = productPerformance(s.products, s.orders, days, today)
    const active = s.products.filter((p) => p.status === 'active')
    const ranked = [...stats.values()].filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue)
    const slow = active
      .filter((p) => p.type === 'physical' && (stats.get(p.id)?.units ?? 0) === 0)
      .map((p) => ({
        product: p,
        available: s.stockByProduct.get(p.id)?.available ?? 0,
        views: stats.get(p.id)?.views ?? 0,
      }))
      .sort((a, b) => b.available - a.available)
    const lowStock = active.filter((p) => {
      const state = stockState(p, s.stockByProduct.get(p.id) ?? EMPTY_STOCK)
      return state === 'low' || state === 'out'
    }).length
    return {
      top: ranked.slice(0, 8),
      units: ranked.reduce((n, r) => n + r.units, 0),
      slow,
      lowStock,
      views: viewsWithoutSales(s.products, stats),
    }
  }, [s.products, s.orders, s.stockByProduct, days, today])

  const searches = useMemo(
    () =>
      s.searchTerms
        .filter((t) => t.results <= LOW_RESULTS)
        .sort((a, b) => a.results - b.results || b.count30d - a.count30d),
    [s.searchTerms],
  )
  const zero = searches.filter((t) => t.results === 0)
  const worst = zero.reduce<SearchTerm | null>(
    (best, t) => (!best || t.count30d > best.count30d ? t : best),
    null,
  )

  const searchColumns: Column<SearchTerm>[] = [
    {
      id: 'term',
      header: 'Search term',
      sortValue: (t) => t.term,
      cell: (t) => <span className="text-xs font-semibold font-mono">{t.term}</span>,
    },
    {
      id: 'count',
      header: 'Searches',
      align: 'right',
      sortValue: (t) => t.count30d,
      cell: (t) => <span className="tabular-nums">{fmtNumber(t.count30d)}</span>,
    },
    {
      id: 'results',
      header: 'Results',
      align: 'right',
      sortValue: (t) => t.results,
      cell: (t) =>
        t.results === 0 ? (
          <Badge variant="accent">No results</Badge>
        ) : (
          <span className="tabular-nums">{fmtNumber(t.results)}</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 md:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Units sold"
          value={fmtNumber(d.units)}
          hint={`Paid orders, last ${days} days`}
          icon={<TrendingUp />}
          tone="ink"
        />
        <StatCard
          label="Slow movers"
          value={fmtNumber(d.slow.length)}
          hint="Active stock items with no sale in the window"
          icon={<PackageMinus />}
        />
        <StatCard
          label="Low or out of stock"
          value={fmtNumber(d.lowStock)}
          hint="Open inventory"
          icon={<Boxes />}
          tone={d.lowStock ? 'warning' : 'success'}
          onClick={() => navigate('/commerce/inventory?view=low')}
        />
        <StatCard
          label="Zero-result searches"
          value={fmtNumber(zero.length)}
          hint={`${fmtNumber(zero.reduce((n, t) => n + t.count30d, 0))} searches found nothing, last 30 days`}
          icon={<SearchX />}
          tone={zero.length ? 'danger' : 'success'}
        />
      </div>

      <div className="gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] grid grid-cols-1">
        <ChartCard
          title="Top products by revenue"
          method={`Order line revenue of paid orders, last ${days} days. Units sold beside each name.`}
        >
          {d.top.length ? (
            <BarList
              ariaLabel={`Top products by revenue, last ${days} days`}
              items={d.top.map((r) => ({
                key: r.productId,
                label: (
                  <Link to={paths.product(r.productId)} className="hover:text-accent">
                    {s.productName(r.productId)}
                  </Link>
                ),
                hint: plural(r.units, 'unit'),
                value: r.revenue,
                display: fmtIdrShort(r.revenue),
              }))}
            />
          ) : (
            <EmptyState compact title="No product sales" description="Widen the window to rank products." />
          )}
        </ChartCard>
        <div className="gap-4 grid grid-cols-1 content-start">
          <Card>
            <CardHeader>
              <CardTitle>High views, low conversion</CardTitle>
              <CardDescription className="text-xs">
                Top quarter by views and under half the store conversion of {fmtPercent(d.views.average, 1)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.views.rows.length ? (
                d.views.rows.map((r) => (
                  <div key={r.productId} className="rounded-2xl p-3 bg-surface-2">
                    <div className="gap-2 flex items-start justify-between">
                      <div className="min-w-0">
                        <Badge variant="outline">Views without orders</Badge>
                        <Link
                          to={paths.product(r.productId)}
                          className="mt-1.5 text-sm font-semibold block truncate hover:text-accent"
                        >
                          {s.productName(r.productId)}
                        </Link>
                      </div>
                      <span className="text-sm font-bold shrink-0 tabular-nums">
                        {fmtPercent(r.conversion, 1)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {fmtNumber(r.views)} views and {plural(r.orders, 'order')} in {days} days. Check price,
                      photos and stock on the product page.
                    </p>
                    <ProgressBar
                      className="mt-2"
                      value={d.views.average ? r.conversion / d.views.average : 0}
                      tone="warning"
                      aria-label={`${s.productName(r.productId)} conversion against the store average`}
                    />
                  </div>
                ))
              ) : (
                <EmptyState
                  compact
                  title="Views turn into orders"
                  description="Products appear here when many views bring few orders."
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Slow movers</CardTitle>
              <CardDescription className="text-xs">
                Active physical products with no units sold in the last {days} days, most stock first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.slow.length ? (
                <>
                  {d.slow.slice(0, 5).map(({ product, available, views }) => (
                    <Link
                      key={product.id}
                      to={paths.product(product.id)}
                      className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2 transition-colors hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold block truncate">{product.name}</span>
                        <span className="text-xs block truncate text-muted">
                          {fmtNumber(available)} in stock · {fmtNumber(views)} views
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">{product.code}</span>
                    </Link>
                  ))}
                  {d.slow.length > 5 && <p className="text-[11px] text-muted">+{d.slow.length - 5} more</p>}
                </>
              ) : (
                <EmptyState
                  compact
                  title="Every product sold"
                  description="Each active product sold at least one unit in this window."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Searches with no or few results</CardTitle>
          <CardDescription className="text-xs">
            Storefront searches in the last 30 days that returned {LOW_RESULTS} products or fewer, whatever
            the window. Rows with no results are highlighted.
          </CardDescription>
        </CardHeader>
        {worst && (
          <p className="mx-5 mb-4 rounded-2xl px-3 py-2 text-sm bg-surface-2">
            <span className="font-semibold">Recommendation:</span> add products, tags or synonyms for “
            {worst.term}”. It was searched {plural(worst.count30d, 'time')} and found nothing.
          </p>
        )}
        <DataTable
          columns={searchColumns}
          rows={searches}
          getRowKey={(t) => t.id}
          pageSize={8}
          rowClassName={(t) => (t.results === 0 ? 'bg-accent-soft/40' : undefined)}
          empty={
            <EmptyState
              compact
              title="Search answers every query"
              description="Terms appear here when shoppers search and find little."
            />
          }
        />
      </Card>
    </div>
  )
}
