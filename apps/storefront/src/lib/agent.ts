import { fmtIdr, toMs } from '@rc/fixtures'
import type { AgentKind, AgentPolicy, Customer, PaymentType, Product, Variant } from '@rc/types'
import { AGENT_KIND_LABEL } from '@rc/types'
import { SYNONYMS, describeIntent, type Intent, recommend, understand } from './assistant'
import { type CartTotals, cartTotals } from './cart'
import { type Catalog, categoryIdsUnder, fromPrice, isBuyable, variantAvailable } from './catalog'
import { COURIERS, type CourierOption, DEFAULT_COURIER, courierFee } from './checkout'

// Agentic checkout, frontend only: a buying agent reads the shopper's mandate, works the real catalog,
// stock, promotions and the store's agent policy, and returns every step it took. Pure functions; the
// page animates the steps and places the order through the normal order path.

/** "chat assistants, browser agents and wallet agents" */
export function agentKindList(kinds: readonly AgentKind[]): string {
  const names = kinds.map((k) => `${AGENT_KIND_LABEL[k].toLowerCase()}s`)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? 'no agents')
}

export type ApprovalRule = 'always' | 'under_limit'

/** What the shopper hands the agent: the task and the limits it must stay inside. */
export interface MandateInput {
  task: string
  kind: AgentKind
  /** Hard ceiling for the order total; null takes the budget from the task, if it names one. */
  budget: number | null
  approval: ApprovalRule
  /** With `under_limit`, the agent may pay on its own up to this total. */
  autoLimit: number
  paymentTypeId: string | null
  /** A product the shopper chose from the agent's shortlist; it goes first. */
  productId?: string | null
  /** Keeps the search to one category, as when the shopper asks for a cheaper one of the same. */
  categoryId?: string | null
  /** The courier the shopper chose; the cheapest paid courier otherwise. */
  courierId?: string | null
  /** The code and payment type the shopper chose; the cheapest combination otherwise. */
  offer?: Offer | null
}

export interface Offer {
  code: string | null
  paymentTypeId: string
}

export interface ShippingChoice {
  courier: CourierOption
  fee: number
}

export interface Candidate {
  product: Product
  variant: Variant | null
  price: number
  reasons: string[]
  /** Why the agent passed on it; null for the pick and the runners-up it kept. */
  rejected: string | null
}

export interface PriceTrial {
  code: string | null
  paymentType: PaymentType
  totals: CartTotals
  payable: number
}

export interface AgentPlan {
  /** Set when the store turns the agent away; the run stops after the policy check. */
  refusal: string | null
  intent: Intent
  constraints: string[]
  wanted: Record<string, string>
  budget: number | null
  scanned: number
  candidates: Candidate[]
  choice: Candidate | null
  /** The shopper's chosen code and payment type, else the cheapest. */
  best: PriceTrial | null
  /** Every combination that prices the pick, cheapest first, one per code, discounts and price. */
  trials: PriceTrial[]
  /** Couriers that reach the shopper's city, with the fee this order pays. */
  shippingOptions: ShippingChoice[]
  negotiation: { allowed: boolean; askedPct: number; grantedPct: number; amount: number; note: string }
  courier: CourierOption
  shipping: number
  total: number
  overBudget: boolean
  needsApproval: boolean
  approvalReason: string
  mandates: { intent: Mandate; cart: Mandate | null; payment: Mandate | null }
}

export interface Mandate {
  id: string
  type: 'intent_mandate' | 'cart_mandate' | 'payment_mandate'
  payload: Record<string, unknown>
}

/** Agents open by asking for this much; the store answers within its own limit. */
const ASK_PCT = 10

/** Option values the shopper named, matched against the store's variant options ("size 42", "navy"). */
function wantedOptions(task: string, catalog: Catalog): Record<string, string> {
  const text = ` ${task.toLowerCase()} `
  const wanted: Record<string, string> = {}
  const sizeNum = /(?:size|ukuran|uk\.?|no\.?)\s*(\d{2})\b/i.exec(task)?.[1]
  for (const p of catalog.products)
    for (const o of p.options) {
      if (wanted[o.name]) continue
      if (/size|ukuran/i.test(o.name) && sizeNum && o.values.includes(sizeNum)) {
        wanted[o.name] = sizeNum
        continue
      }
      const hit = o.values.find((v) => v.length > 2 && text.includes(` ${v.toLowerCase()} `))
      if (hit && !/^\d+$/.test(hit)) wanted[o.name] = hit
    }
  return wanted
}

