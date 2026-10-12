import type {
  AgentKind,
  AgentPolicy,
  Order,
  PaymentType,
  Product,
  TrafficDay,
} from '../../packages/types/src/index.ts'
import { NOW, isoDaysAgo } from './master.ts'
import { createRng } from './rng.ts'

// Agentic commerce: buying agents that shop for customers. A separate random stream, so every other
// fixture keeps its values and ids.
const rng = createRng(20261012)
const DAY = 86_400_000

const AGENT_METHODS = new Set(['qris', 'va', 'ewallet', 'credit_card'])

export function buildAgentPolicies(paymentTypes: readonly PaymentType[]): AgentPolicy[] {
  const allowed = (tenantId: string) =>
    paymentTypes
      .filter((p) => p.tenantId === tenantId && p.enabled && AGENT_METHODS.has(p.method))
      .map((p) => p.id)
  return [
    {
      tenantId: 'ten-lari',
      enabled: true,
      negotiation: true,
      maxAutoDiscountPct: 5,
      approvalAbove: 2_000_000,
      paymentTypeIds: allowed('ten-lari'),
      kinds: ['chat_assistant', 'browser_agent', 'wallet_agent'],
      updatedAt: isoDaysAgo(9),
    },
    {
      tenantId: 'ten-aruna',
      enabled: true,
      negotiation: false,
      maxAutoDiscountPct: 0,
      approvalAbove: 750_000,
      paymentTypeIds: allowed('ten-aruna'),
      kinds: ['chat_assistant', 'wallet_agent'],
      updatedAt: isoDaysAgo(21),
    },
    {
      tenantId: 'ten-teknika',
      enabled: true,
      negotiation: true,
      maxAutoDiscountPct: 3,
      approvalAbove: 25_000_000,
      paymentTypeIds: allowed('ten-teknika'),
      kinds: ['procurement_agent', 'chat_assistant'],
      updatedAt: isoDaysAgo(4),
    },
  ]
}

// What a shopper tells the agent, built from what the order holds so the story matches the receipt.
const INTENT_TEMPLATES: Record<string, ((name: string, budget: string) => string)[]> = {
  'ten-lari': [
    (n, b) => `Get me ${n} or the closest match under ${b}`,
    (n, b) => `Restock ${n} at the best price this week, max ${b}`,
    (n, b) => `I need ${n} for Sunday's long run, keep it under ${b}`,
  ],
  'ten-aruna': [
    (n, b) => `Reorder ${n} when it runs low, up to ${b}`,
    (n, b) => `Find ${n} or a gentler option for sensitive skin under ${b}`,
  ],
  'ten-teknika': [
    (n, b) => `Quarterly parts order: ${n}, approve up to ${b}`,
    (n, b) => `Replace ${n} on line 2 before the next service, budget ${b}`,
  ],
}

/** "Rp 1,6 juta" or "Rp 700 ribu", rounded up so the budget sits just above the order. */
function budgetText(total: number) {
  if (total >= 1_000_000) {
    const jt = Math.ceil(total / 100_000) / 10
    return `Rp ${String(jt).replace('.', ',')} juta`
  }
  return `Rp ${Math.ceil(total / 50_000) * 50} ribu`
}

const KINDS: Record<string, AgentKind[]> = {
  'ten-lari': ['chat_assistant', 'chat_assistant', 'browser_agent', 'wallet_agent'],
  'ten-aruna': ['chat_assistant', 'wallet_agent'],
  'ten-teknika': ['procurement_agent', 'procurement_agent', 'chat_assistant'],
}

const mandateId = (prefix: string) =>
  `${prefix}_${rng.int(0x100000, 0xffffff).toString(16)}${rng.int(0x1000, 0xffff).toString(16)}`

/**
 * Marks a share of recent website orders as placed by buying agents, growing over the last 60 days,
 * with the mandate chain each one carried.
 */
export function markAgentOrders(
  orders: Order[],
  policies: readonly AgentPolicy[],
  products: readonly Product[],
) {
  const productMap = new Map(products.map((p) => [p.id, p]))
  for (const order of orders) {
    const policy = policies.find((p) => p.tenantId === order.tenantId)
    const b2b = order.tenantId === 'ten-teknika'
    if (!policy?.enabled || !(order.channel === 'web' || (b2b && order.channel === 'whatsapp'))) continue
    const age = (NOW - Date.parse(order.createdAt)) / DAY
    if (age > 60) continue
    // From about 4% two months ago to about 14% this week.
    if (!rng.chance((b2b ? 0.3 : 0.04) + 0.1 * (1 - age / 60))) continue
    const lineValue = order.lines.reduce((s, l) => s + l.price * l.qty, 0)
    const negotiated =
      policy.negotiation && rng.chance(0.45)
        ? Math.round((lineValue * rng.int(1, policy.maxAutoDiscountPct)) / 100 / 1000) * 1000
        : 0
    const first = productMap.get(order.lines[0]!.productId)
    const templates = INTENT_TEMPLATES[order.tenantId] ?? INTENT_TEMPLATES['ten-lari']!
    order.channel = 'agent'
    order.sellerId = null
    order.discount += negotiated
    order.total = Math.max(0, order.total - negotiated)
    if (negotiated)
      order.discountLines = [
        ...(order.discountLines ?? []),
        { promotionId: 'agent-negotiation', label: 'Agent negotiation', amount: negotiated },
      ]
    order.agent = {
      kind: rng.pick(KINDS[order.tenantId] ?? ['chat_assistant']),
      intent: rng.pick(templates)(first?.name ?? 'the usual order', budgetText(order.total)),
      intentMandateId: mandateId('im'),
      cartMandateId: mandateId('cm'),
      paymentMandateId: mandateId('pm'),
      approval: order.total > policy.approvalAbove || rng.chance(0.3) ? 'shopper' : 'auto',
      negotiated,
      compared: rng.int(4, 14),
    }
    order.events = order.events.map((e) =>
      e.status === 'new' ? { ...e, note: 'Order placed by a buying agent under a cart mandate' } : e,
    )
  }
}

/** Agent sessions on the storefront: a growing share of daily visitors. */
export function addAgentVisits(traffic: TrafficDay[]) {
  for (const day of traffic) {
    if (day.sellerId) continue
    const age = (NOW - Date.parse(day.day)) / DAY
    const share = age > 90 ? 0.01 : 0.02 + 0.07 * (1 - age / 90)
    day.agentVisits = Math.round(day.visitors * share * rng.float(0.8, 1.2))
  }
}
