import { ApiError, type OrderRow, type OrderRowsPage, type OrderRowsQuery } from '@rc/api'
import { unitCount } from '@rc/fixtures'
import type { Order } from '@rc/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HTTP, api } from '../lib/api'

/** An order as a list shows it, built from the local dataset or read from the API's read model. */
export const toRow = (o: Order, customerName: string): OrderRow => ({
  id: o.id,
  code: o.code,
  customerId: o.customerId,
  customerName,
  customerCode: '',
  status: o.status,
  paymentStatus: o.paymentStatus,
  channel: o.channel,
  sellerId: o.sellerId,
  campaignId: o.campaignId,
  createdAt: o.createdAt,
  total: o.total,
  subtotal: o.subtotal,
  itemCount: unitCount(o.lines),
  agent: !!o.agent,
  refundedAmount: o.refundedAmount,
  paymentMethod: o.paymentMethod,
  paymentTypeId: o.paymentTypeId ?? null,
  shippedAt: o.events.find((e) => e.status === 'shipped')?.at ?? null,
  agentInfo: o.agent ?? null,
})

/**
 * Reads orders from the API's read model (GET /views/orders). It reads again when the query
 * changes, and when `changed` does, so a list follows orders the event stream updates. A slower
 * earlier answer never replaces a newer one. With no API it reads nothing and returns a null page.
 */
export function useOrderQuery(query: OrderRowsQuery, changed: unknown) {
  const [page, setPage] = useState<OrderRowsPage | null>(null)
  const [error, setError] = useState('')
  const latest = useRef(0)
  const key = JSON.stringify(query)

  useEffect(() => {
    if (!HTTP) return
    const id = ++latest.current
    api.views
      .orders(JSON.parse(key) as OrderRowsQuery)
      .then((next) => {
        if (id !== latest.current) return
        setPage(next)
        setError('')
      })
      .catch((err: unknown) => {
        if (id !== latest.current) return
        setError(err instanceof ApiError ? err.message : 'The server did not answer.')
      })
  }, [key, changed])

  return { page: HTTP ? page : null, error }
}

/**
 * The newest `limit` orders matching `query` and how many match in all. The demo takes them from
 * `local`, the matching orders newest first; with the API the state holds only orders under way,
 * so this reads the read model, again whenever those local orders change. Empty until it answers.
 */
export function useRecentOrders(
  local: readonly Order[],
  query: Omit<OrderRowsQuery, 'sort' | 'desc' | 'pageSize'>,
  customerName: (id: string) => string,
  limit = 5,
): { rows: OrderRow[]; total: number } {
  const changed = HTTP ? local.map((o) => `${o.id}:${o.status}:${o.paymentStatus}`).join() : null
  const { page } = useOrderQuery({ ...query, sort: 'placed', desc: true, pageSize: limit }, changed)
  const demo = useMemo(
    () => (HTTP ? null : local.slice(0, limit).map((o) => toRow(o, customerName(o.customerId)))),
    [local, limit, customerName],
  )
  if (demo) return { rows: demo, total: local.length }
  return { rows: page?.rows ?? [], total: page?.total ?? 0 }
}
