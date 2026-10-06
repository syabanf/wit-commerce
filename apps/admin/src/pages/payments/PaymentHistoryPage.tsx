import { fmtDateTime, fmtIdr, toMs } from '@rc/fixtures'
import type { Order, PaymentMethod, PaymentStatus } from '@rc/types'
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@rc/types'
import {
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
import { CircleAlert, CreditCard, ReceiptText, RotateCcw, Search } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { PaymentBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'

const STATUSES: PaymentStatus[] = ['paid', 'pending', 'failed', 'refunded']
const summaryFormat = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const fmtSummary = (value: number) => summaryFormat.format(value)

export function PaymentHistoryPage() {
  const s = useScoped()
  const navigate = useNavigate()
  const [query, setQuery] = useHistoryState('query', '')
  const [status, setStatus] = useHistoryState<PaymentStatus | null>('status', null)
  const [method, setMethod] = useHistoryState<PaymentMethod | ''>('method', '')
  const table = useTableHistory()

  const stats = useMemo(() => {
    const count = (value: PaymentStatus) => s.orders.filter((o) => o.paymentStatus === value).length
    const collected = s.orders
      .filter((o) => o.paymentStatus === 'paid' || o.paymentStatus === 'refunded')
      .reduce((sum, o) => sum + Math.max(0, o.total - o.refundedAmount), 0)
    const refunded = s.orders.reduce((sum, o) => sum + o.refundedAmount, 0)
    const pending = s.orders.filter((o) => o.paymentStatus === 'pending').reduce((sum, o) => sum + o.total, 0)
    return {
      paid: count('paid'),
      pending: count('pending'),
      failed: count('failed'),
      refunded: count('refunded'),
      collected,
      refundedAmount: refunded,
      pendingAmount: pending,
    }
  }, [s.orders])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.orders
      .filter((o) => {
        if (status && o.paymentStatus !== status) return false
        if (method && o.paymentMethod !== method) return false
        return !q || `${o.code} ${s.customerName(o.customerId)}`.toLowerCase().includes(q)
      })
      .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
  }, [s, query, status, method])

  const columns: Column<Order>[] = [
    {
      id: 'order',
      header: 'Order',
      sortValue: (o) => o.code,
      cell: (o) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{o.code}</p>
          <p className="text-sm truncate">{s.customerName(o.customerId)}</p>
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
            <Chip variant="filter" active={!status} count={s.orders.length} onClick={() => setStatus(null)}>
              All
            </Chip>
            {STATUSES.map((item) => (
              <Chip
                key={item}
                variant="filter"
                active={status === item}
                count={stats[item]}
                onClick={() => setStatus(status === item ? null : item)}
              >
                {PAYMENT_STATUS_LABEL[item]}
              </Chip>
            ))}
          </ChipRow>
          <select
            aria-label="Filter payment method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}
            className="h-10 rounded-xl px-3 text-sm max-w-full border border-border bg-card text-body"
          >
            <option value="">All methods</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(o) => o.id}
          onRowClick={(o) => navigate(paths.order(o.id))}
          resetPageKey={`${query}|${status}|${method}`}
          initialSort={{ id: 'placed', desc: true }}
          empty={
            filtered ? (
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
          {...table}
        />
      </div>
    </>
  )
}
