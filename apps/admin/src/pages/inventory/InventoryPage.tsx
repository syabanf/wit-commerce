import { categoryTreeIds, fmtNumber, fmtWhen, plural, toMs } from '@rc/fixtures'
import type {
  Category,
  ModifierStockLevel,
  ModifierStockMove,
  Product,
  StockLevel,
  StockMove,
} from '@rc/types'
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
import { CategoryPicker, ProductPicker, WarehousePicker } from '../../components/pickers'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { AdjustDialog, AdjustModifierDialog, ReceiveDialog } from './dialogs'
import { type ModifierStockRow, type StockRow, modifierStockRows, stockRows } from './lib'

/** Views the tiles and chips apply, kept in ?view= so the nav badge and other pages can link to them. */
type View = 'all' | 'low' | 'out' | 'reserved'
type Perspective = 'category' | 'product' | 'variant' | 'modifier'

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'product', label: 'Product' },
  { value: 'variant', label: 'Variant' },
  { value: 'modifier', label: 'Modifier' },
]

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

type Rollup = {
  onHand: number
  reserved: number
  available: number
  low: number
  out: number
  stockRows: number
}

function rollup(rows: readonly StockRow[]): Rollup {
  return rows.reduce(
    (sum, row) => ({
      onHand: sum.onHand + row.level.onHand,
      reserved: sum.reserved + row.level.reserved,
      available: sum.available + row.available,
      low: sum.low + Number(row.state === 'low'),
      out: sum.out + Number(row.state === 'out'),
      stockRows: sum.stockRows + 1,
    }),
    { onHand: 0, reserved: 0, available: 0, low: 0, out: 0, stockRows: 0 },
  )
}

const matchesView = (view: View, data: Rollup) =>
  view === 'all' ||
  (view === 'low' && data.low > 0) ||
  (view === 'out' && data.out > 0) ||
  (view === 'reserved' && data.reserved > 0)

type ProductRollup = { product: Product; summary: Rollup }
type CategoryRollup = { category: Category; productCount: number; summary: Rollup }

