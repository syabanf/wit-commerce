import { ApiError, type CustomerRowsPage, type CustomerRowsQuery } from '@rc/api'
import { useEffect, useRef, useState } from 'react'
import { HTTP, api } from '../lib/api'

const SEARCH_DELAY = 250

/**
 * Reads customers from the API (GET /views/customers). It reads again when the query changes, and
 * when `changed` does: pass state the event stream updates, so a list follows changes made
 * elsewhere. A slower earlier answer never replaces a newer one. With no API, or `enabled` false,
 * it reads nothing and returns a null page.
 */
export function useCustomerQuery(query: CustomerRowsQuery, changed: unknown, enabled = true) {
  const [page, setPage] = useState<CustomerRowsPage | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(0)
  const key = JSON.stringify(query)
  const on = HTTP && enabled

  useEffect(() => {
    if (!on) return
    const id = ++latest.current
    const params = JSON.parse(key) as CustomerRowsQuery
    const timer = window.setTimeout(
      () => {
        api.views
          .customers(params)
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
      params.q || params.rules ? SEARCH_DELAY : 0,
    )
    return () => window.clearTimeout(timer)
  }, [on, key, changed, attempt])

  return { page: on ? page : null, error, retry: () => setAttempt((n) => n + 1) }
}
