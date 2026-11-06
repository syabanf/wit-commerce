import type { OrderRow } from '@rc/api'
import { fmtDateTime, fmtIdr, toMs } from '@rc/fixtures'
import type { PaymentMethod, PaymentStatus } from '@rc/types'
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@rc/types'
import {
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  type DataTableState,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
  countBy,
  matchesQuery,
} from '@rc/ui'
import { CircleAlert, CreditCard, ReceiptText, RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PaymentBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { HTTP } from '../../lib/api'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { toRow } from '../../state/orderRow'
import { useScoped } from '../../state/scoped'
import { useOrderQuery } from '../../state/useOrderQuery'

const STATUSES: PaymentStatus[] = ['paid', 'pending', 'failed', 'refunded']
const summaryFormat = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const fmtSummary = (value: number) => summaryFormat.format(value)

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }))

const INITIAL_TABLE: DataTableState = { sort: { id: 'placed', desc: true }, page: 0 }
// Column ids the API sorts by under another name; the rest match.
const SORT_KEY: Record<string, string> = { status: 'payment' }
const NO_PAYMENTS = {
  paid: 0,
  pending: 0,
  failed: 0,
  refunded: 0,
  collected: 0,
  refundedAmount: 0,
  pendingAmount: 0,
}

export function PaymentHistoryPage() {
  const s = useScoped()
  const navigate = useNavigate()
  const [query, setQuery] = useHistoryState('query', '')
  const [status, setStatus] = useHistoryState<PaymentStatus | null>('status', null)
  const [method, setMethod] = useHistoryState<PaymentMethod | ''>('method', '')
  const table = useTableHistory()
  // With the API the state holds only open orders, so the server filters, sorts and pages the
  // whole history. The page keeps the table's state to ask for it.
  const [tableState, setTableState] = useState<DataTableState>(table.initialState ?? INITIAL_TABLE)
  const sortId = tableState.sort?.id
  const remote = useOrderQuery(
    {
      tenantId: s.tenantId,
      paymentStatus: status,
      paymentMethod: method || null,
      q: query.trim(),
      sort: sortId ? (SORT_KEY[sortId] ?? sortId) : undefined,
      desc: tableState.sort?.desc,
      page: tableState.page,
    },
    s.orders,
  )

  const local = useMemo(() => {
    if (HTTP) return null
    const count = (value: PaymentStatus) => s.orders.filter((o) => o.paymentStatus === value).length
    const collected = s.orders
      .filter((o) => o.paymentStatus === 'paid' || o.paymentStatus === 'refunded')
      .reduce((sum, o) => sum + Math.max(0, o.total - o.refundedAmount), 0)
    const refunded = s.orders.reduce((sum, o) => sum + o.refundedAmount, 0)
    const pending = s.orders.filter((o) => o.paymentStatus === 'pending').reduce((sum, o) => sum + o.total, 0)
    // Search and method first, so the status chip counts reflect them.
    const base = s.orders
      .filter(
        (o) =>
          (!method || o.paymentMethod === method) &&
          matchesQuery(query, o.code, s.customerName(o.customerId)),
      )
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
      .map((o) => toRow(o, s.customerName(o.customerId)))
    return {
      stats: {
        paid: count('paid'),
        pending: count('pending'),
        failed: count('failed'),
        refunded: count('refunded'),
        collected,
        refundedAmount: refunded,
        pendingAmount: pending,
      },
      rows: status ? base.filter((o) => o.paymentStatus === status) : base,
      statusCounts: countBy(base, (o) => o.paymentStatus),
      total: base.length,
    }
  }, [s, query, method, status])

  const page = remote.page
  const stats = local?.stats ?? page?.payments ?? NO_PAYMENTS
  const rows = local?.rows ?? page?.rows ?? []
  const statusCounts: Partial<Record<PaymentStatus, number>> =
    local?.statusCounts ?? page?.paymentStatusCounts ?? {}
  const allCount = local?.total ?? STATUSES.reduce((n, st) => n + (statusCounts[st] ?? 0), 0)

  const columns: Column<OrderRow>[] = [
    {
      id: 'order',
      header: 'Order',
      sortValue: (o) => o.code,
      cell: (o) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{o.code}</p>
          <p className="text-sm truncate">{o.customerName}</p>
          <div className="mt-1.5 sm:hidden">
            <PaymentBadge status={o.paymentStatus} />
          </div>
          <p className="mt-1 text-xs md:hidden text-muted">Placed {fmtDateTime(o.createdAt)}</p>
        </div>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      hideBelow: 'lg',
      sortValue: (o) => PAYMENT_METHOD_LABEL[o.paymentMethod],
      cell: (o) =>
        s.maps.paymentType.get(o.paymentTypeId ?? '')?.name ?? PAYMENT_METHOD_LABEL[o.paymentMethod],
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (o) => o.paymentStatus,
      cell: (o) => <PaymentBadge status={o.paymentStatus} />,
    },
    {
      id: 'placed',
      header: 'Order placed',
      hideBelow: 'md',
      sortValue: (o) => toMs(o.createdAt),
      cell: (o) => <span className="whitespace-nowrap">{fmtDateTime(o.createdAt)}</span>,
    },
    {
      id: 'refund',
      header: 'Refunded',
      hideBelow: 'lg',
      align: 'right',
      sortValue: (o) => o.refundedAmount,
      cell: (o) => <span className="tabular-nums">{o.refundedAmount ? fmtIdr(o.refundedAmount) : '—'}</span>,
    },
    {
      id: 'total',
      header: 'Order total',
      align: 'right',
      sortValue: (o) => o.total,
      cell: (o) => <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdr(o.total)}</span>,
    },
  ]

  const filtered = !!query.trim() || !!status || !!method
  const clear = () => {
    setQuery('')
    setStatus(null)
    setMethod('')
  }

  return (
    <>
      <PageHeader
        title="Payment history"
        description="Payment status and refunds for each order. Dates show when the order was placed."
        actions={
          <Input
            variant="pill"
            type="search"
            aria-label="Search payments"
            leftIcon={<Search />}
            placeholder="Search order or customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-80 max-w-full"
          />
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Paid"
            value={stats.paid}
            hint={`${fmtSummary(stats.collected)} net after refunds`}
            icon={<CreditCard />}
            tone="success"
            onClick={() => setStatus('paid')}
          />
          <StatCard
            label="Awaiting payment"
            value={stats.pending}
            hint={`${fmtSummary(stats.pendingAmount)} pending`}
            icon={<ReceiptText />}
            tone="warning"
            onClick={() => setStatus('pending')}
          />
          <StatCard
            label="Refunded"
            value={stats.refunded}
            hint={`${fmtSummary(stats.refundedAmount)} refunded`}
            icon={<RotateCcw />}
            tone="info"
            onClick={() => setStatus('refunded')}
          />
          <StatCard
            label="Failed"
            value={stats.failed}
            hint="Payment did not complete"
            icon={<CircleAlert />}
            tone="danger"
            onClick={() => setStatus('failed')}
          />
        </div>
        <div className="gap-3 flex flex-wrap items-center">
          <ChipRow aria-label="Filter payments by status" className="min-w-0 flex-1">
            <Chip variant="filter" active={!status} count={allCount} onClick={() => setStatus(null)}>
              All
            </Chip>
            {STATUSES.map((item) => (
              <Chip
                key={item}
                variant="filter"
                active={status === item}
                count={statusCounts[item] ?? 0}
                onClick={() => setStatus(status === item ? null : item)}
              >
                {PAYMENT_STATUS_LABEL[item]}
              </Chip>
            ))}
          </ChipRow>
          <NativeSelect
            variant="inline"
            aria-label="Filter by payment method"
            placeholder="Any method"
            options={METHOD_OPTIONS}
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          totalRows={HTTP ? (page?.total ?? 0) : undefined}
          getRowKey={(o) => o.id}
          onRowClick={(o) => navigate(paths.order(o.id))}
          resetPageKey={`${query}|${status}|${method}`}
          initialSort={{ id: 'placed', desc: true }}
          empty={
            HTTP && !page ? (
              <EmptyState compact title="Loading payments" description="Reading the list from the server." />
            ) : filtered ? (
              <EmptyState
                compact
                title="No payments match"
                description="Try another search or filter."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No payment history yet"
                description="Orders and their payment status will appear here."
              />
            )
          }
          initialState={table.initialState}
          onStateChange={(state) => {
            setTableState(state)
            table.onStateChange(state)
          }}
        />
      </div>
    </>
  )
}
