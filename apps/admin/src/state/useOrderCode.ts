import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../lib/api'

/** Most ids one read may ask for (GET /views/orders caps `ids` and `pageSize` at this). */
const BATCH = 500

// Order codes never change, so one module-wide cache serves every link for the whole session.
// Keyed by tenant and id; null means the read model has no such order.
const codes = new Map<string, string | null>()
const asked = new Set<string>()
const queued = new Map<string, Set<string>>()
const listeners = new Set<() => void>()
let timer = 0

const keyOf = (tenantId: string, id: string) => `${tenantId}:${id}`

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function flush() {
  timer = 0
  for (const [tenantId, set] of queued) {
    const ids = [...set]
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      api.views
        .orders({ tenantId, ids: chunk.join(','), pageSize: BATCH })
        .then((page) => {
          const found = new Map(page.rows.map((r) => [r.id, r.code]))
          for (const id of chunk) codes.set(keyOf(tenantId, id), found.get(id) ?? null)
          for (const listener of listeners) listener()
        })
        // Forget the ask so the next link that needs the order tries again.
        .catch(() => chunk.forEach((id) => asked.delete(keyOf(tenantId, id))))
    }
  }
  queued.clear()
}

/**
 * The code of an order the console's state does not carry, read from the API's read model. Links
 * rendered in the same tick share one read. Undefined while unknown, null when there is no such
 * order. With `enabled` false it reads nothing.
 */
export function useOrderCode(orderId: string, tenantId: string, enabled: boolean): string | null | undefined {
  const key = keyOf(tenantId, orderId)
  useEffect(() => {
    if (!enabled || asked.has(key)) return
    asked.add(key)
    let set = queued.get(tenantId)
    if (!set) queued.set(tenantId, (set = new Set()))
    set.add(orderId)
    if (!timer) timer = window.setTimeout(flush, 0)
  }, [enabled, key, orderId, tenantId])
  return useSyncExternalStore(subscribe, () => (enabled ? codes.get(key) : undefined))
}