function pickVariant(catalog: Catalog, product: Product, wanted: Record<string, string>) {
  const fits = (v: Variant) =>
    Object.entries(wanted).every(([k, val]) => !(k in v.optionValues) || v.optionValues[k] === val)
  const inStock = (v: Variant) => {
    const n = variantAvailable(catalog, product, v.id)
    return n === null || n > 0
  }
  return product.variants.find((v) => fits(v) && inStock(v)) ?? null
}

const words = (p: Product) => `${p.name} ${p.tags.join(' ')} ${p.bestFor} ${p.description}`.toLowerCase()

/** One reason per thing the agent checked, so the shopper sees why it chose. */
function reasonsFor(catalog: Catalog, p: Product, v: Variant | null, intent: Intent, budget: number | null) {
  const out: string[] = []
  const price = v?.price ?? fromPrice(p)
  if (budget) out.push(`${fmtIdr(price)} of ${fmtIdr(budget)} budget`)
  for (const u of intent.useCases)
    if (u.terms.some((t) => words(p).includes(t))) out.push(`Fits ${u.label.toLowerCase()}`)
  if (p.reviewCount) out.push(`Rated ${p.rating.toFixed(1)} from ${p.reviewCount} reviews`)
  if (v && Object.keys(v.optionValues).length) {
    const n = variantAvailable(catalog, p, v.id)
    out.push(`${Object.values(v.optionValues).join(' / ')} ${n === null ? 'available' : `in stock (${n})`}`)
  }
  return out
}

const id = (prefix: string, seed: string) => {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return `${prefix}_${h.toString(16).padStart(8, '0')}`
}

const STOPWORDS = new Set(
  'the and for with under over best price this that from about around your mine some want need buy get find '
    .concat(
      'untuk dan yang dengan harga murah terbaik saya aku mau beli belikan cari carikan tolong sekitar maks maksimal bawah ',
    )
    .concat('juta ribu size ukuran month week sunday today line')
    .split(/\s+/),
)

/**
 * Words of the task worth matching: lower-case, no stopwords or numbers, plurals folded ("gels" to "gel"),
 * Indonesian words in the catalog's English ("kaos" to "tee").
 */
function taskWords(task: string): string[] {
  return [
    ...new Set(
      task
        .toLowerCase()
        .replace(/ka[ou]s kaki/g, 'sock')
        .split(/[^a-z0-9-]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d/.test(w))
        .flatMap((w) => SYNONYMS[w] ?? [w])
        .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)),
    ),
  ]
}

/**
 * The agent's shortlist: product names that carry the task's words come first, then tags, category,
 * best-for lines and use cases, with popularity breaking ties. Falls back to the assistant's ranking
 * when no product shares a word with the task.
 */
