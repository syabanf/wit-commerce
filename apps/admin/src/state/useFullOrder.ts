import type { Order } from '@rc/types'
import { useEffect, useState } from 'react'
import { HTTP, api } from '../lib/api'

/**
 * The order with its whole history. With the API the console's state keeps only orders still under
 * way, each with only its shipments, so this reads the order by id: once, and again when the listed
 * copy changes. A closed order is not listed, so the read copy stands in for it until a change on
 * the stream lists it. The longer history wins, since a change on the stream arrives with the full
 * order. `loading` is true while an unlisted order is being read.
 */
export function useFullOrder(
  id: string | undefined,
  listed: Order | undefined,
  tenantId: string,
): { order: Order | undefined; loading: boolean } {
  const [fetched, setFetched] = useState<Order | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    if (!HTTP || !id) return
    let cancelled = false
    api.orders
      .get(id, tenantId)
      .then((order) => {
        if (cancelled) return
        setFetched(order)
        setFailed(null)
      })
      .catch(() => !cancelled && setFailed(id))
    return () => {
      cancelled = true
    }
  }, [id, listed, tenantId])

  const read = fetched && fetched.id === id ? fetched : undefined
  if (!listed) return { order: read, loading: HTTP && !!id && !read && failed !== id }
  if (!read || read.events.length <= listed.events.length) return { order: listed, loading: false }
  return { order: { ...listed, events: read.events }, loading: false }
}
