import { fmtIdr, nowMs, orderPlaceBlocker } from '@rc/fixtures'
import type { AgentPolicy, Customer, Industry, Order } from '@rc/types'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { type AgentPlan, type MandateInput, planAgentRun, runSteps } from '../lib/agent'
import { buildOrder } from '../lib/checkout'
import { type ShopValue, useShop } from './shop'
import { useStore } from './store'

const EXAMPLES: Record<Industry, string[]> = {
  sport: [
    'Running shoes for my first half marathon, size 42, under Rp 1,5 juta',
    'Energy gels for Sunday’s race at the best price',
    'Belikan kaos lari yang ringan di bawah 400 ribu',
  ],
  beauty: [
    'Serum for sensitive skin under Rp 300 ribu',
    'A daily sunscreen at the best price',
    'A gift set for my mother around Rp 500 ribu',
  ],
  industrial: [
    'Air filter element set for compressor line 2',
    'Way lube oil 20L at the best price this month',
  ],
  fashion: ['A linen shirt under Rp 400 ribu'],
  electronics: ['Wireless earbuds under Rp 1 juta'],
  fnb: ['Coffee beans for a week'],
}

/** Auto-pay limits the shopper can pick; 0 means the agent always asks. */
const LIMITS: Record<Industry, number[]> = {
  sport: [0, 500_000, 1_000_000, 2_000_000],
  beauty: [0, 200_000, 300_000, 750_000],
  industrial: [0, 2_500_000, 5_000_000, 25_000_000],
  fashion: [0, 250_000, 500_000, 1_000_000],
  electronics: [0, 500_000, 1_500_000, 3_000_000],
  fnb: [0, 100_000, 200_000, 500_000],
}

/** Milliseconds between the agent's work steps, slow enough to follow on a demo screen. */
const STEP_MS = 750

export type CartStatus = 'awaiting' | 'auto' | 'paid' | 'declined' | 'replaced' | 'failed'
export type CartItem = { id: number; kind: 'cart'; plan: AgentPlan; status: CartStatus; note?: string }

export type Item =
  | { id: number; kind: 'me'; text: string }
  | { id: number; kind: 'bot'; text: string; replies?: string[] }
  | { id: number; kind: 'run'; plan: AgentPlan; shown: number }
  | { id: number; kind: 'picks'; plan: AgentPlan }
  | CartItem
  | { id: number; kind: 'receipt'; order: Order; plan: AgentPlan }

export interface Settings {
  limit: number
  paymentTypeId: string | null
}

/** What the last run worked from, so "cheaper", "size 43" or "pay with OVO" refine it. */
interface Context {
  task: string
  budget: number | null
  productId: string | null
  categoryId: string | null
  plan: AgentPlan | null
}

type Ask = Omit<Context, 'plan'>
const fresh = (task: string): Ask => ({ task, budget: null, productId: null, categoryId: null })

export interface AgentChat {
  items: Item[]
  settings: Settings
  setSettings: (s: Settings) => void
  limits: number[]
  examples: string[]
  policy: AgentPolicy | null
  busy: boolean
  protocol: boolean
  setProtocol: (on: boolean) => void
  orders: Order[]
  say: (text: string) => void
  approve: (cart: CartItem) => void
  decline: (cart: CartItem) => void
  choose: (productId: string) => void
}

const AgentChatContext = createContext<AgentChat | null>(null)

/**
 * One buying-agent conversation per store visit, shared by the store assistant and `/:store/agent`, so a
 * chat started in the drawer carries on on the page. Runs keep stepping and paying while the shopper browses.
 */
