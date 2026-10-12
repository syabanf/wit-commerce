import { fmtIdr, nowMs, orderPlaceBlocker } from '@rc/fixtures'
import type { AgentPolicy, Customer, Industry, Order, Product } from '@rc/types'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  type AgentPlan,
  type MandateInput,
  type Offer,
  fittingVariants,
  planAgentRun,
  runSteps,
} from '../lib/agent'
import { variantAvailable } from '../lib/catalog'
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

/** Milliseconds between the agent's work steps, slow enough to follow on a demo screen. */
const STEP_MS = 750

export type CartStatus = 'awaiting' | 'paid' | 'declined' | 'replaced' | 'failed'
export type CartItem = { id: number; kind: 'cart'; plan: AgentPlan; status: CartStatus; note?: string }

/** The questions the agent asks before it builds the cart, in this order. */
export type Step = 'product' | 'variant' | 'shipping' | 'offer'

export interface ChoiceOption {
  id: string
  title: string
  detail: string
  amount: string
  note?: string
  /** The option the agent suggests. */
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
  paymentTypeId: string | null
}

/** What the conversation has settled so far, so each answer or "cheaper", "size 43", "pay with OVO" builds on it. */
interface Context {
  task: string
  budget: number | null
  categoryId: string | null
  productId: string | null
  variantId: string | null
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
  variantId: null,
  courierId: null,
  offer: null,
})

const YES = /^(yes|ya|iya|ok(e|ay)?|approve|setuju|bayar|lanjut|go)\b/i
const NO = /^(no|tidak|nggak|gak|cancel|batal|decline|jangan|not now)\b/i
const YOU_PICK =
  /pick for me|you (choose|pick|decide)|terserah|bebas|kamu (pilih|aja)|rekomendasi|recommended/i
/** Follow-ups on a cart that reopen one question and keep the rest. */
const CHANGES: [RegExp, Partial<Ask>][] = [
  [/change (shipping|courier)|ganti (kurir|pengiriman|ongkir)/i, { courierId: null }],
  [/change (discount|payment)|ganti (diskon|promo|pembayaran)/i, { offer: null }],
  [
    /another (size|colou?r|variant)|change (size|colou?r)|ganti (ukuran|warna)/i,
    { variantId: null, offer: null },
  ],
  [
    /another product|change product|ganti produk|produk lain/i,
    { productId: null, variantId: null, offer: null },
  ],
]

/** "Rated 4.3…" reads as "rated 4.3…" inside a sentence; amounts keep their capital. */
const lower = (t: string) => (/^Rp/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1))

export interface AgentChat {
  items: Item[]
  settings: Settings
  setSettings: (s: Settings) => void
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
 * chat started in the drawer carries on on the page. The agent never pays on its own: after the search it
 * suggests and asks for the product, its variant, the courier and the discount, then shows the cart and
 * pays only when the shopper approves.
 */
export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { catalog, tenant, customer, send } = useShop()
  const { state } = useStore()
  const policy = state.agentPolicies.find((p) => p.tenantId === tenant.id) ?? null
  const examples = EXAMPLES[tenant.industry]
  const [settings, setSettings] = useState<Settings>({ paymentTypeId: null })
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
    const input: MandateInput = { ...c, kind: 'chat_assistant', paymentTypeId: s.paymentTypeId }
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

  const question = (step: Step, text: string, options: ChoiceOption[]): ChoiceItem => ({
    id: id(),
    kind: 'choice',
    step,
    question: text,
    options,
    picked: null,
  })

