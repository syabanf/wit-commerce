import { ApiError, type OrderRowsPage } from '@rc/api'
import type { DataTableState } from '@rc/ui'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

const SEARCH_DELAY = 250

/**
 * Reads one page of the orders list from the API's read model. It reads again when a filter, the
 * search, the sort or the page changes, and when `changed` does, which tracks orders arriving on
 * the event stream. A slower earlier answer never replaces a newer one.
 */
export function useOrderRows(
  enabled: boolean,
  params: { tenantId: string; view: string; status: string | null; q: string; table: DataTableState },
  changed: unknown,
) {
  const [page, setPage] = useState<OrderRowsPage | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(0)
  const { tenantId, view, status, q, table } = params

  useEffect(() => {
    if (!enabled) return
    const id = ++latest.current
    const timer = window.setTimeout(
      () => {
        api.views
          .orders({
            tenantId,
            view,
            status,
            q: q.trim(),
            sort: table.sort?.id,
            desc: table.sort?.desc,
            page: table.page,
          })
          .then((next) => {
            if (id !== latest.current) return
            setPage(next)
            setError('')
          })
          .catch((err: unknown) => {
            if (id !== latest.current) return
            setError(err instanceof ApiError ? err.message : 'The server did not answer.')
          })
      },
      q ? SEARCH_DELAY : 0,
    )
    return () => window.clearTimeout(timer)
  }, [enabled, tenantId, view, status, q, table.sort?.id, table.sort?.desc, table.page, changed, attempt])

  return { page, error, retry: () => setAttempt((n) => n + 1) }
}