function rankForTask(task: string, intent: Intent, catalog: Catalog, pool: Product[]): Product[] {
  const wordsOfTask = taskWords(task)
  const text = (p: Product) => `${p.name} ${p.tags.join(' ')} ${p.bestFor} ${p.description}`.toLowerCase()
  // A word most of the store's products carry ("running" at a running store) says little about which one.
  // The product noun closes the first clause in English ("a light running tee" for…) and opens it in
  // Indonesian ("kaos lari" yang…).
  const clause =
    task.split(/\b(?:for|under|below|around|at|with|size|ukuran|untuk|yang|di|sekitar|max|maks)\b/i)[0] ?? ''
  const indonesian = clause
    .toLowerCase()
    .split(/[^a-z]+/)
    .find((w) => w.length > 2 && !STOPWORDS.has(w))
  const head = indonesian && SYNONYMS[indonesian] ? SYNONYMS[indonesian][0] : taskWords(clause).at(-1)
  const common = new Set(
    wordsOfTask.filter((w) => pool.filter((p) => text(p).includes(w)).length > pool.length / 4),
  )
  // When the product noun names the category ("running shoes"), a cap that only shares "running" stays out.
  const categoryName = intent.categoryId ? catalog.categoryMap.get(intent.categoryId)?.name.toLowerCase() : ''
  const inCategory =
    head && categoryName?.includes(head) ? categoryIdsUnder(catalog, intent.categoryId!) : null
  const scored = pool
    .filter((p) => !inCategory || inCategory.has(p.categoryId))
    .map((p) => {
      const name = p.name.toLowerCase()
      const rest = `${p.tags.join(' ')} ${p.bestFor} ${p.description}`.toLowerCase()
      const category = (catalog.categoryMap.get(p.categoryId)?.name ?? '').toLowerCase()
      let score = 0
      for (const w of wordsOfTask) {
        const weight = common.has(w) ? 1 : 3
        if (name.includes(w)) score += 2 * weight
        else if (category.includes(w)) score += weight
        else if (rest.includes(w)) score += weight / 1.5
      }
      if (head && name.includes(head)) score += 4
      for (const u of intent.useCases) if (u.terms.some((t) => `${name} ${rest}`.includes(t))) score += 2
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.views30d - a.p.views30d)
  if (!scored.length) return recommend({ ...intent, budgetMax: null }, catalog, null, 6).picks
  // Keep the close matches only, so a strong name match is not padded with loosely related products.
  const top = scored[0]!.score
  return scored
    .filter((x) => x.score >= top * 0.5)
    .slice(0, 6)
    .map((x) => x.p)
}

export function planAgentRun(
  input: MandateInput,
  catalog: Catalog,
  policy: AgentPolicy | null,
  customer: Customer,
  now: number,
): AgentPlan {
  const intent = understand(input.task, catalog)
  const budget = input.budget ?? intent.budgetMax
  const wanted = wantedOptions(input.task, catalog)
  const constraints = [
    // A budget given outside the task replaces the one the task names.
    ...describeIntent(input.budget ? { ...intent, budgetMax: null } : intent, catalog),
    ...Object.entries(wanted).map(([k, v]) => `${k} ${v}`),
    ...(input.budget ? [`Budget ${fmtIdr(input.budget)}`] : []),
  ]
  const intentMandate: Mandate = {
    id: id('im', `${customer.id}${input.task}${now}`),
    type: 'intent_mandate',
    payload: {
      shopper: customer.code,
      merchant: catalog.tenant.domain ?? catalog.tenant.subdomain,
      agent: AGENT_KIND_LABEL[input.kind],
      instruction: input.task,
      constraints: { budget_max: budget, options: wanted, quantity: 1 },
      approval: input.approval === 'always' ? 'every_order' : { auto_under: input.autoLimit },
      expires: new Date(now + 86_400_000).toISOString(),
    },
  }
  const empty = {
    intent,
    constraints,
    wanted,
    budget,
    scanned: 0,
    candidates: [],
    choice: null,
    best: null,
    trials: [],
    shippingOptions: [],
    negotiation: { allowed: false, askedPct: 0, grantedPct: 0, amount: 0, note: '' },
    courier: DEFAULT_COURIER,
    shipping: 0,
    total: 0,
    overBudget: false,
    needsApproval: false,
    approvalReason: '',
    mandates: { intent: intentMandate, cart: null, payment: null },
  }
  if (!policy?.enabled)
    return { ...empty, refusal: `${catalog.tenant.name} does not take orders from buying agents yet.` }
  if (!policy.kinds.includes(input.kind))
    return {
      ...empty,
      refusal: `${catalog.tenant.name} accepts ${agentKindList(policy.kinds)}, not ${AGENT_KIND_LABEL[input.kind].toLowerCase()}s.`,
    }

  // Search and shortlist: the store's own ranking, then the agent's checks.
  const pool = catalog.products.filter(
    (p) => isBuyable(catalog, p) && (!input.categoryId || p.categoryId === input.categoryId),
  )
  const scanned = pool.length
  const found = rankForTask(input.task, intent, catalog, pool)
  const preferred = input.productId ? pool.find((p) => p.id === input.productId) : undefined
  const ranked = preferred ? [preferred, ...found.filter((p) => p.id !== preferred.id)] : found
  const candidates: Candidate[] = []
  for (const p of ranked) {
    const v = pickVariant(catalog, p, wanted)
    const price = v?.price ?? fromPrice(p)
    let rejected: string | null = null
    if (!v) rejected = `No ${Object.values(wanted).join(' / ') || 'variant'} in stock`
    else if (budget && price > budget) rejected = `${fmtIdr(price - budget)} over budget`
    candidates.push({
      product: p,
      variant: v,
      price,
      reasons: reasonsFor(catalog, p, v, intent, budget),
      rejected,
    })
  }
  const choice = candidates.find((c) => !c.rejected) ?? null
  if (!choice)
    return {
      ...empty,
      refusal: null,
      scanned,
      candidates,
      approvalReason: 'Nothing in the store fits the mandate.',
    }

  // Price it every way the agent may pay: each open code with each allowed payment type.
  const allowed = catalog.paymentTypes.filter(
    (t) => t.enabled && (!policy.paymentTypeIds.length || policy.paymentTypeIds.includes(t.id)),
  )
  const payments = input.paymentTypeId ? allowed.filter((t) => t.id === input.paymentTypeId) : allowed
  const codes = [
    null,
    ...catalog.promotions
      .filter(
        (p) =>
          p.trigger === 'code' &&
          p.status === 'active' &&
          !p.segmentId &&
          !p.sellerId &&
          toMs(p.startAt) <= now &&
          toMs(p.endAt) >= now,
      )
      .map((p) => p.code),
  ]
  const line = {
    key: 'agent',
    productId: choice.product.id,
    variantId: choice.variant!.id,
    qty: 1,
    modifiers: [],
  }
  const priced: PriceTrial[] = []
  for (const paymentType of payments)
    for (const code of codes) {
      const totals = cartTotals(catalog, { lines: [line], voucher: code }, null, now, paymentType.id)
      if (code && !totals.appliedCode) continue
      priced.push({ code, paymentType, totals, payable: totals.subtotal - totals.discount })
    }
  // Payment types that price the same way collapse into the first, so each option differs from the rest.
  const seen = new Set<string>()
  const trials = priced
    .sort((a, b) => a.payable - b.payable)
    .filter((t) => {
      const key = `${t.code}|${t.totals.discounts.map((d) => d.label).join('+')}|${t.payable}`
      return !seen.has(key) && seen.add(key)
    })
  const best =
    trials.find((t) => t.code === input.offer?.code && t.paymentType.id === input.offer?.paymentTypeId) ??
    trials[0]
  if (!best) return { ...empty, refusal: 'No payment type the store allows for agents can take this order.' }

  const grantedPct = policy.negotiation ? Math.min(ASK_PCT, policy.maxAutoDiscountPct) : 0
  const negotiated = Math.round((best.payable * grantedPct) / 100 / 1000) * 1000
  const negotiation = {
    allowed: policy.negotiation,
    askedPct: ASK_PCT,
    grantedPct,
    amount: negotiated,
    note: policy.negotiation
      ? grantedPct
        ? `Asked for ${ASK_PCT}% off. The store agent granted ${grantedPct}%, its limit for agents.`
        : 'The store agent declined: its agent discount limit is 0%.'
      : `${catalog.tenant.name} does not negotiate with agents. List price stands.`,
  }
  const shippingOptions = COURIERS.filter((c) => !c.jakartaOnly || customer.city === 'Jakarta').map((c) => ({
    courier: c,
    fee: courierFee(c, best.totals.freeShipping),
  }))
  const courier = shippingOptions.find((o) => o.courier.id === input.courierId)?.courier ?? DEFAULT_COURIER
  const shipping = courierFee(courier, best.totals.freeShipping)
  const total = Math.max(0, best.payable - negotiated + shipping)
  const overBudget = !!budget && total > budget
  const reasons = [
    overBudget && `the total with shipping is ${fmtIdr(total - budget!)} over your budget`,
    input.approval === 'always' && 'you asked to approve every order',
    input.approval === 'under_limit' &&
      total > input.autoLimit &&
      `it is above your ${fmtIdr(input.autoLimit)} auto-pay limit`,
    total > policy.approvalAbove &&
      `${catalog.tenant.name} asks shoppers to confirm agent orders above ${fmtIdr(policy.approvalAbove)}`,
  ].filter(Boolean) as string[]

  const cartMandate: Mandate = {
    id: id('cm', `${intentMandate.id}${choice.variant!.id}${total}`),
    type: 'cart_mandate',
    payload: {
      intent_mandate: intentMandate.id,
      merchant: catalog.tenant.name,
      items: [
        {
          sku: choice.variant!.sku,
          name: choice.product.name,
          variant: choice.variant!.name,
          qty: 1,
          price: choice.price,
        },
      ],
      discounts: [
        ...best.totals.discounts.map((d) => ({ label: d.label, amount: d.amount })),
        ...(negotiated ? [{ label: 'Agent negotiation', amount: negotiated }] : []),
      ],
      shipping: { courier: courier.label, fee: shipping, city: customer.city },
      total,
      currency: 'IDR',
      merchant_signed: true,
    },
  }
  const paymentMandate: Mandate = {
    id: id('pm', `${cartMandate.id}${best.paymentType.id}`),
    type: 'payment_mandate',
    payload: {
      cart_mandate: cartMandate.id,
      method: best.paymentType.name,
      amount: total,
      currency: 'IDR',
      shopper_present: reasons.length > 0,
    },
  }
  return {
    refusal: null,
    intent,
    constraints,
    wanted,
    budget,
    scanned,
    candidates,
    choice,
    best,
    trials,
    shippingOptions: shippingOptions,
    negotiation,
    courier,
    shipping,
    total,
    overBudget,
    needsApproval: reasons.length > 0,
    approvalReason: reasons.length ? `The agent needs your go-ahead: ${reasons.join(', and ')}.` : '',
    mandates: { intent: intentMandate, cart: cartMandate, payment: paymentMandate },
  }
}

/** How many work steps a run shows: understand, check the store, then search. */
export const runSteps = (plan: AgentPlan) => (plan.refusal ? 2 : 3)
