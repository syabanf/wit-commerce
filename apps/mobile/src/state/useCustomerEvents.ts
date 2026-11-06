import type { CustomerEventsQuery } from '@rc/api'
import { toMs } from '@rc/fixtures'
import type { CustomerEvent } from '@rc/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HTTP, api } from '../lib/api'

const NONE: readonly CustomerEvent[] = []

export type CustomerEventsFilter = Omit<CustomerEventsQuery, 'tenantId' | 'since'> & {
  limit: number
  /** Only events at or after this moment, in milliseconds. */
  since?: number
}

/**
 * Customer history, newest first and up to `now`. The demo filters the local dataset; with the API
 * the console's state carries no history, so this reads GET /views/customer-events and reads again
 * when the local history changes, which tracks events arriving on the stream. Empty until it answers.
 */
export function useCustomerEvents(
  local: readonly CustomerEvent[],
  tenantId: string,
  filter: CustomerEventsFilter,
  now: number,
): readonly CustomerEvent[] {
  const { customerId, kind, excludeKind, since, limit } = filter
  const [remote, setRemote] = useState<CustomerEvent[] | null>(null)
  const latest = useRef(0)

  const fromState = useMemo(
    () =>
      HTTP
        ? null
        : local
            .filter(
              (e) =>
                (!customerId || e.customerId === customerId) &&
                (!kind || e.kind === kind) &&
                (!excludeKind || e.kind !== excludeKind) &&
                (since === undefined || toMs(e.at) >= since) &&
                toMs(e.at) <= now,
            )
            // Newest first; events at the same moment by id, as the API orders them.
            .sort((a, b) => toMs(b.at) - toMs(a.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .slice(0, limit),
    [local, customerId, kind, excludeKind, since, limit, now],
  )

  useEffect(() => {
    if (!HTTP) return
    const id = ++latest.current
    api.views
      .customerEvents({
        tenantId,
        customerId,
        kind,
        excludeKind,
        since: since === undefined ? undefined : new Date(since).toISOString(),
        limit,
      })
      .then(({ events }) => id === latest.current && setRemote(events))
      .catch(() => id === latest.current && setRemote([]))
  }, [tenantId, customerId, kind, excludeKind, since, limit, local])

  return fromState ?? remote ?? NONE
}
