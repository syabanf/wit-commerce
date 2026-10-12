import { DAY, dayKey, fmtDateShort, fmtPercent, startOfDay } from '@rc/fixtures'
import {
  AGENT_APPROVAL_LABEL,
  AGENT_KIND_LABEL,
  type AgentKind,
  type AgentPolicy,
  type Order,
  type TrafficDay,
} from '@rc/types'

export const AGENT_KINDS = Object.keys(AGENT_KIND_LABEL) as AgentKind[]

export type AgentOrder = Order & { agent: NonNullable<Order['agent']> }
export const isAgentOrder = (o: Order): o is AgentOrder => !!o.agent

export type AgentFilter = 'all' | 'auto' | 'shopper' | 'negotiated'

export const FILTERS: { value: AgentFilter; label: string; test: (o: AgentOrder) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'auto', label: AGENT_APPROVAL_LABEL.auto, test: (o) => o.agent.approval === 'auto' },
  { value: 'shopper', label: AGENT_APPROVAL_LABEL.shopper, test: (o) => o.agent.approval === 'shopper' },
  { value: 'negotiated', label: 'Negotiated', test: (o) => o.agent.negotiated > 0 },
]

/** What a tenant has before anyone saves a policy: agents refused. */
export const defaultPolicy = (tenantId: string): AgentPolicy => ({
  tenantId,
  enabled: false,
  negotiation: false,
  maxAutoDiscountPct: 0,
  approvalAbove: 1_000_000,
  paymentTypeIds: [],
  kinds: [...AGENT_KINDS],
  updatedAt: '',
})

/** First millisecond of the day `daysAgo` days before today (WIB). */
export const dayStart = (now: number, daysAgo: number) => startOfDay(now) - daysAgo * DAY

/** Agent and human sessions per day on the main store, oldest first. */
export function sessionsPerDay(traffic: readonly TrafficDay[], days: number, now: number) {
  const byDay = new Map<string, { visitors: number; agents: number }>()
  for (const t of traffic) {
    if (t.sellerId !== null) continue
    const day = byDay.get(t.day) ?? { visitors: 0, agents: 0 }
    day.visitors += t.visitors
    day.agents += t.agentVisits ?? 0
    byDay.set(t.day, day)
  }
  return Array.from({ length: days }, (_, i) => {
    const ms = dayStart(now, days - 1 - i)
    const day = byDay.get(dayKey(ms))
    return {
      key: dayKey(ms),
      label: fmtDateShort(ms),
      agents: day?.agents ?? 0,
      humans: day ? Math.max(0, day.visitors - day.agents) : 0,
    }
  })
}

/** "Agents are 7% of sessions this week, up from 3% a month ago." */
export function trafficInsight(traffic: readonly TrafficDay[], now: number) {
  const share = (fromDaysAgo: number) => {
    const days = new Set(Array.from({ length: 7 }, (_, i) => dayKey(dayStart(now, fromDaysAgo - i))))
    let visitors = 0
    let agents = 0
    for (const t of traffic) {
      if (t.sellerId !== null || !days.has(t.day)) continue
      visitors += t.visitors
      agents += t.agentVisits ?? 0
    }
    return visitors ? agents / visitors : null
  }
  const week = share(6)
  const monthAgo = share(36)
  if (week === null) return 'No sessions recorded this week.'
  const now7 = fmtPercent(week)
  if (monthAgo === null) return `Agents are ${now7} of sessions this week.`
  const then = fmtPercent(monthAgo)
  const trend = now7 === then ? 'level with' : week > monthAgo ? 'up from' : 'down from'
  return `Agents are ${now7} of sessions this week, ${trend} ${then} a month ago.`
}