export function InventoryPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const perspective = PERSPECTIVES.some((p) => p.value === params.get('pov'))
    ? (params.get('pov') as Perspective)
    : 'variant'
  const [query, setQuery] = useHistoryState('query', params.get('q') ?? '')
  const [warehouseId, setWarehouseId] = useHistoryState<string | null>('warehouse', null)
  const [categoryId, setCategoryId] = useHistoryState<string | null>('category', null)
  const [productId, setProductId] = useHistoryState<string | null>('product', null)
  const [adjusting, setAdjusting] = useState<StockLevel | null>(null)
  const [adjustingModifier, setAdjustingModifier] = useState<ModifierStockLevel | null>(null)
  const [receivePreset, setReceivePreset] = useState<
    | { target: 'modifier'; groupId: string; optionId: string; warehouseId: string }
    | { target: 'variant'; categoryId: string; productId: string; variantId: string; warehouseId: string }
    | null
  >(null)
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
  const setPerspective = (next: Perspective) => setParam('pov', next === 'variant' ? null : next)

  const all = useMemo(
    () => stockRows(s.stock, s.maps, s.products, s.warehouses),
    [s.stock, s.maps, s.products, s.warehouses],
  )
  const inWarehouse = useMemo(
    () => all.filter((r) => !warehouseId || r.level.warehouseId === warehouseId),
    [all, warehouseId],
  )

  const modifierAll = useMemo(
    () => modifierStockRows(s.modifiers, s.warehouses, s.modifierStock),
    [s.modifiers, s.warehouses, s.modifierStock],
  )
  const modifierInWarehouse = useMemo(
    () => modifierAll.filter((r) => !warehouseId || r.warehouse?.id === warehouseId),
    [modifierAll, warehouseId],
  )

  const selectedCategoryIds = useMemo(
    () => (categoryId ? categoryTreeIds(s.categories, categoryId) : null),
    [s.categories, categoryId],
  )

  const scopedStock = useMemo(
    () =>
      inWarehouse.filter(
        (r) =>
          (!selectedCategoryIds || selectedCategoryIds.has(r.product?.categoryId ?? '')) &&
          (!productId || r.product?.id === productId),
      ),
    [inWarehouse, selectedCategoryIds, productId],
  )

  const stats = useMemo(() => {
    let onHand = 0
    let reserved = 0
    let low = 0
    let out = 0
    if (perspective === 'modifier') {
      for (const r of modifierInWarehouse) {
        onHand += r.level?.onHand ?? 0
        reserved += r.level?.reserved ?? 0
        if (r.state === 'low') low += 1
        if (r.state === 'out') out += 1
      }
      return {
        onHand,
        reserved,
        low,
        out,
        reservedRows: modifierInWarehouse.filter((r) => (r.level?.reserved ?? 0) > 0).length,
        rowCount: modifierInWarehouse.length,
      }
    }
    for (const r of scopedStock) {
      onHand += r.level.onHand
      reserved += r.level.reserved
      if (r.state === 'low') low += 1
      if (r.state === 'out') out += 1
    }
    return {
      onHand,
      reserved,
      low,
      out,
      reservedRows: scopedStock.filter(VIEW_TEST.reserved).length,
      rowCount: scopedStock.length,
    }
  }, [scopedStock, modifierInWarehouse, perspective])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scopedStock.filter((r) => {
      if (!VIEW_TEST[view](r)) return false
      if (!q) return true
      return `${r.product?.code ?? ''} ${r.product?.name ?? ''} ${r.variant?.sku ?? ''} ${r.variant?.name ?? ''} ${r.warehouse?.name ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [scopedStock, query, view])

  const productRows = useMemo<ProductRollup[]>(() => {
    const q = query.trim().toLowerCase()
    return s.products
      .filter(
        (product) =>
          (!selectedCategoryIds || selectedCategoryIds.has(product.categoryId)) &&
          (!productId || product.id === productId),
      )
      .map((product) => ({
        product,
        summary: rollup(inWarehouse.filter((row) => row.product?.id === product.id)),
      }))
      .filter(
        (row) =>
          matchesView(view, row.summary) &&
          (!q ||
            `${row.product.name} ${row.product.code} ${s.categoryName(row.product.categoryId)}`
              .toLowerCase()
              .includes(q)),
      )
  }, [s, inWarehouse, selectedCategoryIds, productId, query, view])

  const categoryRows = useMemo<CategoryRollup[]>(() => {
    const q = query.trim().toLowerCase()
    return s.categories
      .filter((category) => !categoryId || category.id === categoryId)
      .map((category) => {
        const ids = categoryTreeIds(s.categories, category.id)
        return {
          category,
          productCount: s.products.filter((product) => ids.has(product.categoryId)).length,
          summary: rollup(inWarehouse.filter((row) => ids.has(row.product?.categoryId ?? ''))),
        }
      })
      .filter(
        (row) =>
          matchesView(view, row.summary) &&
          (!q || `${row.category.name} ${s.categoryName(row.category.parentId)}`.toLowerCase().includes(q)),
      )
  }, [s, inWarehouse, categoryId, query, view])

  const modifierRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return modifierInWarehouse.filter((r) => {
      if (view === 'low' && r.state !== 'low') return false
      if (view === 'out' && r.state !== 'out') return false
      if (view === 'reserved' && !(r.level?.reserved ?? 0)) return false
      if (!q) return true
      return `${r.group.name} ${r.option.name} ${r.warehouse?.name ?? ''} ${r.group.productIds.map(s.productName).join(' ')}`
        .toLowerCase()
        .includes(q)
    })
  }, [modifierInWarehouse, query, view, s.productName])

  const moves = useMemo(() => [...s.stockMoves].sort((a, b) => toMs(b.at) - toMs(a.at)), [s.stockMoves])
  const modifierMoves = useMemo(
    () => [...s.modifierStockMoves].sort((a, b) => toMs(b.at) - toMs(a.at)),
    [s.modifierStockMoves],
  )

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
                onClick={() => {
                  if (r.recorded) setAdjusting(r.level)
                  else if (r.product) {
                    setReceivePreset({
                      target: 'variant',
                      categoryId: r.product.categoryId,
                      productId: r.product.id,
                      variantId: r.level.variantId,
                      warehouseId: r.level.warehouseId,
                    })
                    setParam('receive', '1')
                  }
                }}
                aria-label={`${r.recorded ? 'Adjust' : 'Receive'} ${r.variant?.sku ?? 'stock'} at ${r.warehouse?.name ?? 'warehouse'}`}
              >
                {r.recorded ? 'Adjust' : 'Receive'}
              </Button>
            ),
          },
        ]
      : []),
  ]

  const categoryColumns: Column<CategoryRollup>[] = [
    {
      id: 'category',
      header: 'Category',
      sortValue: (r) => r.category.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{r.category.name}</p>
          <p className="text-xs text-muted">
            {r.category.parentId ? `In ${s.categoryName(r.category.parentId)}` : 'Top level'} ·{' '}
            {plural(r.productCount, 'product')}
          </p>
        </div>
      ),
    },
    {
      id: 'rows',
      header: 'Stock rows',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.summary.stockRows,
      cell: (r) => fmtNumber(r.summary.stockRows),
    },
    {
      id: 'onHand',
      header: 'On hand',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.summary.onHand,
      cell: (r) => fmtNumber(r.summary.onHand),
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.summary.reserved,
      cell: (r) => fmtNumber(r.summary.reserved),
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      sortValue: (r) => r.summary.available,
      cell: (r) => <span className="font-semibold tabular-nums">{fmtNumber(r.summary.available)}</span>,
    },
    {
      id: 'low',
      header: 'Low',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.summary.low,
      cell: (r) => fmtNumber(r.summary.low),
    },
    {
      id: 'out',
      header: 'Out',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.summary.out,
      cell: (r) => fmtNumber(r.summary.out),
    },
  ]

  const productColumns: Column<ProductRollup>[] = [
    {
      id: 'product',
      header: 'Product',
      sortValue: (r) => r.product.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{r.product.name}</p>
          <p className="text-xs truncate text-muted">
            {r.product.code} · {s.categoryName(r.product.categoryId)} ·{' '}
            {plural(r.product.variants.length, 'variant')}
          </p>
        </div>
      ),
    },
    {
      id: 'rows',
      header: 'Stock rows',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.summary.stockRows,
      cell: (r) => fmtNumber(r.summary.stockRows),
    },
    {
      id: 'onHand',
      header: 'On hand',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.summary.onHand,
      cell: (r) => fmtNumber(r.summary.onHand),
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.summary.reserved,
      cell: (r) => fmtNumber(r.summary.reserved),
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      sortValue: (r) => r.summary.available,
      cell: (r) => <span className="font-semibold tabular-nums">{fmtNumber(r.summary.available)}</span>,
    },
    {
      id: 'low',
      header: 'Low',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.summary.low,
      cell: (r) => fmtNumber(r.summary.low),
    },
    {
      id: 'out',
      header: 'Out',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.summary.out,
      cell: (r) => fmtNumber(r.summary.out),
    },
  ]

  const modifierColumns: Column<ModifierStockRow>[] = [
    {
      id: 'option',
      header: 'Modifier option',
      sortValue: (r) => `${r.group.name} ${r.option.name}`,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{r.option.name}</p>
          <p className="text-xs truncate text-muted">
            {r.group.name} · On {plural(r.group.productIds.length, 'product')}
          </p>
          <p className="text-xs text-muted md:hidden">{r.warehouse?.name ?? 'Not tracked'}</p>
        </div>
      ),
    },
    {
      id: 'warehouse',
      header: 'Warehouse',
      hideBelow: 'md',
      sortValue: (r) => r.warehouse?.name ?? '',
      cell: (r) => <span className="whitespace-nowrap">{r.warehouse?.name ?? 'Not tracked'}</span>,
    },
    {
      id: 'onHand',
      header: 'On hand',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.level?.onHand ?? null,
      cell: (r) => (r.level ? fmtNumber(r.level.onHand) : r.option.stockTracked ? '0' : '—'),
    },
    {
      id: 'reserved',
      header: 'Reserved',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.level?.reserved ?? null,
      cell: (r) => (r.level ? fmtNumber(r.level.reserved) : r.option.stockTracked ? '0' : '—'),
    },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      sortValue: (r) => r.available,
      cell: (r) => (
        <span
          className={
            r.available !== null && r.available <= 0
              ? 'font-semibold text-accent tabular-nums'
              : 'tabular-nums'
          }
        >
          {r.available === null ? '—' : fmtNumber(r.available)}
        </span>
      ),
    },
    {
      id: 'state',
      header: 'State',
      hideBelow: 'sm',
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
            cell: (r: ModifierStockRow) =>
              r.option.stockTracked ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (r.level) setAdjustingModifier(r.level)
                    else if (r.warehouse) {
                      setReceivePreset({
                        target: 'modifier',
                        groupId: r.group.id,
                        optionId: r.option.id,
                        warehouseId: r.warehouse.id,
                      })
                      setParam('receive', '1')
                    }
                  }}
                >
                  {r.level ? 'Adjust' : 'Receive'}
                </Button>
              ) : null,
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

  const modifierMoveColumns: Column<ModifierStockMove>[] = [
    {
      id: 'at',
      header: 'Time',
      sortValue: (m) => toMs(m.at),
      cell: (m) => <span className="whitespace-nowrap">{fmtWhen(m.at, now)}</span>,
    },
    {
      id: 'option',
      header: 'Modifier option',
      cell: (m) => {
        const group = s.modifiers.find((g) => g.id === m.groupId)
        return (
          <div className="min-w-0">
            <p className="truncate">
              {group?.options.find((o) => o.id === m.optionId)?.name ?? 'Removed option'}
            </p>
            <p className="text-xs truncate text-muted">{group?.name ?? 'Removed group'}</p>
          </div>
        )
      },
    },
    {
      id: 'warehouse',
      header: 'Warehouse',
      hideBelow: 'md',
      cell: (m) => s.maps.warehouse.get(m.warehouseId)?.name ?? 'Removed warehouse',
    },
    { id: 'kind', header: 'Kind', hideBelow: 'sm', cell: (m) => STOCK_MOVE_KIND_LABEL[m.kind] },
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
      cell: (m) => <span className="text-muted">{m.note || 'None'}</span>,
    },
  ]

  const filtered = view !== 'all' || !!warehouseId || !!query.trim() || !!categoryId || !!productId
  const clear = () => {
    setQuery('')
    setWarehouseId(null)
    setCategoryId(null)
    setProductId(null)
    setView('all')
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Check stock by category, product, variant or modifier option. Receive and adjust units per warehouse."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search stock"
              leftIcon={<Search />}
              placeholder={
                perspective === 'modifier'
                  ? 'Search modifier or warehouse'
                  : 'Search category, product or SKU'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {manage && (
              <Button onClick={() => {
                setReceivePreset(null)
                setParam('receive', '1')
              }}>
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
            hint={plural(stats.rowCount, perspective === 'modifier' ? 'modifier row' : 'stock row')}
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
            label={perspective === 'modifier' ? 'Low modifier rows' : 'Low stock rows'}
            value={stats.low}
            hint="At or under the safety level"
            icon={<PackageMinus />}
            tone={stats.low ? 'warning' : 'success'}
            onClick={() => setView('low')}
          />
          <StatCard
            label={perspective === 'modifier' ? 'Out of stock modifiers' : 'Out of stock rows'}
            value={stats.out}
            hint="Nothing left to sell"
            icon={<PackageX />}
            tone={stats.out ? 'danger' : 'success'}
            onClick={() => setView('out')}
          />
        </div>
        <ChipRow className="max-w-full">
          {PERSPECTIVES.map((p) => (
            <Chip
              key={p.value}
              variant="filter"
              active={perspective === p.value}
              onClick={() => {
                if (p.value === 'category') {
                  setCategoryId(null)
                  setProductId(null)
                } else if (p.value === 'product') {
                  setProductId(null)
                }
                setPerspective(p.value)
              }}
            >
              {p.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="gap-2 flex flex-wrap items-center">
          <ChipRow className="max-w-full">
            {VIEW_CHIPS.map((c) => (
              <Chip
                key={c.view}
                variant="filter"
                active={view === c.view}
                count={
                  perspective === 'modifier'
                    ? modifierInWarehouse.filter(
                        (r) =>
                          c.view === 'all' ||
                          (c.view === 'low' && r.state === 'low') ||
                          (c.view === 'out' && r.state === 'out') ||
                          (c.view === 'reserved' && (r.level?.reserved ?? 0) > 0),
                      ).length
                    : scopedStock.filter(VIEW_TEST[c.view]).length
                }
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
          {perspective !== 'modifier' && perspective !== 'category' && (
            <CategoryPicker
              variant="inline"
              clearable
              placeholder="Any category"
              aria-label="Filter by category"
              value={categoryId}
              onChange={(next) => {
                setCategoryId(next)
                setProductId(null)
              }}
            />
          )}
          {perspective === 'variant' && (
            <ProductPicker
              variant="inline"
              clearable
              activeOnly={false}
              categoryId={categoryId}
              includeDescendants
              placeholder="Any product"
              aria-label="Filter by product"
              value={productId}
              onChange={setProductId}
            />
          )}
        </div>
        {perspective === 'variant' && (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.level.id}
            onRowClick={(r) => navigate(paths.product(r.level.productId))}
            resetPageKey={`${query}|${view}|${warehouseId}|${categoryId}|${productId}`}
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
        )}
        {perspective === 'product' && (
          <DataTable
            columns={productColumns}
            rows={productRows}
            getRowKey={(r) => r.product.id}
            onRowClick={(r) => {
              setCategoryId(r.product.categoryId)
              setProductId(r.product.id)
              setPerspective('variant')
            }}
            resetPageKey={`${query}|${view}|${warehouseId}|${categoryId}`}
            initialSort={{ id: 'product' }}
            empty={
              <EmptyState
                compact
                title="No products match"
                description="Clear the search and filters to see products."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            }
          />
        )}
        {perspective === 'category' && (
          <DataTable
            columns={categoryColumns}
            rows={categoryRows}
            getRowKey={(r) => r.category.id}
            onRowClick={(r) => {
              setCategoryId(r.category.id)
              setProductId(null)
              setPerspective('product')
            }}
            resetPageKey={`${query}|${view}|${warehouseId}`}
            initialSort={{ id: 'category' }}
            empty={
              <EmptyState
                compact
                title="No categories match"
                description="Clear the search and filters to see categories."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            }
          />
        )}
        {perspective === 'modifier' && (
          <DataTable
            columns={modifierColumns}
            rows={modifierRows}
            getRowKey={(r) => r.key}
            resetPageKey={`${query}|${view}|${warehouseId}`}
            initialSort={{ id: 'option' }}
            empty={
              <EmptyState
                compact
                title="No modifier options match"
                description="Clear the search and filters, or create a modifier group with stock tracking."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            }
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {perspective === 'modifier' ? 'Recent modifier stock moves' : 'Recent stock moves'}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              {perspective === 'modifier'
                ? 'Receipts, adjustments and sales, newest first.'
                : 'Receipts, adjustments, sales and returns, newest first.'}
            </p>
          </CardHeader>
          <CardContent>
            {perspective === 'modifier' ? (
              <DataTable
                columns={modifierMoveColumns}
                rows={modifierMoves}
                getRowKey={(m) => m.id}
                pageSize={8}
                empty={
                  <EmptyState
                    compact
                    title="No modifier stock moves yet"
                    description="Receipts and adjustments appear here as your team records them."
                  />
                }
              />
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>

      <AdjustDialog level={adjusting} onOpenChange={(o) => !o && setAdjusting(null)} />
      <AdjustModifierDialog
        level={adjustingModifier}
        onOpenChange={(o) => !o && setAdjustingModifier(null)}
      />
      <ReceiveDialog
        open={receiving}
        initialTarget={receivePreset?.target ?? (perspective === 'modifier' ? 'modifier' : 'variant')}
        initialCategoryId={receivePreset?.target === 'variant' ? receivePreset.categoryId : undefined}
        initialProductId={receivePreset?.target === 'variant' ? receivePreset.productId : undefined}
        initialVariantId={receivePreset?.target === 'variant' ? receivePreset.variantId : undefined}
        initialGroupId={receivePreset?.target === 'modifier' ? receivePreset.groupId : undefined}
        initialOptionId={receivePreset?.target === 'modifier' ? receivePreset.optionId : undefined}
        initialWarehouseId={receivePreset?.warehouseId}
        onOpenChange={(o) => {
          if (!o) {
            setParam('receive', null)
            setReceivePreset(null)
          }
        }}
      />
    </>
  )
}