  /** Asks the next open question with the agent's suggestion, or shows the cart once all are settled. */
  const advance = (ask: Ask, s: Settings = settings) => {
    let c = ask
    let plan = planFor(c, s)
    // A refinement ("size 43") can rule the chosen product out; then the shopper picks again.
    if (c.productId && plan.choice?.product.id !== c.productId) {
      c = { ...c, productId: null, variantId: null, offer: null }
      plan = planFor(c, s)
    }
    const choice = plan.choice!
    if (!c.productId) {
      setCtx({ ...c, plan })
      const fits = plan.candidates.filter((x) => !x.rejected).slice(0, 4)
      const why = choice.reasons
        .filter((r) => !/ in stock| available$/.test(r))
        .slice(0, 3)
        .map(lower)
        .join(', ')
      return push(
        question(
          'product',
          fits.length === 1
            ? `One product fits: ${choice.product.name}${why ? `, ${why}` : ''}. Want this one?`
            : `I found ${fits.length} that fit. I suggest ${choice.product.name}${why ? `: ${why}` : ''}. Which one do you want?`,
          fits.map((x) => ({
            id: x.product.id,
            title: x.product.name,
            detail: [
              x.product.options.length ? null : x.variant?.name,
              x.reasons.find((r) => r.startsWith('Rated')),
            ]
              .filter(Boolean)
              .join(' · '),
            amount: fmtIdr(x.price),
            best: x === choice,
            product: x.product,
          })),
        ),
      )
    }
    if (!c.variantId) {
      const fitting = fittingVariants(catalog, choice.product, plan.wanted)
      const inBudget = fitting.filter((v) => !plan.budget || v.price <= plan.budget)
      const variants = inBudget.length ? inBudget : fitting
      if (variants.length > 1) {
        setCtx({ ...c, plan })
        const stock = (v: (typeof variants)[number]) => variantAvailable(catalog, choice.product, v.id)
        const most = variants.reduce((a, b) => ((stock(b) ?? 0) > (stock(a) ?? 0) ? b : a))
        const names = choice.product.options.map((o) => o.name.toLowerCase()).join(' and ')
        return push(
          question(
            'variant',
            `Which ${names || 'option'}? I suggest ${most.name}: it has the most in stock.`,
            variants.slice(0, 8).map((v) => ({
              id: v.id,
              title: v.name,
              detail: stock(v) === null ? 'Available' : `${stock(v)} in stock`,
              amount: fmtIdr(v.price),
              best: v === most,
            })),
          ),
        )
      }
      // One variant fits, so there is nothing to ask.
      c = { ...c, variantId: variants[0]?.id ?? null }
      plan = planFor(c, s)
    }
    setCtx({ ...c, plan })
    if (!c.courierId) {
      const pick = plan.shippingOptions.find((o) => o.courier.id === plan.courier.id)!
      return push(
        question(
          'shipping',
          `How should it ship to ${customer!.city}? I suggest ${pick.courier.label}: ${pick.fee ? fmtIdr(pick.fee) : 'free for this order'}, ${pick.courier.eta.toLowerCase()}.`,
          plan.shippingOptions.map((o) => ({
            id: o.courier.id,
            title: o.courier.label,
            detail: o.courier.eta,
            amount: o.fee ? fmtIdr(o.fee) : 'Free',
            best: o === pick,
          })),
        ),
      )
    }
    if (!c.offer) {
      const options = plan.trials.slice(0, 4).map((t, i) => {
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
      })
      const top = plan.trials[0]!
      return push(
        question(
          'offer',
          top.totals.discount
            ? `Which discount should I use? I suggest ${options[0]!.title}: it saves ${fmtIdr(top.totals.discount)}.`
            : `No discount applies to this one. How should I pay? I suggest ${top.paymentType.name}.`,
          options,
        ),
      )
    }
    // The new cart retires the one still waiting for an answer, so only the newest can be paid.
    setItems((list) =>
      list.map((it) => (it.kind === 'cart' && it.status === 'awaiting' ? { ...it, status: 'replaced' } : it)),
    )
    const { negotiation } = plan
    push(
      {
        id: id(),
        kind: 'bot',
        text: `${
          negotiation.amount
            ? `The store’s agent agreed to ${negotiation.grantedPct}% more off (${fmtIdr(negotiation.amount)}).`
            : negotiation.note
        } Check the cart below. I pay only when you approve.`,
        replies: ['Change shipping', 'Change discount', 'Another product'],
      },
      { id: id(), kind: 'cart', plan, status: 'awaiting' },
    )
  }

  const pick = (item: ChoiceItem, optionId: string, echo = true) => {
    const option = item.options.find((o) => o.id === optionId)
    if (!ctx || !option || item.picked || item.closed || running !== null) return
    patch(item.id, { picked: optionId })
    if (echo) push({ id: id(), kind: 'me', text: option.title })
    const answer: Record<Step, Partial<Ask>> = {
      product: { productId: optionId, variantId: null, offer: null },
      variant: { variantId: optionId, offer: null },
      shipping: { courierId: optionId },
      offer: { offer: option.offer! },
    }
    advance({ ...ctx, ...answer[item.step] })
  }

  const place = (cart: CartItem) => {
    if (!customer || cart.status !== 'awaiting') return
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
        text: 'Done. Anything else I can find for you?',
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
    const change = ctx?.plan?.choice && CHANGES.find(([re]) => re.test(value))?.[1]
    if (ctx && change) return advance({ ...ctx, ...change })
    // An open question takes "2", "pick for me" or the option's name as the answer.
    if (asking) {
      const typed = value.toLowerCase()
      const answer =
        (/^\d$/.test(value) ? asking.options[Number(value) - 1] : undefined) ??
        (YOU_PICK.test(value) ? (asking.options.find((o) => o.best) ?? asking.options[0]) : undefined) ??
        asking.options.find(
          (o) => o.title.toLowerCase().includes(typed) || typed.includes(o.title.toLowerCase()),
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
        variantId: null,
        offer: null,
      })
    }
    if (ctx && size && value.length < 24) {
      const task = /(?:size|ukuran|uk\.?)\s*\d{2}/i.test(ctx.task)
        ? ctx.task.replace(/(?:size|ukuran|uk\.?)\s*\d{2}/i, `size ${size}`)
        : `${ctx.task}, size ${size}`
      return run({ ...ctx, task, variantId: null, offer: null })
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

  // Animate the active run, then ask the first question.
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

  const value: AgentChat = {
    items,
    settings,
    setSettings,
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
