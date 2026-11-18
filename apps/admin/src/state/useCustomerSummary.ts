import { type CustomerSummary, customerSummary } from '@rc/fixtures'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { HTTP, api } from '../lib/api'
import { REWARDS } from '../pages/loyalty/lib'
import { useScoped } from './scoped'

const REWARD_POINTS = REWARDS.map((r) => r.points)
/** Changes arrive in bursts (an order touches customers, metrics and sales), so reads wait a little. */
const REFRESH_DELAY = 400

// One summary per brand for the whole console: every screen that shows it shares one read.
const summaries = new Map<string, CustomerSummary>()
const timers = new Map<string, number>()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function refresh(tenantId: string) {
  window.clearTimeout(timers.get(tenantId))
  timers.set(
    tenantId,
    window.setTimeout(() => {
      timers.delete(tenantId)
      api.views
        .customerSummary(tenantId, REWARD_POINTS)
        .then((summary) => {
          summaries.set(tenantId, summary)
          for (const listener of listeners) listener()
        })
        // The last summary stays on screen; the next change asks again.
        .catch(() => undefined)
    }, REFRESH_DELAY),
  )
}

/**
 * Figures over every customer of the current brand: counts by tier and stage, points, segment sizes,
 * buyer figures for the analytics, and what the customer form suggests. With the API they come from
 * GET /views/customer-summary, read again after changes reach the state; null until the first answer.
 * The demo, which holds every customer, sums them here.
 */
export function useCustomerSummary(): CustomerSummary | null {
  const s = useScoped()
  const { tenantId, state } = s
  const local = useMemo(
    () =>
      HTTP
        ? null
        : customerSummary({
            customers: s.customers,
            metrics: s.facts.customerMetrics,
            segments: s.segments,
            products: s.products,
            tenantCode: s.tenant.code,
            rewards: REWARD_POINTS,
          }),
    [s.customers, s.facts.customerMetrics, s.segments, s.products, s.tenant.code],
  )
  useEffect(() => {
    if (HTTP) refresh(tenantId)
  }, [tenantId, state.customers, state.customerMetrics, state.segments, state.orders])
  const remote = useSyncExternalStore(subscribe, () => summaries.get(tenantId) ?? null)
  return HTTP ? remote : local
}
