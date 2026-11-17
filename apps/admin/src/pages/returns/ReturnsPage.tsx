import { fmtIdr, fmtWhen, plural } from '@rc/fixtures'
import type { OrderReturn, ReturnStatus } from '@rc/types'
import { RETURN_REASON_LABEL, RETURN_STATUS_LABEL } from '@rc/types'
import {
  Banner,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from '@rc/ui'
import { CircleCheck, Inbox, PackageOpen, Search, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { ReturnStatusBadge } from '../../components/badges'
import { CustomerLink, OrderLink, paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow } from '../../state/scoped'
import { useReturns } from './useReturns'

const CHIPS: ReturnStatus[] = ['requested', 'approved', 'received', 'refunded', 'rejected', 'cancelled']
type Filter = ReturnStatus | 'open' | null

const units = (r: OrderReturn) => r.items.reduce((n, i) => n + i.qty, 0)

/** Every return request: decide, receive and refund them from here. */
export function ReturnsPage() {
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [query, setQuery] = useHistoryState('query', '')
  const [status, setStatus] = useHistoryState<Filter>('status', 'open')
  const table = useTableHistory()
  const { page, error } = useReturns({ status, q: query })
  const counts = page?.statusCounts ?? {}
  const open = (counts.requested ?? 0) + (counts.approved ?? 0) + (counts.received ?? 0)
  const all = CHIPS.reduce((n, st) => n + (counts[st] ?? 0), 0)

  const columns: Column<OrderReturn>[] = [
    {
      id: 'return',
      header: 'Return',
      sortValue: (r) => r.code,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{r.code}</p>
          <p className="mt-0.5 text-xs text-muted">{plural(units(r), 'unit')}</p>
        </div>
      ),
    },
    { id: 'order', header: 'Order', cell: (r) => <OrderLink orderId={r.orderId} /> },
    {
      id: 'customer',
      header: 'Customer',
      hideBelow: 'md',
      cell: (r) => <CustomerLink customerId={r.customerId} />,
    },
    {
      id: 'reason',
      header: 'Reason',
      hideBelow: 'lg',
      sortValue: (r) => r.reason,
      cell: (r) => <span className="text-sm">{RETURN_REASON_LABEL[r.reason]}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => <ReturnStatusBadge status={r.status} />,
    },
    {
      id: 'refund',
      header: 'Refund',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.refundAmount,
      cell: (r) => (
        <span className="tabular-nums">{r.refundAmount ? fmtIdr(r.refundAmount) : 'None yet'}</span>
      ),
    },
    {
      id: 'requested',
      header: 'Requested',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.createdAt,
      cell: (r) => <span className="text-xs text-muted tabular-nums">{fmtWhen(r.createdAt, now)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Returns"
        description="Approve or reject what shoppers send back, receive the parcels and refund them."
        actions={
          <Input
            variant="pill"
            type="search"
            className="min-w-0 sm:w-64 sm:flex-none flex-1"
            aria-label="Search returns"
            placeholder="Return or order code"
            leftIcon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      />
      <div className="space-y-4">
        {error && (
          <Banner tone="danger" title="Returns did not load">
            {error}
          </Banner>
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="To decide"
            value={counts.requested ?? 0}
            hint="Approve or reject"
            icon={<Inbox />}
            tone={counts.requested ? 'warning' : 'default'}
            onClick={() => setStatus('requested')}
          />
          <StatCard
            label="On the way back"
            value={counts.approved ?? 0}
            hint="Approved, parcel not yet in"
            icon={<Undo2 />}
            tone="info"
            onClick={() => setStatus('approved')}
          />
          <StatCard
            label="To refund"
            value={counts.received ?? 0}
            hint="Received, money not yet sent"
            icon={<PackageOpen />}
            tone="ink"
            onClick={() => setStatus('received')}
          />
          <StatCard
            label="Refunded"
            value={fmtIdr(page?.refundedAmount ?? 0)}
            hint={plural(counts.refunded ?? 0, 'return')}
            icon={<CircleCheck />}
            tone="success"
            onClick={() => setStatus('refunded')}
          />
        </div>
        <ChipRow aria-label="Filter returns by status">
          <Chip variant="filter" active={status === 'open'} count={open} onClick={() => setStatus('open')}>
            Open
          </Chip>
          <Chip variant="filter" active={!status} count={all} onClick={() => setStatus(null)}>
            All
          </Chip>
          {CHIPS.map((st) => (
            <Chip
              key={st}
              variant="filter"
              active={status === st}
              count={counts[st] ?? 0}
              onClick={() => setStatus(status === st ? 'open' : st)}
            >
              {RETURN_STATUS_LABEL[st]}
            </Chip>
          ))}
        </ChipRow>
        <DataTable
          columns={columns}
          rows={page?.rows ?? []}
          getRowKey={(r) => r.id}
          onRowClick={(r) => navigate(paths.orderReturn(r.id))}
          resetPageKey={`${query}|${status}`}
          initialSort={{ id: 'requested', desc: true }}
          empty={
            !page ? (
              <EmptyState compact title="Loading returns" description="Reading the list from the server." />
            ) : (
              <EmptyState
                compact
                title={status === 'open' ? 'No open returns' : 'No returns match'}
                description="Start a return from a shipped or delivered order, or wait for a shopper to ask."
              />
            )
          }
          {...table}
        />
      </div>
    </>
  )
}
