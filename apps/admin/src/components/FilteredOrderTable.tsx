import type { OrderRow } from '@rc/api'
import type { OrderStatus } from '@rc/types'
import {
  Button,
  type Column,
  DataTable,
  type DataTableState,
  EmptyState,
  FilterChips,
  NoMatch,
  TableFilters,
  countBy,
  matchesQuery,
} from '@rc/ui'
import { type ReactNode, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { HTTP } from '../lib/api'
import { useHistoryState, useTableHistory } from '../lib/history-state'
import { toRow } from '../state/orderRow'
import { useScoped } from '../state/scoped'
import { useOrderQuery } from '../state/useOrderQuery'
import { paths } from './links'

type Stage = 'open' | 'delivered' | 'closed'

// The API groups the same way in httpapi/views.go (stageCase); keep the two in step.
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

const PAGE_SIZE = 8

/** The record whose orders the card lists; set exactly one. */
export type OrderRecordFilter = { customerId?: string; sellerId?: string; campaignId?: string }

/**
 * One record's orders inside a card (a customer, a campaign, a seller), with search and stage chips.
 * With the API the server filters, sorts and pages them; the demo filters the local orders.
 * `name` keys the filters in history, so Back restores them.
 */
export function FilteredOrderTable({
  name,
  filter,
  columns,
  initialSort,
  total,
  empty,
  className,
}: {
  name: string
  filter: OrderRecordFilter
  /** The record's order count with the API, when the caller already reads it. */
  total?: number
  columns: Column<OrderRow>[]
  initialSort: { id: string; desc?: boolean }
  empty?: ReactNode
  className?: string
}) {
  const s = useScoped()
  const navigate = useNavigate()
  const [query, setQuery] = useHistoryState(`${name}.q`, '')
  const [stage, setStage] = useHistoryState<Stage | null>(`${name}.stage`, null)
  const table = useTableHistory(`${name}.table`)
  const [tableState, setTableState] = useState<DataTableState>(
    () => table.initialState ?? { sort: { id: initialSort.id, desc: initialSort.desc ?? false }, page: 0 },
  )
  const { customerId, sellerId, campaignId } = filter
  const remote = useOrderQuery(
    {
      tenantId: s.tenant.id,
      customerId,
      sellerId,
      campaignId,
      stage,
      q: query.trim(),
      sort: tableState.sort?.id,
      desc: tableState.sort?.desc,
      page: tableState.page,
      pageSize: PAGE_SIZE,
    },
    s.orders,
  )
  // A search narrows the stage counts too, so the record's count needs a read of its own then.
  const searching = !!query.trim()
  const counted = useOrderQuery(
    { tenantId: s.tenant.id, customerId, sellerId, campaignId, pageSize: 1 },
    s.orders,
    searching && total === undefined,
  )

  const local = useMemo(() => {
    if (HTTP) return null
    const orders = s.orders.filter(
      (o) =>
        (!customerId || o.customerId === customerId) &&
        (!sellerId || o.sellerId === sellerId) &&
        (!campaignId || o.campaignId === campaignId),
    )
    const searched = orders.filter((o) =>
      matchesQuery(query, o.code, s.customerName(o.customerId), o.voucherCode, o.trackingNo),
    )
    return {
      total: orders.length,
      searched: searched.length,
      stageCounts: countBy(searched, (o) => STAGE[o.status]),
      rows: (stage ? searched.filter((o) => STAGE[o.status] === stage) : searched).map((o) =>
        toRow(o, s.customerName(o.customerId)),
      ),
    }
  }, [s, customerId, sellerId, campaignId, query, stage])

  const page = remote.page
  const stageCounts = local?.stageCounts ?? page?.stageCounts ?? {}
  const searchedCount = local?.searched ?? Object.values(stageCounts).reduce((sum, n) => sum + (n ?? 0), 0)
  const rows = local?.rows ?? page?.rows ?? []
  const shown = local ? rows.length : (page?.total ?? 0)
  const recordTotal = local?.total ?? total ?? (searching ? (counted.page?.total ?? shown) : searchedCount)
  const activeCount = (searching ? 1 : 0) + (stage ? 1 : 0)
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
        shown={shown}
        total={recordTotal}
        activeCount={activeCount}
        onClear={clear}
        chips={
          <FilterChips
            options={STAGES}
            value={stage}
            onChange={setStage}
            counts={stageCounts}
            total={searchedCount}
          />
        }
      />
      <DataTable
        className={className}
        columns={columns}
        rows={rows}
        totalRows={HTTP ? (page?.total ?? 0) : undefined}
        pageSize={PAGE_SIZE}
        getRowKey={(o) => o.id}
        onRowClick={(o) => navigate(paths.order(o.id))}
        initialSort={initialSort}
        resetPageKey={`${query}|${stage}`}
        empty={
          HTTP && !page && remote.error ? (
            <EmptyState
              compact
              title="The orders did not load"
              description={remote.error}
              action={
                <Button variant="outline" size="sm" onClick={remote.retry}>
                  Try again
                </Button>
              }
            />
          ) : HTTP && !page ? (
            <EmptyState compact title="Loading orders" description="Reading the list from the server." />
          ) : activeCount ? (
            <NoMatch title="No orders match" onClear={clear} />
          ) : (
            empty
          )
        }
        initialState={table.initialState}
        onStateChange={(state) => {
          setTableState(state)
          table.onStateChange(state)
        }}
      />
    </>
  )
}
