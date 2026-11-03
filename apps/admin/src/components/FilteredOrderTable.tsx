import type { Order, OrderStatus } from '@rc/types'
import { type Column, DataTable, FilterChips, NoMatch, TableFilters, countBy, matchesQuery } from '@rc/ui'
import { type ReactNode, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useHistoryState, useTableHistory } from '../lib/history-state'
import { useScoped } from '../state/scoped'
import { paths } from './links'

type Stage = 'open' | 'delivered' | 'closed'

const STAGE: Record<OrderStatus, Stage> = {
  new: 'open',
  confirmed: 'open',
  paid: 'open',
  processing: 'open',
  packed: 'open',
  shipped: 'open',
  delivered: 'delivered',
  completed: 'delivered',
  cancelled: 'closed',
  returned: 'closed',
  refunded: 'closed',
}

const STAGES: { value: Stage; label: string }[] = [
  { value: 'open', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Cancelled or returned' },
]

/**
 * One record's orders inside a card (a customer, a campaign, a seller), with search and stage chips.
 * `name` keys the filters in history, so Back restores them.
 */
export function FilteredOrderTable({
  name,
  orders,
  columns,
  initialSort,
  empty,
  className,
}: {
  name: string
  orders: Order[]
  columns: Column<Order>[]
  initialSort: { id: string; desc?: boolean }
  empty?: ReactNode
  className?: string
}) {
  const s = useScoped()
  const navigate = useNavigate()
  const [query, setQuery] = useHistoryState(`${name}.q`, '')
  const [stage, setStage] = useHistoryState<Stage | null>(`${name}.stage`, null)
  const table = useTableHistory(`${name}.table`)

  const searched = useMemo(
    () =>
      orders.filter((o) =>
        matchesQuery(query, o.code, s.customerName(o.customerId), o.voucherCode, o.trackingNo),
      ),
    [orders, query, s],
  )
  const rows = useMemo(
    () => (stage ? searched.filter((o) => STAGE[o.status] === stage) : searched),
    [searched, stage],
  )
  const activeCount = (query.trim() ? 1 : 0) + (stage ? 1 : 0)
  const clear = () => {
    setQuery('')
    setStage(null)
  }

  return (
    <>
      <TableFilters
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Order, customer or voucher"
        searchLabel="Search orders"
        shown={rows.length}
        total={orders.length}
        activeCount={activeCount}
        onClear={clear}
        chips={
          <FilterChips
            options={STAGES}
            value={stage}
            onChange={setStage}
            counts={countBy(searched, (o) => STAGE[o.status])}
            total={searched.length}
          />
        }
      />
      <DataTable
        className={className}
        columns={columns}
        rows={rows}
        pageSize={8}
        getRowKey={(o) => o.id}
        onRowClick={(o) => navigate(paths.order(o.id))}
        initialSort={initialSort}
        resetPageKey={`${query}|${stage}`}
        empty={activeCount ? <NoMatch title="No orders match" onClear={clear} /> : empty}
        {...table}
      />
    </>
  )
}
