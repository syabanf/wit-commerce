import { fmtIdr, nowMs, orderPlaceBlocker } from '@rc/fixtures'
import type { AgentPolicy, Customer, Industry, Order, Product } from '@rc/types'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { type AgentPlan, type MandateInput, type Offer, planAgentRun, runSteps } from '../lib/agent'
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

/** The questions the agent asks before it builds the cart, in this order. */
export type Step = 'product' | 'shipping' | 'offer'

export interface ChoiceOption {
  id: string
  title: string
  detail: string
  amount: string
  note?: string
  /** The option the agent would take on its own. */
  best?: boolean
  product?: Product
  offer?: Offer
}

export type ChoiceItem = {
  id: number
  kind: 'choice'
  step: Step
  question: string
  options: ChoiceOption[]
  picked: string | null
  /** A newer request replaced this question before the shopper answered. */
  closed?: boolean
}

export type Item =
  | { id: number; kind: 'me'; text: string }
  | { id: number; kind: 'bot'; text: string; replies?: string[] }
  | { id: number; kind: 'run'; plan: AgentPlan; shown: number; ask: Ask; settings: Settings }
  | ChoiceItem
  | CartItem
  | { id: number; kind: 'receipt'; order: Order; plan: AgentPlan }

export interface Settings {
  limit: number
  paymentTypeId: string | null
}

/** What the conversation has settled so far, so each answer or "cheaper", "size 43", "pay with OVO" builds on it. */
interface Context {
  task: string
  budget: number | null
  categoryId: string | null
  productId: string | null
  courierId: string | null
  offer: Offer | null
  plan: AgentPlan | null
}

type Ask = Omit<Context, 'plan'>
const fresh = (task: string): Ask => ({
  task,
  budget: null,
  categoryId: null,
  productId: null,
  courierId: null,
  offer: null,
})

const YES = /^(yes|ya|iya|ok(e|ay)?|approve|setuju|bayar|lanjut|go)\b/i
const NO = /^(no|tidak|nggak|gak|cancel|batal|decline|jangan|not now)\b/i
const YOU_PICK =
  /pick for me|you (choose|pick|decide)|terserah|bebas|kamu (pilih|aja)|rekomendasi|recommended/i

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
  pick: (item: ChoiceItem, optionId: string) => void
  approve: (cart: CartItem) => void
  decline: (cart: CartItem) => void
}

const AgentChatContext = createContext<AgentChat | null>(null)