export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { catalog, tenant, customer, send } = useShop()
  const { state } = useStore()
  const policy = state.agentPolicies.find((p) => p.tenantId === tenant.id) ?? null
  const examples = EXAMPLES[tenant.industry]
  const limits = LIMITS[tenant.industry]
  const [settings, setSettings] = useState<Settings>({ limit: limits[2]!, paymentTypeId: null })
  const [items, setItems] = useState<Item[]>([])
  const [ctx, setCtx] = useState<Context | null>(null)
  const [running, setRunning] = useState<number | null>(null)
  const [protocol, setProtocol] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const nextId = useRef(1)
  const id = () => nextId.current++
  const push = useCallback((...next: Item[]) => setItems((list) => [...list, ...next]), [])
  const patch = useCallback(
    (itemId: number, change: Partial<Item>) =>
      setItems((list) => list.map((it) => (it.id === itemId ? ({ ...it, ...change } as Item) : it))),
    [],
  )
  const awaiting = [...items]
    .reverse()
    .find((it): it is CartItem => it.kind === 'cart' && it.status === 'awaiting')

  /** Plans a run and starts its animation; settings changes not yet in state come in `override`. */
  const run = (c: Ask, override: Partial<Settings> = {}) => {
    if (!customer) return
    const s = { ...settings, ...override }
    const input: MandateInput = {
      task: c.task,
      kind: 'chat_assistant',
      budget: c.budget,
      approval: s.limit ? 'under_limit' : 'always',
      autoLimit: s.limit,
      paymentTypeId: s.paymentTypeId,
      productId: c.productId,
      categoryId: c.categoryId,
    }
    const plan = planAgentRun(input, catalog, policy, customer, nowMs())
    const runId = id()
    // A run that finds nothing leaves the last good one to refine.
    setCtx((prev) => (plan.choice || !prev ? { ...c, plan } : prev))
    push({ id: runId, kind: 'run', plan, shown: 0 })
    setRunning(runId)
  }

  const place = (cart: CartItem) => {
    if (!customer) return
    const placed = placeAgentOrder(cart.plan, catalog, customer, state)
    if (typeof placed === 'string') {
      patch(cart.id, { status: 'failed', note: placed })
      push({ id: id(), kind: 'bot', text: `I could not place it: ${placed}` })
      return
    }
    send({ type: 'orders/place', order: placed, customer: null })
    setOrders((list) => [placed, ...list])
    patch(cart.id, { status: 'paid' })
    push(
      { id: id(), kind: 'receipt', order: placed, plan: cart.plan },
      {
        id: id(),
        kind: 'bot',
        text: 'Done. Anything else I can buy for you?',
        replies: examples.filter((e) => e !== ctx?.task).slice(0, 2),
      },
    )
  }
  const decline = (cart: CartItem) => {
    patch(cart.id, { status: 'declined' })
    push({
      id: id(),
      kind: 'bot',
      text: 'No problem, nothing was paid. Want me to look again?',
      replies: ['Cheaper', ...examples.slice(0, 1)],
    })
  }

  const say = (text: string) => {
    const value = text.trim()
    if (!value || running !== null) return
    push({ id: id(), kind: 'me', text: value })
    if (awaiting && /^(yes|ya|iya|ok(e|ay)?|approve|setuju|bayar|lanjut|go)\b/i.test(value))
      return place(awaiting)
    if (awaiting && /^(no|tidak|nggak|gak|cancel|batal|decline|jangan|not now)\b/i.test(value))
      return decline(awaiting)
    const size = /(?:size|ukuran|uk\.?)\s*(\d{2})\b/i.exec(value)?.[1]
    const pay = /^(?:pay|bayar)\s*(?:with|pakai|pake|dengan|via)?\s*(.+)$/i.exec(value)?.[1]
    if (ctx?.plan?.choice && /cheaper|lebih murah|murahan|less expensive/i.test(value)) {
      push({ id: id(), kind: 'bot', text: `Looking for something under ${fmtIdr(ctx.plan.choice.price)}.` })
      return run({
        ...ctx,
        budget: Math.ceil(ctx.plan.choice.price / 1000) * 1000 - 1000,
        productId: null,
        categoryId: ctx.plan.choice.product.categoryId,
      })
    }
    if (ctx && size && value.length < 24) {
      const task = /(?:size|ukuran|uk\.?)\s*\d{2}/i.test(ctx.task)
        ? ctx.task.replace(/(?:size|ukuran|uk\.?)\s*\d{2}/i, `size ${size}`)
        : `${ctx.task}, size ${size}`
      return run({ ...ctx, task })
    }
    if (ctx && pay) {
      const type = catalog.paymentTypes.find(
        (t) => t.enabled && t.name.toLowerCase().includes(pay.trim().toLowerCase()),
      )
      if (type) {
        setSettings((s) => ({ ...s, paymentTypeId: type.id }))
        push({ id: id(), kind: 'bot', text: `Okay, I will pay with ${type.name}.` })
        return run(ctx, { paymentTypeId: type.id })
      }
    }
    run(fresh(value))
  }

  // Animate the active run, then answer with the pick and the cart.
  useEffect(() => {
    if (running === null) return
    const current = items.find((it) => it.id === running)
    if (current?.kind !== 'run') return
    if (current.shown < runSteps(current.plan)) {
      const timer = setTimeout(() => patch(running, { shown: current.shown + 1 }), STEP_MS)
      return () => clearTimeout(timer)
    }
    setRunning(null)
    const plan = current.plan
    if (plan.refusal) return push({ id: id(), kind: 'bot', text: plan.refusal })
    if (!plan.choice)
      return push({
        id: id(),
        kind: 'bot',
        text: awaiting
          ? 'Nothing in stock fits all of that, so the cart above is still my best offer.'
          : 'Nothing in stock fits all of that. Try a higher budget or a broader request.',
        replies: awaiting ? ['Yes, pay it'] : examples.slice(0, 2),
      })
    // The new cart retires the one still waiting for an answer, so only the newest can be paid.
    setItems((list) =>
      list.map((it) => (it.kind === 'cart' && it.status === 'awaiting' ? { ...it, status: 'replaced' } : it)),
    )
    push(
      { id: id(), kind: 'picks', plan },
      { id: id(), kind: 'cart', plan, status: plan.needsApproval ? 'awaiting' : 'auto' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- steps the active run on each tick
  }, [running, items])

  // A cart inside the mandate pays itself a moment after it shows.
  const autoCart = items.find((it): it is CartItem => it.kind === 'cart' && it.status === 'auto')
  useEffect(() => {
    if (!autoCart) return
    const timer = setTimeout(() => place(autoCart), 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per auto cart
  }, [autoCart?.id])

  const value: AgentChat = {
    items,
    settings,
    setSettings,
    limits,
    examples,
    policy,
    busy: running !== null,
    protocol,
    setProtocol,
    orders,
    say,
    approve: place,
    decline,
    choose: (productId) => ctx && run({ ...ctx, productId }),
  }
  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>
}

export function useAgentChat(): AgentChat {
  const chat = useContext(AgentChatContext)
  if (!chat) throw new Error('useAgentChat needs an AgentChatProvider')
  return chat
}

/** Builds the order through the normal order path, then marks it as placed by the agent. */
function placeAgentOrder(
  plan: AgentPlan,
  catalog: ShopValue['catalog'],
  customer: Customer,
  state: ReturnType<typeof useStore>['state'],
): Order | string {
  const best = plan.best!
  const negotiated = plan.negotiation.amount
  const totals = {
    ...best.totals,
    discount: best.totals.discount + negotiated,
    discounts: [
      ...best.totals.discounts,
      ...(negotiated
        ? [{ promotionId: 'agent-negotiation', label: 'Agent negotiation', amount: negotiated }]
        : []),
    ],
  }
  const { order } = buildOrder({
    catalog,
    totals,
    stock: state.stock,
    modifierStock: state.modifierStock,
    orderCodes: state.orders.map((o) => o.code),
    customerCodes: state.customers.map((c) => c.code),
    customer,
    contact: { name: customer.name, email: customer.email, phone: customer.phone },
    sellerId: null,
    city: customer.city,
    courier: plan.courier,
    payment: best.paymentType,
  })
  const blocker = orderPlaceBlocker(order, state.stock, state.modifierStock, state.modifiers, state.products)
  if (blocker) return blocker
  return {
    ...order,
    channel: 'agent',
    agent: {
      kind: 'chat_assistant',
      intent: String(plan.mandates.intent.payload.instruction ?? ''),
      intentMandateId: plan.mandates.intent.id,
      cartMandateId: plan.mandates.cart!.id,
      paymentMandateId: plan.mandates.payment!.id,
      approval: plan.needsApproval ? 'shopper' : 'auto',
      negotiated,
      compared: plan.candidates.length,
    },
    events: order.events.map((e) =>
      e.status === 'new' ? { ...e, note: 'Order placed by a buying agent under a cart mandate' } : e,
    ),
  }
}
