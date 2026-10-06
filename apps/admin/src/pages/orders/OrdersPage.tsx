import { HOUR, fmtIdr, fmtWhen, nowMs, plural, toMs, unitCount } from '@rc/fixtures'
import type { Order, OrderStatus } from '@rc/types'
import { CHANNEL_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
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
import { ChevronLeft, ChevronRight, CreditCard, PackageCheck, Search, Truck, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { OrderStatusBadge, PaymentBadge } from '../../components/badges'
import { CustomerLink, SellerChip, paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'

const STATUS_CHIPS: OrderStatus[] = [
  'new',
  'confirmed',
  'paid',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
]

/** Saved views other pages link to with ?view=. */
type View = 'all' | 'unpaid' | 'to-fulfil' | 'in-transit' | 'returns'

const VIEW_TEST: Record<View, (o: Order) => boolean> = {
  all: () => true,
  unpaid: (o) => (o.status === 'new' || o.status === 'confirmed') && o.paymentStatus === 'pending',
  'to-fulfil': (o) => o.status === 'paid' || o.status === 'processing' || o.status === 'packed',
  'in-transit': (o) => o.status === 'shipped',
  returns: (o) => o.status === 'returned' || o.status === 'refunded' || o.refundedAmount > 0,
}

const VIEW_LABEL: Record<Exclude<View, 'all'>, string> = {
  unpaid: 'awaiting payment',
  'to-fulfil': 'to pack and ship',
  'in-transit': 'with the courier',
  returns: 'returned or refunded',
}

export function OrdersPage() {
  const s = useScoped()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const [query, setQuery] = useHistoryState('query', params.get('q') ?? '')
  const [status, setStatus] = useHistoryState<OrderStatus | null>('status', null)
  const table = useTableHistory()
  const statusRowRef = useRef<HTMLDivElement>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  const updateScrollEdges = useCallback(() => {
    const row = statusRowRef.current
    if (!row) return
    setScrollEdges({
      left: row.scrollLeft > 1,
      right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const row = statusRowRef.current
    if (!row) return
    const observer = new ResizeObserver(updateScrollEdges)
    observer.observe(row)
    const frame = requestAnimationFrame(updateScrollEdges)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [updateScrollEdges, view, status, s.orders])

  const scrollStatusFilters = (direction: -1 | 1) => {
    const row = statusRowRef.current
    if (!row) return
    row.scrollBy({ left: direction * Math.max(240, row.clientWidth * 0.7), behavior: 'smooth' })
  }

  const setView = (next: View) =>
    setParams(
      (p) => {
        if (next === 'all') p.delete('view')
        else p.set('view', next)
        p.delete('q')
        return p
      },
      { replace: true },
    )

  const stats = useMemo(() => {
    const count = (v: View) => s.orders.filter(VIEW_TEST[v]).length
    const late = s.orders.filter(
      (o) => VIEW_TEST['to-fulfil'](o) && now - toMs(o.createdAt) > 48 * HOUR,
    ).length
    return {
      unpaid: count('unpaid'),
      toFulfil: count('to-fulfil'),
      late,
      inTransit: count('in-transit'),
      returns: count('returns'),
    }
  }, [s.orders, now])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.orders
      .filter((o) => {
        if (!VIEW_TEST[view](o)) return false
        if (status && o.status !== status) return false
        if (!q) return true
        return `${o.code} ${s.customerName(o.customerId)} ${o.trackingNo ?? ''} ${o.voucherCode ?? ''} ${o.city}`
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
  }, [s, query, status, view])

  const columns: Column<Order>[] = [
    {
      id: 'order',
      header: 'Order',
      sortValue: (o) => o.code,
      cell: (o) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{o.code}</p>
          <p className="text-sm truncate">{s.customerName(o.customerId)}</p>
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="mt-1.5 leading-4 md:hidden text-[0.6875rem] text-muted">
            {fmtWhen(o.createdAt, now)}
          </p>
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      hideBelow: 'xl',
      sortValue: (o) => s.customerName(o.customerId),
      cell: (o) => <CustomerLink customerId={o.customerId} />,
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (o) => o.status,
      cell: (o) => <OrderStatusBadge status={o.status} />,
    },
    {
      id: 'payment',
      header: 'Payment',
      hideBelow: 'lg',
      sortValue: (o) => o.paymentStatus,
      cell: (o) => <PaymentBadge status={o.paymentStatus} />,
    },
    {
      id: 'channel',
      header: 'Channel',
      hideBelow: 'lg',
      sortValue: (o) => o.channel,
      cell: (o) =>
        o.sellerId ? (
          <SellerChip sellerId={o.sellerId} />
        ) : (
          <span className="text-sm text-muted">{CHANNEL_LABEL[o.channel]}</span>
        ),
    },
    {
      id: 'placed',
      header: 'Placed',
      hideBelow: 'md',
      sortValue: (o) => toMs(o.createdAt),
      cell: (o) => {
        const late = VIEW_TEST['to-fulfil'](o) && now - toMs(o.createdAt) > 48 * HOUR
        return (
          <span className={late ? 'font-semibold whitespace-nowrap text-accent' : 'whitespace-nowrap'}>
            {fmtWhen(o.createdAt, now)}
          </span>
        )
      },
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (o) => o.total,
      cell: (o) => (
        <div className="whitespace-nowrap">
          <p className="font-semibold tabular-nums">{fmtIdr(o.total)}</p>
          <p className="text-[0.6875rem] text-muted">{plural(unitCount(o.lines), 'item')}</p>
        </div>
      ),
    },
  ]

  const filtered = view !== 'all' || !!status || !!query.trim()

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order from the website, personal stores, WhatsApp and marketplaces, from payment to delivery."
        actions={
          <Input
            variant="pill"
            type="search"
            aria-label="Search orders"
            leftIcon={<Search />}
            placeholder="Search code, customer or tracking"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 sm:w-72 sm:flex-none flex-1"
          />
        }
      />
      <div className="space-y-4">
        {view !== 'all' && (
          <Banner
            tone="info"
            title={`Showing orders ${VIEW_LABEL[view]}`}
            action={
              <Button variant="outline" size="sm" onClick={() => setView('all')}>
                Show all orders
              </Button>
            }
          />
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="To pack and ship"
            value={stats.toFulfil}
            hint={stats.late ? `${stats.late} waiting over 48 hours` : 'All within 48 hours'}
            icon={<PackageCheck />}
            tone="ink"
            onClick={() => setView('to-fulfil')}
          />
          <StatCard
            label="Awaiting payment"
            value={stats.unpaid}
            hint="Cancels after 24 hours unpaid"
            icon={<CreditCard />}
            tone={stats.unpaid ? 'warning' : 'default'}
            onClick={() => setView('unpaid')}
          />
          <StatCard
            label="With the courier"
            value={stats.inTransit}
            hint="Shipped, not yet delivered"
            icon={<Truck />}
            tone="info"
            onClick={() => setView('in-transit')}
          />
          <StatCard
            label="Returns and refunds"
            value={stats.returns}
            hint="All time"
            icon={<Undo2 />}
            tone={stats.returns ? 'danger' : 'success'}
            onClick={() => setView('returns')}
          />
        </div>
        <div className="min-w-0 gap-2 flex items-center">
          {scrollEdges.left && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Scroll status filters left"
              onClick={() => scrollStatusFilters(-1)}
            >
              <ChevronLeft />
            </Button>
          )}
          <ChipRow
            ref={statusRowRef}
            onScroll={updateScrollEdges}
            aria-label="Filter orders by status"
            className="min-w-0 flex-1"
          >
            <Chip
              variant="filter"
              active={!status}
              count={s.orders.filter(VIEW_TEST[view]).length}
              onClick={() => setStatus(null)}
            >
              All
            </Chip>
            {STATUS_CHIPS.map((st) => {
              const count = s.orders.filter((o) => VIEW_TEST[view](o) && o.status === st).length
              if (!count && status !== st) return null
              return (
                <Chip
                  key={st}
                  variant="filter"
                  active={status === st}
                  count={count}
                  onClick={() => setStatus(status === st ? null : st)}
                >
                  {ORDER_STATUS_LABEL[st]}
                </Chip>
              )
            })}
          </ChipRow>
          {scrollEdges.right && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Scroll status filters right"
              onClick={() => scrollStatusFilters(1)}
            >
              <ChevronRight />
            </Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(o) => o.id}
          onRowClick={(o) => navigate(paths.order(o.id))}
          resetPageKey={`${query}|${status}|${view}`}
          initialSort={{ id: 'placed', desc: true }}
          rowClassName={(o) =>
            VIEW_TEST['to-fulfil'](o) && nowMs() - toMs(o.createdAt) > 48 * HOUR
              ? 'bg-accent-soft/40'
              : undefined
          }
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No orders match"
                description="Clear the search and filters to see every order."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setStatus(null)
                      setView('all')
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No orders yet"
                description="Orders appear here the moment a customer checks out on any channel."
              />
            )
          }
          {...table}
        />
      </div>
    </>
  )
}
