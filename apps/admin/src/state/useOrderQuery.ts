import { ApiError, type OrderRowsPage, type OrderRowsQuery } from '@rc/api'
import { useEffect, useRef, useState } from 'react'
import { HTTP, api } from '../lib/api'

const SEARCH_DELAY = 250

/**
 * Reads orders from the API's read model (GET /views/orders). It reads again when the query
 * changes, and when `changed` does: pass the state's orders, which the event stream updates, so a
 * list follows changes made elsewhere. A slower earlier answer never replaces a newer one. With no
 * API, or `enabled` false, it reads nothing and returns a null page.
 */
export function useOrderQuery(query: OrderRowsQuery, changed: unknown, enabled = true) {
  const [page, setPage] = useState<OrderRowsPage | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(0)
  const key = JSON.stringify(query)
  const on = HTTP && enabled

  useEffect(() => {
    if (!on) return
    const id = ++latest.current
    const params = JSON.parse(key) as OrderRowsQuery
    const timer = window.setTimeout(
      () => {
        api.views
          .orders(params)
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
      params.q ? SEARCH_DELAY : 0,
    )
    return () => window.clearTimeout(timer)
  }, [on, key, changed, attempt])

  return { page: on ? page : null, error, retry: () => setAttempt((n) => n + 1) }
}
