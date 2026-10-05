import { fmtIdr, fmtNumber, plural, productPerformance } from '@rc/fixtures'
import type { Product, ProductStatus } from '@rc/types'
import { PRODUCT_STATUS_LABEL, PRODUCT_TYPE_LABEL } from '@rc/types'
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from '@rc/ui'
import { CircleCheck, Handshake, PackageX, PenLine, Plus, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ProductStatusBadge, StockBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { CategoryPicker } from '../../components/pickers'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { optionAxes, productStock } from './lib'

const STATUSES: ProductStatus[] = ['active', 'scheduled', 'draft', 'archived']

/** Views the stat tiles apply, kept in ?view= so other pages can link to them. */
type View = 'all' | 'active' | 'stock' | 'drafts' | 'assisted'

const VIEW_LABEL: Record<Exclude<View, 'all'>, string> = {
  active: 'on sale',
  stock: 'low or out of stock',
  drafts: 'in draft or scheduled',
  assisted: 'sold through Talk to sales',
}

export function ProductsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const [query, setQuery] = useHistoryState('query', '')
  const [status, setStatus] = useHistoryState<ProductStatus | null>('status', null)
  const [categoryId, setCategoryId] = useHistoryState<string | null>('category', null)
  const table = useTableHistory()

  const setView = (next: View) =>
    setParams(
      (p) => {
        if (next === 'all') p.delete('view')
        else p.set('view', next)
        return p
      },
      { replace: true },
    )

  const perf = useMemo(() => productPerformance(s.products, s.orders, 30, now), [s.products, s.orders, now])

  const viewTest = useMemo(() => {
    const tests: Record<View, (p: Product) => boolean> = {
      all: () => true,
      active: (p) => p.status === 'active',
      stock: (p) => {
        if (p.status === 'archived') return false
        const state = productStock(p, s.stockByProduct).state
        return state === 'low' || state === 'out'
      },
      drafts: (p) => p.status === 'draft' || p.status === 'scheduled',
      assisted: (p) => p.assisted && p.status !== 'archived',
    }
    return tests
  }, [s.stockByProduct])

  const stats = useMemo(() => {
    const count = (v: View) => s.products.filter(viewTest[v]).length
    const out = s.products.filter(
      (p) => p.status !== 'archived' && productStock(p, s.stockByProduct).state === 'out',
    ).length
    return {
      active: count('active'),
      stock: count('stock'),
      out,
      drafts: count('drafts'),
      assisted: count('assisted'),
    }
  }, [s.products, s.stockByProduct, viewTest])

  const inView = useMemo(
    () => s.products.filter((p) => viewTest[view](p) && (!categoryId || p.categoryId === categoryId)),
    [s.products, viewTest, view, categoryId],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inView.filter((p) => {
      if (status && p.status !== status) return false
      if (!q) return true
      return `${p.code} ${p.name} ${p.tags.join(' ')} ${p.variants.map((v) => v.sku).join(' ')}`
        .toLowerCase()
        .includes(q)
    })
  }, [inView, query, status])

  const columns: Column<Product>[] = [
    {
      id: 'product',
      header: 'Product',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{p.code}</p>
          <p className="text-sm font-medium truncate">{p.name}</p>
          {p.variants.length > 1 && (
            <p className="truncate text-[11px] text-muted">
              {plural(p.variants.length, 'variant')}
              {optionAxes(p) && ` · ${optionAxes(p)}`}
            </p>
          )}
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
            <ProductStatusBadge status={p.status} />
            <StockBadge state={productStock(p, s.stockByProduct).state} />
          </div>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      hideBelow: 'lg',
      sortValue: (p) => s.categoryName(p.categoryId),
      cell: (p) => <span className="text-sm">{s.categoryName(p.categoryId)}</span>,
    },
    {
      id: 'type',
      header: 'Type',
      hideBelow: 'xl',
      sortValue: (p) => p.type,
      cell: (p) => <span className="text-sm text-muted">{PRODUCT_TYPE_LABEL[p.type]}</span>,
    },
    {
      id: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (p) => (p.assisted ? null : p.price),
      cell: (p) =>
        p.assisted ? (
          <span className="text-sm whitespace-nowrap text-muted">Talk to sales</span>
        ) : (
          <div className="whitespace-nowrap">
            <p className="font-semibold tabular-nums">{fmtIdr(p.price)}</p>
            {p.compareAt && (
              <p className="text-[11px] text-muted tabular-nums line-through">{fmtIdr(p.compareAt)}</p>
            )}
          </div>
        ),
    },
    {
      id: 'stock',
      header: 'Stock',
      hideBelow: 'md',
      sortValue: (p) => productStock(p, s.stockByProduct).summary.available,
      cell: (p) => {
        const { summary, state } = productStock(p, s.stockByProduct)
        return (
          <div className="whitespace-nowrap">
            <StockBadge state={state} />
            {state !== 'untracked' && (
              <p className="mt-1 text-[11px] text-muted tabular-nums">
                {fmtNumber(summary.available)} available
              </p>
            )}
          </div>
        )
      },
    },
    {
      id: 'sold',
      header: 'Sold, 30 days',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (p) => perf.get(p.id)?.units ?? 0,
      cell: (p) => <span className="tabular-nums">{fmtNumber(perf.get(p.id)?.units ?? 0)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (p) => STATUSES.indexOf(p.status),
      cell: (p) => <ProductStatusBadge status={p.status} />,
    },
  ]

  const filtered = view !== 'all' || !!status || !!categoryId || !!query.trim()
  const clear = () => {
    setQuery('')
    setStatus(null)
    setCategoryId(null)
    setView('all')
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="The catalog every channel sells from: prices, variants, stock and how each product performs."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search products"
              leftIcon={<Search />}
              placeholder="Search name, code, SKU or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {can('product.manage') && (
              <Button onClick={() => navigate(paths.newProduct)}>
                <Plus />
                New product
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        {view !== 'all' && (
          <Banner
            tone="info"
            title={`Showing products ${VIEW_LABEL[view]}`}
            action={
              <Button variant="outline" size="sm" onClick={() => setView('all')}>
                Show all products
              </Button>
            }
          />
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Active products"
            value={stats.active}
            hint="On sale on every channel"
            icon={<CircleCheck />}
            tone="ink"
            onClick={() => setView('active')}
          />
          <StatCard
            label="Low or out of stock"
            value={stats.stock}
            hint={stats.out ? `${stats.out} out of stock` : 'None sold out'}
            icon={<PackageX />}
            tone={stats.out ? 'danger' : stats.stock ? 'warning' : 'success'}
            onClick={() => setView('stock')}
          />
          <StatCard
            label="Drafts and scheduled"
            value={stats.drafts}
            hint="Not on sale yet"
            icon={<PenLine />}
            tone="info"
            onClick={() => setView('drafts')}
          />
          <StatCard
            label="Talk to sales items"
            value={stats.assisted}
            hint="Quoted by your team, not the cart"
            icon={<Handshake />}
            onClick={() => setView('assisted')}
          />
        </div>
        <div className="gap-2 flex flex-wrap items-center">
          <ChipRow className="max-w-full">
            <Chip variant="filter" active={!status} count={inView.length} onClick={() => setStatus(null)}>
              All
            </Chip>
            {STATUSES.map((st) => {
              const count = inView.filter((p) => p.status === st).length
              if (!count && status !== st) return null
              return (
                <Chip
                  key={st}
                  variant="filter"
                  active={status === st}
                  count={count}
                  onClick={() => setStatus(status === st ? null : st)}
                >
                  {PRODUCT_STATUS_LABEL[st]}
                </Chip>
              )
            })}
          </ChipRow>
          <CategoryPicker
            variant="inline"
            clearable
            placeholder="Any category"
            aria-label="Filter by category"
            value={categoryId}
            onChange={setCategoryId}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate(paths.product(p.id))}
          resetPageKey={`${query}|${status}|${categoryId}|${view}`}
          initialSort={{ id: 'product' }}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No products match"
                description="Clear the search and filters to see the whole catalog."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No products yet"
                description="Products you create here go on sale on the website, personal stores and marketplaces once you activate them."
                action={
                  can('product.manage') ? (
                    <Button size="sm" onClick={() => navigate(paths.newProduct)}>
                      <Plus />
                      New product
                    </Button>
                  ) : undefined
                }
              />
            )
          }
          {...table}
        />
      </div>
    </>
  )
}
