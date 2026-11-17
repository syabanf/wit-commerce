import { ApiError, type ReturnRowsPage, type ReturnRowsQuery } from '@rc/api'
import type { OrderReturn, ReturnStatus } from '@rc/types'
import { OPEN_RETURN_STATUSES } from '@rc/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HTTP, api } from '../../lib/api'
import { useScoped } from '../../state/scoped'

const PAGE_SIZE = 200

const matches = (r: OrderReturn, q: ReturnRowsQuery, orderCode: (id: string) => string) => {
  if (q.orderId && r.orderId !== q.orderId) return false
  const text = q.q?.trim().toLowerCase()
  return !text || `${r.code} ${orderCode(r.orderId)}`.toLowerCase().includes(text)
}

const inStatus = (r: OrderReturn, status: ReturnRowsQuery['status']) =>
  !status || (status === 'open' ? OPEN_RETURN_STATUSES.includes(r.status) : r.status === status)

/**
 * Returns as the list and the order page show them. With the API the state carries only open ones,
 * so this asks GET /views/returns, again whenever an open return changes on the stream; the demo
 * filters its own. A slower earlier answer never replaces a newer one.
 */
export function useReturns(query: Omit<ReturnRowsQuery, 'tenantId'>): {
  page: ReturnRowsPage | null
  error: string
} {
  const s = useScoped()
  const [remote, setRemote] = useState<ReturnRowsPage | null>(null)
  const [error, setError] = useState('')
  const latest = useRef(0)
  const { status, orderId, q } = query

  useEffect(() => {
    if (!HTTP) return
    const id = ++latest.current
    api.views
      .returns({ tenantId: s.tenant.id, status, orderId, q: q?.trim(), pageSize: PAGE_SIZE })
      .then((next) => {
        if (id !== latest.current) return
        setRemote(next)
        setError('')
      })
      .catch((err: unknown) => {
        if (id === latest.current)
          setError(err instanceof ApiError ? err.message : 'The server did not answer.')
      })
  }, [s.tenant.id, status, orderId, q, s.returns, s.orders])

  const local = useMemo(() => {
    if (HTTP) return null
    const orderCode = (id: string) => s.maps.order.get(id)?.code ?? ''
    const base = s.returns.filter((r) => matches(r, { tenantId: s.tenant.id, orderId, q }, orderCode))
    const statusCounts: Partial<Record<ReturnStatus, number>> = {}
    for (const r of base) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1
    const rows = base
      .filter((r) => inStatus(r, status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      rows,
      total: rows.length,
      statusCounts,
      refundedAmount: s.returns.reduce((n, r) => n + r.refundAmount, 0),
    } satisfies ReturnRowsPage
  }, [s.returns, s.maps.order, s.tenant.id, status, orderId, q])

  return { page: local ?? remote, error }
}