/**
 * One buying-agent conversation per store visit, shared by the store assistant and `/:store/agent`, so a
 * chat started in the drawer carries on on the page. Runs keep stepping and paying while the shopper browses.
 * After the search the shopper picks the product, the courier and the discount; then the cart pays itself
 * inside the auto-pay limit or waits for approval.
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
  const asking = [...items]
    .reverse()
    .find((it): it is ChoiceItem => it.kind === 'choice' && !it.picked && !it.closed)

  const planFor = (c: Ask, s: Settings) => {
    const input: MandateInput = {
      ...c,
      kind: 'chat_assistant',
      approval: s.limit ? 'under_limit' : 'always',
      autoLimit: s.limit,
      paymentTypeId: s.paymentTypeId,
    }
    return planAgentRun(input, catalog, policy, customer!, nowMs())
  }

  /** Plans a run and starts its animation; settings changes not yet in state come in `override`. */
  const run = (c: Ask, override: Partial<Settings> = {}) => {
    if (!customer) return
    const s = { ...settings, ...override }
    const plan = planFor(c, s)
    const runId = id()
    // A new request closes the question still open, so an old answer cannot steer it.
    setItems((list) => [
      ...list.map((it) => (it.kind === 'choice' && !it.picked ? { ...it, closed: true } : it)),
      { id: runId, kind: 'run', plan, shown: 0, ask: c, settings: s },
    ])
    setRunning(runId)
  }

  /** Asks the next open question, or builds the cart once product, courier and discount are settled. */
  const advance = (ask: Ask, s: Settings = settings) => {
    let c = ask
    let plan = planFor(c, s)
    // A refinement ("size 43") can rule the chosen product out; then the shopper picks again.
    if (c.productId && plan.choice?.product.id !== c.productId) {
      c = { ...c, productId: null, offer: null }
      plan = planFor(c, s)
    }
    setCtx({ ...c, plan })
    const choice = plan.choice!
    if (!c.productId) {
      const fits = plan.candidates.filter((x) => !x.rejected).slice(0, 4)
      return push({
        id: id(),
        kind: 'choice',
        step: 'product',
        question:
          fits.length === 1
            ? 'One product fits. Shall I buy this one?'
            : `I found ${fits.length} that fit. Which one do you want?`,
        picked: null,
        options: fits.map((x) => ({
          id: x.product.id,
          title: x.product.name,
          detail: [x.variant?.name, x.reasons.find((r) => r.startsWith('Rated'))].filter(Boolean).join(' · '),
          amount: fmtIdr(x.price),
          best: x === choice,
          product: x.product,
        })),
      })
    }
    if (!c.courierId)
      return push({
        id: id(),
        kind: 'choice',
        step: 'shipping',
        question: `How should it ship to ${customer!.city}?`,
        picked: null,
        options: plan.shippingOptions.map((o) => ({
          id: o.courier.id,
          title: o.courier.label,
          detail: o.courier.eta,
          amount: o.fee ? fmtIdr(o.fee) : 'Free',
          best: o.courier.id === plan.courier.id,
        })),
      })
    if (!c.offer)
      return push({
        id: id(),
        kind: 'choice',
        step: 'offer',
        question:
          plan.trials.length > 1 && plan.trials[0]!.totals.discount
            ? 'Which discount should I use?'
            : 'No discount applies to this one. How should I pay?',
        picked: null,
        options: plan.trials.slice(0, 4).map((t, i) => {
          // Code labels read "RUNMONTH15 · Running Month 15% off": the code goes in the title, its name below.
          const [coded, automatic] = partition(t.totals.discounts, (d) => d.label.includes(' · '))
          return {
            id: `${t.paymentType.id}|${t.code ?? ''}`,
            title:
              [...coded.map((d) => d.label.split(' · ')[0]), ...automatic.map((d) => d.label)].join(' + ') ||
              'No discount',
            detail: [`Pay with ${t.paymentType.name}`, ...coded.map((d) => d.label.split(' · ')[1])].join(
              ' · ',
            ),
            amount: fmtIdr(t.payable),
            note: t.totals.discount ? `Saves ${fmtIdr(t.totals.discount)}` : undefined,
            best: i === 0,
            offer: { code: t.code, paymentTypeId: t.paymentType.id },
          }
        }),
      })
    // The new cart retires the one still waiting for an answer, so only the newest can be paid.
    setItems((list) =>
      list.map((it) => (it.kind === 'cart' && it.status === 'awaiting' ? { ...it, status: 'replaced' } : it)),
    )
    const { negotiation } = plan
    push(
      {
        id: id(),
        kind: 'bot',
        text: negotiation.amount
          ? `The store’s agent agreed to ${negotiation.grantedPct}% more off (${fmtIdr(negotiation.amount)}). Here is your cart.`
          : `${negotiation.note} Here is your cart.`,
      },
      { id: id(), kind: 'cart', plan, status: plan.needsApproval ? 'awaiting' : 'auto' },
    )
  }

  const pick = (item: ChoiceItem, optionId: string, echo = true) => {
    const option = item.options.find((o) => o.id === optionId)
    if (!ctx || !option || item.picked || item.closed || running !== null) return
    patch(item.id, { picked: optionId })
    if (echo) push({ id: id(), kind: 'me', text: option.title })
    advance(
      item.step === 'product'
        ? { ...ctx, productId: optionId, offer: null }
        : item.step === 'shipping'
          ? { ...ctx, courierId: optionId }
          : { ...ctx, offer: option.offer! },
    )
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
    if (awaiting && YES.test(value)) return place(awaiting)
    if (awaiting && NO.test(value)) return decline(awaiting)
    // An open question takes "2", "pick for me" or the option's name as the answer.
    if (asking) {
      const lower = value.toLowerCase()
      const answer =
        (/^\d$/.test(value) ? asking.options[Number(value) - 1] : undefined) ??
        (YOU_PICK.test(value) ? (asking.options.find((o) => o.best) ?? asking.options[0]) : undefined) ??
        asking.options.find(
          (o) => o.title.toLowerCase().includes(lower) || lower.includes(o.title.toLowerCase()),
        )
      if (answer) return pick(asking, answer.id, false)
    }
    const size = /(?:size|ukuran|uk\.?)\s*(\d{2})\b/i.exec(value)?.[1]
    const pay = /^(?:pay|bayar)\s*(?:with|pakai|pake|dengan|via)?\s*(.+)$/i.exec(value)?.[1]
    if (ctx?.plan?.choice && /cheaper|lebih murah|murahan|less expensive/i.test(value)) {
      push({ id: id(), kind: 'bot', text: `Looking for something under ${fmtIdr(ctx.plan.choice.price)}.` })
      return run({
        ...ctx,
        budget: Math.ceil(ctx.plan.choice.price / 1000) * 1000 - 1000,
        categoryId: ctx.plan.choice.product.categoryId,
        productId: null,
        offer: null,
      })
    }
    if (ctx && size && value.length < 24) {
      const task = /(?:size|ukuran|uk\.?)\s*\d{2}/i.test(ctx.task)
        ? ctx.task.replace(/(?:size|ukuran|uk\.?)\s*\d{2}/i, `size ${size}`)
        : `${ctx.task}, size ${size}`
      return run({ ...ctx, task, offer: null })
    }
    if (ctx && pay) {
      const type = catalog.paymentTypes.find(
        (t) => t.enabled && t.name.toLowerCase().includes(pay.trim().toLowerCase()),
      )
      if (type) {
        setSettings((s) => ({ ...s, paymentTypeId: type.id }))
        push({ id: id(), kind: 'bot', text: `Okay, I will pay with ${type.name}.` })
        return run({ ...ctx, offer: null }, { paymentTypeId: type.id })
      }
    }
    run(fresh(value))
  }

  // Animate the active run, then ask the first open question.
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
    advance(current.ask, current.settings)
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
    pick,
    approve: place,
    decline,
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

const partition = <T,>(list: T[], test: (x: T) => boolean): [T[], T[]] => [
  list.filter(test),
  list.filter((x) => !test(x)),
]
