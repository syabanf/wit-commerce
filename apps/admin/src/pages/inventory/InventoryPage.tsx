import { fmtNumber, fmtWhen, plural, toMs } from '@rc/fixtures'
import type { StockLevel, StockMove } from '@rc/types'
import { STOCK_MOVE_KIND_LABEL } from '@rc/types'
import {
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from '@rc/ui'
import { Boxes, PackageMinus, PackagePlus, PackageX, Search, ShoppingBag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { StockBadge } from '../../components/badges'
import { PersonChip, paths } from '../../components/links'
import { WarehousePicker } from '../../components/pickers'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { AdjustDialog, ReceiveDialog } from './dialogs'
import { type StockRow, stockRows } from './lib'

/** Views the tiles and chips apply, kept in ?view= so the nav badge and other pages can link to them. */
type View = 'all' | 'low' | 'out' | 'reserved'

const VIEW_TEST: Record<View, (r: StockRow) => boolean> = {
  all: () => true,
  low: (r) => r.state === 'low',
  out: (r) => r.state === 'out',
  reserved: (r) => r.level.reserved > 0,
}

const VIEW_CHIPS: { view: View; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'low', label: 'Low' },
  { view: 'out', label: 'Out' },
  { view: 'reserved', label: 'Reserved' },
]

export function InventoryPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const [query, setQuery] = useHistoryState('query', params.get('q') ?? '')
  const [warehouseId, setWarehouseId] = useHistoryState<string | null>('warehouse', null)
  const [adjusting, setAdjusting] = useState<StockLevel | null>(null)
  const receiving = params.get('receive') === '1'
  const table = useTableHistory()
  const manage = can('inventory.manage')

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true },
    )
  const setView = (next: View) => setParam('view', next === 'all' ? null : next)

  const all = useMemo(() => stockRows(s.stock, s.maps), [s.stock, s.maps])
  const inWarehouse = useMemo(
    () => all.filter((r) => !warehouseId || r.level.warehouseId === warehouseId),
    [all, warehouseId],
  )

  const stats = useMemo(() => {
    let onHand = 0
    let reserved = 0
    let low = 0
    let out = 0
    for (const r of inWarehouse) {
      onHand += r.level.onHand
      reserved += r.level.reserved
      if (r.state === 'low') low += 1
      if (r.state === 'out') out += 1
    }
    return { onHand, reserved, low, out, reservedRows: inWarehouse.filter(VIEW_TEST.reserved).length }
  }, [inWarehouse])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inWarehouse.filter((r) => {
      if (!VIEW_TEST[view](r)) return false
      if (!q) return true
      return `${r.product?.code ?? ''} ${r.product?.name ?? ''} ${r.variant?.sku ?? ''} ${r.variant?.name ?? ''} ${r.warehouse?.name ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [inWarehouse, query, view])

  const moves = useMemo(() => [...s.stockMoves].sort((a, b) => toMs(b.at) - toMs(a.at)), [s.stockMoves])

  const columns: Column<StockRow>[] = [
    {
      id: 'variant',
      header: 'Variant',
      sortValue: (r) => `${r.product?.name ?? ''} ${r.variant?.name ?? ''}`,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{r.product?.name ?? 'Removed product'}</p>
          <p className="truncate font-mono text-[0.6875rem] text-muted">
            {r.variant?.sku} · {r.variant?.name}
          </p>
          <p className="mt-1 md:hidden text-[0.6875rem] text-muted">{r.warehouse?.name}</p>
        </div>
      ),
    },
    {
      id: 'warehouse',
      header: 'Warehouse',
      hideBelow: 'md',
      sortValue: (r) => r.warehouse?.name ?? '',
      cell: (r) => (
        <span className="text-sm whitespace-nowrap">{r.warehouse?.name ?? 'Removed warehouse'}</span>
      ),
    },
    {
      id: 'onHand',
      header: 'On hand',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.level.onHand,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.level.onHand)}</span>,
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.level.reserved,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.level.reserved)}</span>,
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      sortValue: (r) => r.available,
      cell: (r) => (
        <span
          className={
            r.available <= 0
              ? 'font-semibold text-accent tabular-nums'
              : r.available <= r.level.safety
                ? 'font-semibold text-warning tabular-nums'
                : 'tabular-nums'
          }
        >
          {fmtNumber(r.available)}
        </span>
      ),
    },
    {
      id: 'safety',
      header: 'Safety',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (r) => r.level.safety,
      cell: (r) => <span className="text-muted tabular-nums">{fmtNumber(r.level.safety)}</span>,
    },
    {
      id: 'state',
      header: 'State',
      hideBelow: 'md',
      sortValue: (r) => r.state,
      cell: (r) => <StockBadge state={r.state} />,
    },
    ...(manage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right' as const,
            width: '6rem',
            cell: (r: StockRow) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdjusting(r.level)}
                aria-label={`Adjust ${r.variant?.sku ?? 'stock'} at ${r.warehouse?.name ?? 'warehouse'}`}
              >
                Adjust
              </Button>
            ),
          },
        ]
      : []),
  ]

  const moveColumns: Column<StockMove>[] = [
    {
      id: 'at',
      header: 'Time',
      sortValue: (m) => toMs(m.at),
      cell: (m) => <span className="text-sm whitespace-nowrap">{fmtWhen(m.at, now)}</span>,
    },
    {
      id: 'variant',
      header: 'Variant',
      cell: (m) => {
        const variant = s.maps.variant.get(m.variantId)
        return (
          <div className="min-w-0">
            <p className="text-sm truncate">
              {variant ? s.productName(variant.productId) : 'Removed product'}
            </p>
            <p className="truncate font-mono text-[0.6875rem] text-muted">{variant?.sku}</p>
          </div>
        )
      },
    },
    {
      id: 'warehouse',
      header: 'Warehouse',
      hideBelow: 'md',
      cell: (m) => (
        <span className="text-sm whitespace-nowrap">
          {s.maps.warehouse.get(m.warehouseId)?.name ?? 'Removed warehouse'}
        </span>
      ),
    },
    {
      id: 'kind',
      header: 'Kind',
      hideBelow: 'sm',
      cell: (m) => <span className="text-sm text-muted">{STOCK_MOVE_KIND_LABEL[m.kind]}</span>,
    },
    {
      id: 'qty',
      header: 'Units',
      align: 'right',
      cell: (m) => (
        <span className="font-semibold tabular-nums">
          {m.qty > 0 ? '+' : ''}
          {fmtNumber(m.qty)}
        </span>
      ),
    },
    { id: 'by', header: 'By', hideBelow: 'lg', cell: (m) => <PersonChip userId={m.by} /> },
    {
      id: 'note',
      header: 'Note',
      hideBelow: 'xl',
      cell: (m) => <span className="text-sm text-muted">{m.note || 'None'}</span>,
    },
  ]

  const filtered = view !== 'all' || !!warehouseId || !!query.trim()
  const clear = () => {
    setQuery('')
    setWarehouseId(null)
    setView('all')
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock per variant and warehouse: what is on hand, what open orders hold, and what is left to sell."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search stock"
              leftIcon={<Search />}
              placeholder="Search product, SKU or warehouse"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {manage && (
              <Button onClick={() => setParam('receive', '1')}>
                <PackagePlus />
                Receive stock
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        {view !== 'all' && (
          <Banner
            tone="info"
            title={
              view === 'reserved'
                ? 'Showing stock held for open orders'
                : `Showing ${view === 'low' ? 'low' : 'out of'} stock rows`
            }
            action={
              <Button variant="outline" size="sm" onClick={() => setView('all')}>
                Show all stock
              </Button>
            }
          />
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Units on hand"
            value={fmtNumber(stats.onHand)}
            hint={plural(inWarehouse.length, 'stock row')}
            icon={<Boxes />}
            tone="ink"
            onClick={() => setView('all')}
          />
          <StatCard
            label="Reserved for open orders"
            value={fmtNumber(stats.reserved)}
            hint={`Across ${plural(stats.reservedRows, 'row')}`}
            icon={<ShoppingBag />}
            tone="info"
            onClick={() => setView('reserved')}
          />
          <StatCard
            label="Low stock rows"
            value={stats.low}
            hint="At or under the safety level"
            icon={<PackageMinus />}
            tone={stats.low ? 'warning' : 'success'}
            onClick={() => setView('low')}
          />
          <StatCard
            label="Out of stock rows"
            value={stats.out}
            hint="Nothing left to sell"
            icon={<PackageX />}
            tone={stats.out ? 'danger' : 'success'}
            onClick={() => setView('out')}
          />
        </div>
        <div className="gap-2 flex flex-wrap items-center">
          <ChipRow className="max-w-full">
            {VIEW_CHIPS.map((c) => (
              <Chip
                key={c.view}
                variant="filter"
                active={view === c.view}
                count={inWarehouse.filter(VIEW_TEST[c.view]).length}
                onClick={() => setView(view === c.view ? 'all' : c.view)}
              >
                {c.label}
              </Chip>
            ))}
          </ChipRow>
          <WarehousePicker
            variant="inline"
            clearable
            placeholder="Any warehouse"
            aria-label="Filter by warehouse"
            value={warehouseId}
            onChange={setWarehouseId}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.level.id}
          onRowClick={(r) => navigate(paths.product(r.level.productId))}
          resetPageKey={`${query}|${view}|${warehouseId}`}
          initialSort={{ id: 'available' }}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No stock matches"
                description="Clear the search and filters to see every stock row."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No stock recorded yet"
                description="A row appears for each variant and warehouse the first time you receive stock."
              />
            )
          }
          {...table}
        />

        <Card>
          <CardHeader>
            <CardTitle>Recent stock moves</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Receipts, adjustments, sales and returns, newest first.
            </p>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={moveColumns}
              rows={moves}
              getRowKey={(m) => m.id}
              pageSize={8}
              empty={
                <EmptyState
                  compact
                  title="No stock moves yet"
                  description="Receipts and adjustments show here as your team records them."
                />
              }
            />
          </CardContent>
        </Card>
      </div>

      <AdjustDialog level={adjusting} onOpenChange={(o) => !o && setAdjusting(null)} />
      <ReceiveDialog open={receiving} onOpenChange={(o) => !o && setParam('receive', null)} />
    </>
  )
}
