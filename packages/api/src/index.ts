import type { AppAction, AppState, CustomerSummary, DomainStatus } from '@rc/fixtures'
import type {
  Customer,
  CustomerMetricsRow,
  Order,
  OrderReturn,
  ProductMonth,
  ReturnStatus,
  SalesMonth,
  Seller,
  Tenant,
  User,
  CustomerEvent,
  Industry,
} from '@rc/types'
import type { Lead, PrivacyRequest, PrivacyRequestKind, Ticket } from '@rc/types'

// The HTTP client for apps/api. Every reducer action maps to one request (actionRequest), every
// answer is a Delta the app lays over its AppState (applyDelta), and the event stream delivers the
// deltas other clients produced.

export type Collection = keyof AppState

/** Rows an action wrote and ids it removed, per collection. */
export interface Delta {
  upserts: Partial<Record<Collection, unknown[]>>
  removes: Partial<Record<Collection, string[]>>
  /** The server clock when the delta was made. */
  now?: string
  /** A customer token, handed out when a guest checkout created the account. */
  token?: string
  /** Placing an order a provider collects online: the page the shopper pays on. */
  payment?: PaymentLink
  /** Placing that order worked, but the payment page did not open. */
  paymentError?: string
  /** A domain check: how each DNS record did. */
  domainStatus?: DomainStatus
}

/** Where a shopper pays for an order online. */
export interface PaymentLink {
  provider: string
  status: string
  snapToken: string
  redirectUrl: string
}

/** An order's online payment as the provider last reported it. */
export interface OrderPayment {
  orderId: string
  tenantId: string
  provider: string
  transactionId: string | null
  /** The provider's status, for example pending, settlement or expire. */
  status: string
  grossAmount: number
  notifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiProblem {
  status: number
  code: string
  detail: string
}

/** Thrown for every non-2xx answer, with the server's problem document. */
export class ApiError extends Error {
  status: number
  code: string
  constructor(problem: ApiProblem) {
    super(problem.detail)
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code
  }
}

export interface ActionRequest {
  method: 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
}

/** The request behind an action, as the API spells it. Storefront actions take the store subdomain. */
export function actionRequest(action: AppAction, store?: string): ActionRequest {
  switch (action.type) {
    case 'tenants/create':
      return { method: 'POST', path: '/tenants', body: action.tenant }
    case 'tenants/setup':
      return { method: 'POST', path: '/tenants/setup', body: action.setup }
    case 'tenants/completeStep':
      return { method: 'POST', path: `/tenants/${action.tenantId}/onboarding/${action.step}` }
    case 'tenants/setDisplayCurrencies':
      return {
        method: 'PUT',
        path: `/tenants/${action.tenantId}/display-currencies`,
        body: { currencies: action.currencies },
      }
    case 'tenants/setShopSettings':
      return {
        method: 'PUT',
        path: `/tenants/${action.tenantId}/shop-settings`,
        body: {
          returnWindowDays: action.returnWindowDays,
          shopperEmailsOff: action.shopperEmailsOff,
          ...(action.storeLanguage && { storeLanguage: action.storeLanguage }),
        },
      }
    case 'tenants/setLegal':
      return { method: 'PUT', path: `/tenants/${action.tenantId}/legal`, body: action.legal }
    case 'tenants/setCourierEta':
      return {
        method: 'PUT',
        path: `/tenants/${action.tenantId}/courier-eta`,
        body: { courierEtaDays: action.courierEtaDays },
      }
    case 'tenants/setDomain':
      // The server issues its own token, so the client's never leaves the browser.
      return { method: 'PUT', path: `/tenants/${action.tenantId}/domain`, body: { domain: action.domain } }
    case 'tenants/verifyDomain':
      return { method: 'POST', path: `/tenants/${action.tenantId}/domain/verify` }
    case 'brand/update':
      return { method: 'PUT', path: `/tenants/${action.tenantId}/brand`, body: action.brand }
    case 'brand/toggleLock':
      return { method: 'POST', path: `/tenants/${action.tenantId}/brand/locks/${action.key}/toggle` }
    case 'agentPolicy/save':
      return { method: 'PUT', path: `/tenants/${action.policy.tenantId}/agent-policy`, body: action.policy }
    case 'products/save':
      return { method: 'PUT', path: `/products/${action.product.id}`, body: action.product }
    case 'products/setAttributes':
      return {
        method: 'PUT',
        path: `/products/${action.id}/attributes`,
        body: { attributes: action.attributes },
      }
    case 'products/setStatus':
      return { method: 'POST', path: `/products/${action.id}/status`, body: { status: action.status } }
    case 'categories/save':
      return { method: 'PUT', path: `/categories/${action.category.id}`, body: action.category }
    case 'categories/remove':
      return { method: 'DELETE', path: `/categories/${action.id}` }
    case 'attributes/save':
      return { method: 'PUT', path: `/attributes/${action.attribute.id}`, body: action.attribute }
    case 'attributes/remove':
      return { method: 'DELETE', path: `/attributes/${action.id}` }
    case 'modifiers/save':
      return { method: 'PUT', path: `/modifiers/${action.group.id}`, body: action.group }
    case 'modifiers/remove':
      return { method: 'DELETE', path: `/modifiers/${action.id}` }
    case 'collections/save':
      return { method: 'PUT', path: `/collections/${action.collection.id}`, body: action.collection }
    case 'collections/remove':
      return { method: 'DELETE', path: `/collections/${action.id}` }
    case 'paymentTypes/save':
      return { method: 'PUT', path: `/payment-types/${action.paymentType.id}`, body: action.paymentType }
    case 'paymentTypes/toggle':
      return { method: 'POST', path: `/payment-types/${action.id}/toggle` }
    case 'stock/adjust':
      return {
        method: 'POST',
        path: `/stock/${action.levelId}/adjust`,
        body: { delta: action.delta, note: action.note },
      }
    case 'modifierStock/adjust':
      return {
        method: 'POST',
        path: `/modifier-stock/${action.levelId}/adjust`,
        body: { delta: action.delta, note: action.note },
      }
    case 'stock/receive': {
      const { type: _type, ...body } = action
      return { method: 'POST', path: '/stock/receive', body }
    }
    case 'modifierStock/receive': {
      const { type: _type, ...body } = action
      return { method: 'POST', path: '/modifier-stock/receive', body }
    }
    case 'orders/place':
      return {
        method: 'POST',
        path: store ? `/shop/${store}/orders` : '/orders',
        body: { order: action.order, customer: action.customer },
      }
    case 'orders/advance':
      return {
        method: 'POST',
        path: `/orders/${action.id}/advance`,
        body: { trackingNo: action.trackingNo ?? null },
      }
    case 'orders/cancel':
      return {
        method: 'POST',
        path: `/orders/${action.id}/cancel`,
        body: { reason: action.reason, note: action.note },
      }
    case 'orders/refund':
      return {
        method: 'POST',
        path: `/orders/${action.id}/refund`,
        body: { amount: action.amount, note: action.note },
      }
    case 'orders/note':
      return { method: 'POST', path: `/orders/${action.id}/notes`, body: { note: action.note } }
    case 'returns/request': {
      // A shopper asks through their store; the server knows who is asking from the route.
      const { type: _type, who: _who, ...body } = action
      return { method: 'POST', path: store ? `/shop/${store}/returns` : '/returns', body }
    }
    case 'returns/approve':
      return { method: 'POST', path: `/returns/${action.id}/approve`, body: { note: action.note } }
    case 'returns/reject':
      return { method: 'POST', path: `/returns/${action.id}/reject`, body: { reason: action.reason } }
    case 'returns/cancel':
      return {
        method: 'POST',
        path: store ? `/shop/${store}/returns/${action.id}/cancel` : `/returns/${action.id}/cancel`,
        body: { note: action.note },
      }
    case 'returns/receive':
      return { method: 'POST', path: `/returns/${action.id}/receive`, body: { restock: action.restock } }
    case 'returns/refund': {
      // The API picks the gateway when Midtrans took the payment; method only labels a manual refund.
      const { type: _type, id: _id, ...body } = action
      return { method: 'POST', path: `/returns/${action.id}/refund`, body }
    }
    case 'customers/save':
      return { method: 'PUT', path: `/customers/${action.customer.id}`, body: action.customer }
    case 'customers/note':
      return { method: 'POST', path: `/customers/${action.id}/notes`, body: { note: action.note } }
    case 'customers/addPoints':
      return {
        method: 'POST',
        path: `/customers/${action.id}/points`,
        body: { points: action.points, reason: action.reason },
      }
    case 'customers/setConsent':
      return store
        ? {
            method: 'POST',
            path: `/shop/${store}/consent`,
            body: { granted: action.granted, source: action.source, textVersion: action.textVersion },
          }
        : {
            method: 'POST',
            path: `/customers/${action.id}/consent`,
            body: { granted: action.granted, textVersion: action.textVersion },
          }
    case 'customers/erase':
      return { method: 'POST', path: `/customers/${action.id}/erase`, body: { note: action.note } }
    case 'segments/save':
      return { method: 'PUT', path: `/segments/${action.segment.id}`, body: action.segment }
    case 'segments/remove':
      return { method: 'DELETE', path: `/segments/${action.id}` }
    case 'leads/save':
      return store
        ? { method: 'POST', path: `/shop/${store}/leads`, body: action.lead }
        : { method: 'PUT', path: `/leads/${action.lead.id}`, body: action.lead }
    case 'leads/move':
      return {
        method: 'POST',
        path: `/leads/${action.id}/stage`,
        body: { stage: action.stage, lostReason: action.lostReason ?? null },
      }
    case 'tickets/open': {
      // A shopper complains through their store; the server knows who is asking from the token.
      const { customerId: _customerId, tenantId: _tenantId, ...body } = action.complaint
      return store
        ? { method: 'POST', path: `/shop/${store}/complaints`, body }
        : { method: 'POST', path: '/tickets', body: action.complaint }
    }
    case 'tickets/assign':
      return { method: 'POST', path: `/tickets/${action.id}/assign`, body: { assigneeId: action.assigneeId } }
    case 'tickets/resolve':
      return { method: 'POST', path: `/tickets/${action.id}/resolve` }
    case 'campaigns/save':
      return { method: 'PUT', path: `/campaigns/${action.campaign.id}`, body: action.campaign }
    case 'campaigns/launch':
      return { method: 'POST', path: `/campaigns/${action.id}/launch` }
    case 'campaigns/pause':
      return { method: 'POST', path: `/campaigns/${action.id}/pause` }
    case 'automations/save':
      return { method: 'PUT', path: `/automations/${action.automation.id}`, body: action.automation }
    case 'automations/setStatus':
      return { method: 'POST', path: `/automations/${action.id}/status`, body: { status: action.status } }
    case 'promotions/save':
      return { method: 'PUT', path: `/promotions/${action.promotion.id}`, body: action.promotion }
    case 'promotions/setStatus':
      return { method: 'POST', path: `/promotions/${action.id}/status`, body: { status: action.status } }
    case 'pages/create':
      return { method: 'POST', path: '/pages', body: action.page }
    case 'pages/save':
      return {
        method: 'PUT',
        path: `/pages/${action.id}`,
        body: { sections: action.sections, seo: action.seo ?? null, note: action.note },
      }
    case 'pages/setTemplate':
      return { method: 'POST', path: `/pages/${action.id}/template`, body: { templateId: action.templateId } }
    case 'pages/publish':
      return { method: 'POST', path: `/pages/${action.id}/publish` }
    case 'pages/schedule':
      return { method: 'POST', path: `/pages/${action.id}/schedule`, body: { at: action.at } }
    case 'pages/unpublish':
      return { method: 'POST', path: `/pages/${action.id}/unpublish` }
    case 'pages/rollback':
      return { method: 'POST', path: `/pages/${action.id}/rollback`, body: { revisionId: action.revisionId } }
    case 'pages/discardDraft':
      return { method: 'POST', path: `/pages/${action.id}/discard-draft` }
    case 'sellers/save':
      return { method: 'PUT', path: `/sellers/${action.seller.id}`, body: action.seller }
    case 'sellers/setTemplate':
      return {
        method: 'POST',
        path: `/sellers/${action.id}/template`,
        body: { templateId: action.templateId },
      }
    case 'sellers/setStatus':
      return { method: 'POST', path: `/sellers/${action.id}/status`, body: { status: action.status } }
    case 'sellers/updateProfile':
      return {
        method: 'PUT',
        path: `/sellers/${action.id}/profile`,
        body: { headline: action.headline, bio: action.bio, photoUrl: action.photoUrl },
      }
    case 'menus/save':
      return { method: 'PUT', path: `/tenants/${action.tenantId}/menus`, body: action.menus }
    case 'integrations/toggle':
      return { method: 'POST', path: `/integrations/${action.id}/toggle` }
    case 'integrations/sync':
      return { method: 'POST', path: `/integrations/${action.id}/sync` }
    case 'system/tick':
      return { method: 'POST', path: '/system/tick' }
  }
}

/** Collections the apps show newest first; new rows go to the front. */
const NEWEST_FIRST = new Set<Collection>([
  'stockMoves',
  'modifierStockMoves',
  'customerEvents',
  'integrationLogs',
])

const idOf = (collection: Collection, row: unknown) =>
  collection === 'agentPolicies' ? (row as { tenantId: string }).tenantId : (row as { id: string }).id

/** Lays a delta over the state: rows replace their id, new rows join the list, removed ids leave. */
export function applyDelta(state: AppState, delta: Delta): AppState {
  let next = state
  const change = (collection: Collection, rows: unknown[]) => {
    if (next === state) next = { ...state }
    ;(next as unknown as Record<string, unknown[]>)[collection] = rows
  }
  for (const key of Object.keys(delta.upserts ?? {}) as Collection[]) {
    const rows = delta.upserts[key]
    if (!rows?.length) continue
    const incoming = new Map(rows.map((r) => [idOf(key, r), r]))
    const current = next[key] as unknown[]
    const replaced = current.map((r) => incoming.get(idOf(key, r)) ?? r)
    const seen = new Set(current.map((r) => idOf(key, r)))
    const added = rows.filter((r) => !seen.has(idOf(key, r)))
    change(key, NEWEST_FIRST.has(key) ? [...added, ...replaced] : [...replaced, ...added])
  }
  for (const key of Object.keys(delta.removes ?? {}) as Collection[]) {
    const ids = new Set(delta.removes[key] ?? [])
    if (!ids.size) continue
    change(
      key,
      (next[key] as unknown[]).filter((r) => !ids.has(idOf(key, r))),
    )
  }
  return next
}

/** An AppState with nothing in it, for before the first load. */
export const emptyState = (): AppState => ({
  tenants: [],
  users: [],
  sellers: [],
  templates: [],
  pages: [],
  pageDrafts: [],
  categories: [],
  attributes: [],
  modifiers: [],
  collections: [],
  products: [],
  warehouses: [],
  stock: [],
  stockMoves: [],
  modifierStock: [],
  modifierStockMoves: [],
  customers: [],
  customerEvents: [],
  customerMetrics: [],
  salesDays: [],
  productDays: [],
  sellerBuyers: [],
  orders: [],
  returns: [],
  segments: [],
  leads: [],
  tickets: [],
  campaigns: [],
  automations: [],
  promotions: [],
  paymentTypes: [],
  agentPolicies: [],
  integrations: [],
  integrationLogs: [],
  traffic: [],
  searchTerms: [],
})

/** Merges collections the server sent whole over the state. */
export function mergeState(state: AppState, loaded: Partial<AppState>): AppState {
  return { ...state, ...loaded }
}

export interface ApiOptions {
  /** Where /api/v1 lives: "/api" in production, "http://localhost:8080/api" in development. */
  baseUrl: string
  /** The bearer token for this request, if the viewer is signed in. */
  getToken: () => string | null
}

export interface LoginResponse {
  token: string
  expiresAt: string
  user: User
  /** The user's active seller profiles, for the seller app. */
  sellers: Seller[]
}

export interface DemoAccounts {
  users: User[]
  tenants: Tenant[]
  sellers: Seller[]
}

export interface SignUpInput {
  storeName: string
  subdomain: string
  industry: Industry
  templateId: string
  ownerName: string
  email: string
  password: string
  /** Stays empty: a field people never see, so only a bot fills it. */
  website: string
  /** The Cloudflare Turnstile token, sent only while the platform has Turnstile on. */
  captchaToken?: string
}

export interface SubdomainCheck {
  available: boolean
  reason?: string
  /** Free addresses close to the one asked for, when it is not available. */
  suggestions: string[]
}

export interface StateResponse {
  state: Partial<AppState>
  now: string
  /** A store's state: the payment types a provider collects online. */
  onlinePayments?: string[]
  /** A store's state: rates for the store's display currencies, units per 1 IDR. */
  currencyRates?: ShopRate[]
}

export interface StaffInput {
  name: string
  title: string
  role: User['role']
  tenantIds: string[]
}

/** How a staff member gets in: a link by email, or with email off a password shown this one time. */
export interface IssuedStaff {
  user: User
  temporaryPassword?: string
  emailSent: boolean
}

export interface CustomerEventsQuery {
  tenantId: string
  customerId?: string
  kind?: CustomerEvent['kind']
  excludeKind?: CustomerEvent['kind']
  /** RFC 3339; only events at or after it. */
  since?: string
  limit?: number
}

export interface OrderRowsQuery {
  tenantId: string
  view?: string
  status?: string | null
  paymentStatus?: string | null
  paymentMethod?: string | null
  customerId?: string
  sellerId?: string
  campaignId?: string
  /** open, delivered or closed, as a record's order card groups them. */
  stage?: string | null
  /** Only orders a buying agent placed. */
  agent?: boolean
  /** Comma-separated order ids, at most 500. */
  ids?: string
  /** RFC 3339; only orders placed at or after it. */
  since?: string
  q?: string
  sort?: string
  desc?: boolean
  page?: number
  /** At most 500. */
  pageSize?: number
}

/** One order as the list shows it, from the read side. */
export interface OrderRow {
  id: string
  code: string
  customerId: string
  customerName: string
  customerCode: string
  status: Order['status']
  paymentStatus: Order['paymentStatus']
  channel: Order['channel']
  sellerId: string | null
  campaignId: string | null
  createdAt: string
  total: number
  subtotal: number
  itemCount: number
  agent: boolean
  refundedAmount: number
  paymentMethod: Order['paymentMethod']
  paymentTypeId: string | null
  /** When the order shipped, or null. */
  shippedAt: string | null
  agentInfo: Order['agent'] | null
}

export interface OrderRowsPage {
  rows: OrderRow[]
  total: number
  /** Per status within the view; search and the other filters do not narrow them. */
  statusCounts: Partial<Record<Order['status'], number>>
  /** Per payment status, with every filter but the payment status applied. */
  paymentStatusCounts: Partial<Record<Order['paymentStatus'], number>>
  /** Per stage (open, delivered, closed), with every filter but the stage applied. */
  stageCounts: Partial<Record<'open' | 'delivered' | 'closed', number>>
  /** The brand's queues, whatever the filters. */
  stats: {
    toFulfil: number
    late: number
    unpaid: number
    inTransit: number
    returns: number
    shippedLast24h: number
  }
  /** The brand's payments, whatever the filters. */
  payments: {
    paid: number
    pending: number
    failed: number
    refunded: number
    collected: number
    refundedAmount: number
    pendingAmount: number
  }
  /** An order to fulfil placed before this is late, on the store's clock. */
  lateBefore: string
}

export interface ReturnRowsQuery {
  tenantId: string
  /** A status, or "open" for requested, approved and received together. */
  status?: ReturnStatus | 'open' | null
  orderId?: string
  customerId?: string
  /** Matches the return code or its order's code. */
  q?: string
  page?: number
  /** At most 200. */
  pageSize?: number
}

export interface ReturnRowsPage {
  rows: OrderReturn[]
  total: number
  /** Per status with every filter but the status applied. */
  statusCounts: Partial<Record<ReturnStatus, number>>
  /** What the brand's returns refunded, whatever the filters. */
  refundedAmount: number
}

export interface SalesMonthsPage {
  salesMonths: SalesMonth[]
  productMonths: ProductMonth[]
  /** The first day the state's daily facts keep; these months end before it. */
  cutoff: string
}

export interface CustomerRowsQuery {
  tenantId: string
  /** all, new (joined in 30 days), repeat (two orders or more) or at-risk (at risk and dormant). */
  view?: string
  stage?: string | null
  tier?: string | null
  sellerId?: string | null
  /** Comma-separated customer ids, at most 500. */
  ids?: string
  /** Exact email, any case. */
  email?: string
  /** Phone digits; other characters are ignored on both sides. */
  phone?: string
  /** Words matched against name, code, email, phone and city. */
  q?: string
  /** Segment rules as JSON, with match: the customers a segment with these rules holds. */
  rules?: string
  match?: string
  sort?: string
  desc?: boolean
  page?: number
  /** At most 500. */
  pageSize?: number
}

/** A customer with their metrics row, null when they never bought or left a checkout. */
export interface CustomerRow {
  customer: Customer
  metrics: CustomerMetricsRow | null
}

export interface CustomerRowsPage {
  rows: CustomerRow[]
  total: number
  /** Per stage under the view, the rules and the ids, as the page's chips count. */
  stageCounts: Partial<Record<Customer['stage'], number>>
  /** Per tier under every filter but the tier. */
  tierCounts: Partial<Record<Customer['tier'], number>>
}

/** Older rows of a log the state carries only the newest of. */
export interface HistoryPage<T> {
  rows: T[]
  more: boolean
}

/** One line of the staff history. Names stay as they were at the time. */
export interface StaffEvent {
  id: number
  at: string
  actorId: string
  actorName: string
  targetId: string
  targetName: string
  action: string
  detail: string
}

export interface StaffEventsPage {
  events: StaffEvent[]
  nextBefore?: number
}

export interface ShopperResponse {
  token: string
  expiresAt: string
  customer: Customer
}

export interface CredentialScope {
  id: string
  label: string
}

/** An API key as the console sees it. The secret comes back only from create and rotate. */
export interface ApiCredential {
  id: string
  tenantId: string
  name: string
  prefix: string
  scopes: string[]
  status: 'active' | 'expired' | 'revoked'
  createdBy: string
  createdAt: string
  expiresAt: string | null
  rotatedAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  requests24h: number
}

export interface CredentialEvent {
  id: number
  subject: string
  action: string
  by: string
  at: string
}

export interface CredentialList {
  credentials: ApiCredential[]
  events: CredentialEvent[]
  scopes: CredentialScope[]
}

export interface IssuedCredential {
  credential: ApiCredential
  secret: string
}

export interface ConnectorField {
  key: string
  label: string
  secret: boolean
  required: boolean
  set: boolean
  last4: string | null
  updatedAt: string | null
  updatedBy: string | null
}

/** Which values a connector has. It never carries a value. */
export interface ConnectorCredentials {
  integrationId: string
  provider: string
  complete: boolean
  fields: ConnectorField[]
}

export interface ConnectionResult {
  outcome: 'ok' | 'rejected' | 'unreachable' | 'incomplete' | 'unsupported'
  detail: string
  ms: number
}

/** How the platform sends email. It never carries the key. */
export interface EmailSettings {
  provider: 'resend'
  from: string
  keySet: boolean
  keyLast4: string
  updatedAt: string | null
  updatedBy: string | null
  /** settings: saved in the console; env: RESEND_API_KEY and EMAIL_FROM; off: neither. */
  source: 'settings' | 'env' | 'off'
}

export interface EmailTestResult {
  ok: boolean
  to: string
  error?: string
}

/** One exchange rate as the console shows it: units of the currency per 1 IDR. */
export interface CurrencyRate {
  code: string
  rate: number
  /** fallback: nothing saved yet, so the built-in rate applies. */
  source: 'auto' | 'manual' | 'fallback'
  updatedAt: string | null
  updatedBy: string | null
  ageSeconds: number | null
}

export interface CurrencyRates {
  rates: CurrencyRate[]
  /** Set by a refresh: whether Frankfurter answered and how many automatic rates it wrote. */
  refresh?: { ok: boolean; updated: number; error?: string }
}

/** What the sign-up pages need before anyone signs in. */
export interface PublicConfig {
  /** The Turnstile site key; empty while the CAPTCHA is off. */
  turnstileSiteKey: string
}

/** The Turnstile keys as the console shows them. It never carries the secret. */
export interface CaptchaSettings {
  siteKey: string
  secretSet: boolean
  secretLast4: string
  updatedAt: string | null
  updatedBy: string | null
}

export interface PlanLimitsWire {
  products: number
  staff: number
  sellers: number
  warehouses: number
  assistantPerDay: number
  currencies: number
  mediaMb: number
}

/** One plan as it applies now: the defaults, or a platform admin's override. */
export interface PlanInfo {
  id: 'starter' | 'growth' | 'enterprise'
  name: string
  /** Rupiah a month. */
  price: number
  limits: PlanLimitsWire
  updatedAt: string | null
  updatedBy: string | null
}

export interface PlanRequest {
  id: string
  tenantId: string
  fromPlan: string
  toPlan: string
  note: string
  status: 'pending' | 'approved' | 'declined'
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string
}

/** A month of a brand's plan. It records what is owed; nothing charges anyone. */
export interface Invoice {
  id: string
  tenantId: string
  /** YYYY-MM */
  period: string
  plan: string
  amount: number
  status: 'due' | 'paid' | 'void'
  issuedAt: string
  paidAt: string | null
}

/** A brand's Plan & usage page. */
export interface PlanOverview {
  tenantId: string
  plan: PlanInfo['id']
  plans: PlanInfo[]
  usage: Record<keyof PlanLimitsWire, number>
  requests: PlanRequest[]
  invoices: Invoice[]
}

/** The platform's Plans page. */
export interface PlatformPlans {
  plans: PlanInfo[]
  defaults: PlanInfo[]
  tenants: { id: string; name: string; plan: string }[]
  requests: PlanRequest[]
  invoices: Invoice[]
}

/** A rate a storefront needs: units of the currency per 1 IDR. */
export interface ShopRate {
  code: string
  rate: number
}

export type CurrencyRateInput =
  { code: string; source: 'manual'; rate: number } | { code: string; source: 'auto' }

export interface WebhookEndpoint {
  id: string
  tenantId: string
  url: string
  events: string[]
  enabled: boolean
  createdBy: string
  createdAt: string
}

export interface WebhookDelivery {
  id: number
  endpointId: string
  event: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  lastStatus: number | null
  lastError: string | null
  createdAt: string
  deliveredAt: string | null
}

export interface WebhookList {
  endpoints: WebhookEndpoint[]
  deliveries: WebhookDelivery[]
  events: string[]
}

export interface IssuedWebhook {
  endpoint: WebhookEndpoint
  secret: string
}

export interface AIChatInput {
  mode: 'agent' | 'ask'
  message: string
  history?: { from: 'me' | 'bot'; text: string }[]
  task?: string
  question?: string
  options?: { id: string; title: string }[]
}

/** What the model understood, checked by the server. It has no action that pays. */
export interface AIChatAnswer {
  action:
    | 'search'
    | 'choose'
    | 'pick_for_me'
    | 'cheaper'
    | 'size'
    | 'pay_with'
    | 'change_shipping'
    | 'change_discount'
    | 'another_product'
    | 'decline'
    | 'answer'
  reply: string
  task: string
  optionId: string
  size: string
  payment: string
  productIds: string[]
}

export interface AssistantInput {
  messages: { role: 'user' | 'assistant'; text: string }[]
  /** The admin route the person is on, so the answer can be about it. */
  page?: string
}

/** An action the admin assistant proposes. The server checked it; the console runs it on Confirm. */
export interface AssistantAction {
  type:
    | 'promotions/save'
    | 'promotions/setStatus'
    | 'campaigns/pause'
    | 'campaigns/launch'
    | 'stock/receive'
    | 'stock/adjust'
    | 'orders/advance'
    | 'orders/cancel'
    | 'orders/note'
    | 'customers/note'
    | 'tickets/assign'
    | 'tickets/resolve'
    | 'leads/move'
    | 'products/setStatus'
    | 'segments/save'
  label: string
  reason: string
  /** Scalars, except segments/save, whose rules are a list of { field, op, value }. */
  params: Record<string, string | number | { field: string; op: string; value: string }[]>
  /** High for a change that is hard to take back; the console asks twice. */
  risk?: 'high'
}

export interface AssistantAnswer {
  /** Names the answer when the console reports a card's outcome or a rating; absent if the log failed. */
  id?: string
  answer: string
  actions: AssistantAction[]
  links: { label: string; path: string }[]
  /** The kinds of record the assistant looked up for this answer. */
  lookups?: string[]
}

export type AssistantOutcome = 'confirmed' | 'dismissed' | 'failed'

export interface AssistantLogEntry {
  id: string
  at: string
  userId: string
  userName: string
  page: string
  question: string
  modelCalls: number
  lookups: string[]
  answerLength: number
  actions: { type: string; targets: string[]; risk?: 'high'; outcome?: AssistantOutcome }[]
  feedback?: 'up' | 'down'
  latencyMs: number
  errorCode?: string
}

export interface AssistantLogPage {
  entries: AssistantLogEntry[]
  nextBefore?: string
}

export interface AssistantLogFilter {
  userId?: string
  outcome?: AssistantOutcome | 'open'
  /** YYYY-MM-DD, WIB. */
  from?: string
  to?: string
  before?: string
}

export interface AssistantBrandTotals {
  tenantId: string
  tenantName: string
  questions: number
  modelCalls: number
  proposed: number
  confirmed: number
  dismissed: number
  failed: number
  errors: number
  thumbsUp: number
  thumbsDown: number
}

export interface AssistantTotals {
  since: string
  brands: AssistantBrandTotals[]
}

export interface MeResponse {
  customer: Customer
  orders: Order[]
  /** The shopper's returns, open and closed. */
  returns?: OrderReturn[]
  /** Payment pages of the orders still waiting for an online payment, by order id. */
  payments: Record<string, PaymentLink>
  hasPassword: boolean
  emailVerified: boolean
  /** Whether this deployment can send email. */
  emailOn: boolean
}

/** An uploaded image. url is relative (/media/...) unless the API sets MEDIA_PUBLIC_URL. */
export interface MediaUpload {
  id: string
  url: string
  width: number
  height: number
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  /** The file's name on the uploader's device; empty for older images. */
  name: string
}

/** One place a brand shows an image. */
export interface MediaUse {
  kind: 'product' | 'brand' | 'page' | 'page_draft' | 'page_history' | 'seller'
  id: string
  label: string
}

/** An image in a brand's library with the places that show it. */
export interface MediaItem extends MediaUpload {
  createdAt: string
  uses: MediaUse[]
}

export interface MediaList {
  items: MediaItem[]
  total: number
  limit: number
  offset: number
}

export interface PrivacyRequestsResponse {
  requests: PrivacyRequest[]
}

/** Everything a store holds about one customer, for an access request (UU PDP Pasal 7). */
export interface CustomerExport {
  exportedAt: string
  customer: Customer
  events: CustomerEvent[]
  leads: Lead[]
  tickets: Ticket[]
  privacyRequests: PrivacyRequest[]
  orders: Order[]
  returns: OrderReturn[]
}

/** Who a campaign reaches now; skipped customers gave no marketing consent or withdrew it. */
export interface CampaignAudience {
  inSegment: number
  reach: number
  skipped: number
}

/** Builds the client. Every method throws ApiError on a non-2xx answer. */
export function createApi({ baseUrl, getToken }: ApiOptions) {
  const root = `${baseUrl.replace(/\/$/, '')}/v1`

  async function call<T>(method: string, path: string, body?: unknown, cache?: RequestCache): Promise<T> {
    return request<T>(method, path, body === undefined ? undefined : JSON.stringify(body), 'application/json', cache)
  }

  /** Sends a raw body. FormData sets its own multipart content type, so contentType stays unset for it. */
  async function request<T>(
    method: string,
    path: string,
    body?: BodyInit,
    contentType?: string,
    cache?: RequestCache,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined && contentType) headers['Content-Type'] = contentType
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(root + path, { method, headers, body, cache })
    if (res.status === 204) return undefined as T
    if (res.ok) return (await res.json()) as T
    let problem: ApiProblem = { status: res.status, code: 'HTTP_' + res.status, detail: res.statusText }
    try {
      const parsed = (await res.json()) as Partial<ApiProblem>
      problem = {
        status: res.status,
        code: parsed.code ?? problem.code,
        detail: parsed.detail ?? problem.detail,
      }
    } catch {
      // Keep the status text.
    }
    throw new ApiError(problem)
  }

  /** Opens the event stream; returns a function that closes it. */
  function events(path: string, onDelta: (delta: Delta) => void, onOpen?: (now: string) => void) {
    const token = getToken()
    const url = `${root}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`
    const source = new EventSource(url)
    source.addEventListener('hello', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { now: string }
      onOpen?.(data.now)
    })
    source.addEventListener('delta', (e) => onDelta(JSON.parse((e as MessageEvent).data) as Delta))
    return () => source.close()
  }

  return {
    health: () => call<{ ok: boolean; version: string; now: string }>('GET', '/health'),
    login: (email: string, password: string) =>
      call<LoginResponse>('POST', '/auth/login', { email, password }),
    me: () => call<{ user: User; emailOn: boolean }>('GET', '/auth/me'),
    /** Creates a store and its owner; the answer signs the owner in. */
    signUp: (input: SignUpInput) => call<LoginResponse>('POST', '/auth/signup', input),
    checkSubdomain: (name: string) =>
      call<SubdomainCheck>('GET', `/signup/subdomain?name=${encodeURIComponent(name)}`),
    verifyEmail: (token: string) => call<void>('POST', '/auth/verify', { token }),
    resendVerifyEmail: () => call<{ message: string }>('POST', '/auth/verify/resend'),
    changePassword: (currentPassword: string, newPassword: string) =>
      call<{ token: string }>('POST', '/auth/password', { currentPassword, newPassword }),
    forgotPassword: (email: string) => call<{ message: string }>('POST', '/auth/forgot', { email }),
    resetPassword: (token: string, newPassword: string) =>
      call<void>('POST', '/auth/reset', { token, newPassword }),
    orders: {
      /** The whole order, history included; the console's state carries only its shipments. */
      get: (id: string, tenantId: string) =>
        call<Order>('GET', `/orders/${id}?tenantId=${encodeURIComponent(tenantId)}`),
      /** The online payment record, or null when a provider never took this order's payment. */
      payment: (id: string, tenantId: string) =>
        call<{ payment: OrderPayment | null }>(
          'GET',
          `/orders/${id}/payment?tenantId=${encodeURIComponent(tenantId)}`,
        ),
    },
    views: {
      customerEvents: (params: CustomerEventsQuery) => {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params))
          if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
        return call<{ events: CustomerEvent[] }>('GET', `/views/customer-events?${query}`)
      },
      /** Every return, open or closed; the state carries the open ones only. */
      returns: (params: ReturnRowsQuery) => {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params))
          if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
        return call<ReturnRowsPage>('GET', `/views/returns?${query}`)
      },
      /** Sales per month before the daily window, YYYY-MM bounds included. */
      salesMonths: (tenantId: string, from?: string, to?: string) => {
        const query = new URLSearchParams({ tenantId })
        if (from) query.set('from', from)
        if (to) query.set('to', to)
        return call<SalesMonthsPage>('GET', `/views/sales-months?${query}`)
      },
      /** The orders list from the read model: filtered, searched, sorted and paged on the server. */
      orders: (params: OrderRowsQuery) => {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params))
          if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
        return call<OrderRowsPage>('GET', `/views/orders?${query}`)
      },
      /** Customers with their metrics; the state carries none but a sales user's own. */
      customers: (params: CustomerRowsQuery) => {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params))
          if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
        return call<CustomerRowsPage>('GET', `/views/customers?${query}`)
      },
      /** Figures over every customer of a brand; rewards are point amounts to count holders of. */
      customerSummary: (tenantId: string, rewards: readonly number[] = []) => {
        const query = new URLSearchParams({ tenantId })
        if (rewards.length) query.set('rewards', rewards.join(','))
        return call<CustomerSummary>('GET', `/views/customer-summary?${query}`)
      },
      /** Customers per brand the user may open. */
      customerCounts: () => call<{ counts: Record<string, number> }>('GET', '/views/customer-counts'),
      /** A page of a log after `before`, the oldest row held, in newest-first order. */
      history: <K extends 'stockMoves' | 'modifierStockMoves' | 'integrationLogs'>(
        collection: K,
        tenantId: string,
        before?: { at: string; id: string },
      ) => {
        const path = { stockMoves: 'stock-moves', modifierStockMoves: 'modifier-stock-moves', integrationLogs: 'integration-logs' }
        const query = new URLSearchParams({ tenantId })
        if (before) {
          query.set('before', before.at)
          query.set('beforeId', before.id)
        }
        return call<HistoryPage<AppState[K][number]>>('GET', `/views/${path[collection]}?${query}`)
      },
    },
    returns: {
      get: (id: string, tenantId: string) =>
        call<OrderReturn>('GET', `/returns/${id}?tenantId=${encodeURIComponent(tenantId)}`),
    },
    staff: {
      create: (input: StaffInput & { email: string }) => call<IssuedStaff>('POST', '/users', input),
      update: (id: string, input: StaffInput) => call<{ user: User }>('PUT', `/users/${id}`, input),
      setDisabled: (id: string, disabled: boolean) =>
        call<{ user: User }>('POST', `/users/${id}/status`, { disabled }),
      resetPassword: (id: string) => call<IssuedStaff>('POST', `/users/${id}/reset-password`),
      invite: (id: string) => call<IssuedStaff>('POST', `/users/${id}/invite`),
      events: (tenantId: string, before?: number) =>
        call<StaffEventsPage>(
          'GET',
          `/users/events?tenantId=${encodeURIComponent(tenantId)}${before ? `&before=${before}` : ''}`,
        ),
    },
    media: {
      /** Stores a PNG, JPEG or WebP image of at most 5 MB for the brand; the answer carries its URL. */
      upload: (tenantId: string, file: File, purpose?: 'seller-photo') => {
        const form = new FormData()
        form.append('file', file)
        return request<MediaUpload>(
          'POST',
          `/media?tenantId=${encodeURIComponent(tenantId)}${purpose ? `&purpose=${purpose}` : ''}`,
          form,
        )
      },
      /** A page of the brand's images, newest first, with where each is used. q searches file names. */
      list: (tenantId: string, query: { q?: string; limit?: number; offset?: number } = {}) => {
        const params = new URLSearchParams({ tenantId })
        if (query.q) params.set('q', query.q)
        if (query.limit) params.set('limit', String(query.limit))
        if (query.offset) params.set('offset', String(query.offset))
        return call<MediaList>('GET', `/media?${params}`)
      },
      /** Deletes an image and its file. Refused with 409 while something still shows it. */
      remove: (tenantId: string, id: string) =>
        call<{ ok: boolean }>('DELETE', `/media/${id}?tenantId=${encodeURIComponent(tenantId)}`),
    },
    demoAccounts: () => call<DemoAccounts>('GET', '/auth/demo-accounts'),
    /** Asks the admin assistant about a brand. It proposes actions and never runs them. */
    assistant: (tenantId: string, input: AssistantInput) =>
      call<AssistantAnswer>('POST', `/ai/assistant?tenantId=${encodeURIComponent(tenantId)}`, input),
    assistantLog: {
      /** Reports what the person did with a card. */
      outcome: (answerId: string, action: number, outcome: AssistantOutcome) =>
        call<{ ok: boolean }>('POST', '/ai/assistant/outcome', { answerId, action, outcome }),
      /** Rates an answer. */
      feedback: (answerId: string, feedback: 'up' | 'down') =>
        call<{ ok: boolean }>('POST', '/ai/assistant/outcome', { answerId, feedback }),
      /** A brand's questions, newest first (tenant admin). */
      list: (tenantId: string, filter: AssistantLogFilter = {}) => {
        const q = new URLSearchParams({ tenantId })
        for (const [key, value] of Object.entries(filter)) if (value) q.set(key, value)
        return call<AssistantLogPage>('GET', `/ai/assistant/log?${q.toString()}`)
      },
      /** Use per brand over 30 days (platform admin). */
      totals: () => call<AssistantTotals>('GET', '/ai/assistant/totals'),
    },
    state: () => call<StateResponse>('GET', '/state'),
    /** Sends an action; the answer is the delta it produced. */
    send: (action: AppAction, store?: string) => {
      const { method, path, body } = actionRequest(action, store)
      return call<Delta>(method, path, body)
    },
    subscribe: (onDelta: (delta: Delta) => void, onOpen?: (now: string) => void) =>
      events('/events', onDelta, onOpen),
    credentials: {
      list: (tenantId: string) => call<CredentialList>('GET', `/tenants/${tenantId}/credentials`),
      create: (tenantId: string, input: { name: string; scopes: string[]; expiresAt: string | null }) =>
        call<IssuedCredential>('POST', `/tenants/${tenantId}/credentials`, input),
      rotate: (id: string) => call<IssuedCredential>('POST', `/credentials/${id}/rotate`),
      revoke: (id: string) => call<ApiCredential>('POST', `/credentials/${id}/revoke`),
    },
    connector: {
      get: (integrationId: string) =>
        call<ConnectorCredentials>('GET', `/integrations/${integrationId}/credentials`),
      /** A string replaces a value, null clears it, and a field left out keeps it. */
      save: (integrationId: string, values: Record<string, string | null>) =>
        call<ConnectorCredentials>('PUT', `/integrations/${integrationId}/credentials`, { values }),
      /** Calls the provider with the stored values. */
      test: (integrationId: string) =>
        call<ConnectionResult>('POST', `/integrations/${integrationId}/credentials/test`),
    },
    currencySettings: {
      get: () => call<CurrencyRates>('GET', '/settings/currencies'),
      save: (rates: CurrencyRateInput[]) => call<CurrencyRates>('PUT', '/settings/currencies', { rates }),
      refresh: () => call<CurrencyRates>('POST', '/settings/currencies/refresh'),
    },
    /** Public settings for the sign-up pages; no sign-in needed. */
    config: () => call<PublicConfig>('GET', '/config'),
    captchaSettings: {
      get: () => call<CaptchaSettings>('GET', '/settings/captcha'),
      /** An empty secret keeps the saved one; both empty turns the check off. */
      save: (input: { siteKey: string; secret: string }) =>
        call<CaptchaSettings>('PUT', '/settings/captcha', input),
    },
    plans: {
      /** The catalog, every brand's plan, requests and invoices (platform admin). */
      platform: () => call<PlatformPlans>('GET', '/settings/plans'),
      save: (plan: string, input: { price: number; limits: PlanLimitsWire }) =>
        call<PlatformPlans>('PUT', `/settings/plans/${plan}`, input),
      decide: (requestId: string, approve: boolean, note = '') =>
        call<PlanRequest>('POST', `/plan-requests/${requestId}/decide`, { approve, note }),
      setInvoiceStatus: (invoiceId: string, status: Invoice['status']) =>
        call<Invoice>('POST', `/invoices/${invoiceId}/status`, { status }),
      setTenantPlan: (tenantId: string, plan: string) =>
        call<Delta>('PUT', `/tenants/${tenantId}/plan`, { plan }),
      /** A brand's plan, usage, requests and invoices (brand admin). */
      overview: (tenantId: string) => call<PlanOverview>('GET', `/tenants/${tenantId}/plan`),
      request: (tenantId: string, plan: string, note: string) =>
        call<PlanRequest>('POST', `/tenants/${tenantId}/plan-requests`, { plan, note }),
    },
    emailSettings: {
      get: () => call<EmailSettings>('GET', '/settings/email'),
      /** An empty key keeps the saved one. */
      save: (input: { key: string; from: string }) => call<EmailSettings>('PUT', '/settings/email', input),
      /** Sends one email to the signed-in platform admin. */
      test: () => call<EmailTestResult>('POST', '/settings/email/test'),
    },
    webhooks: {
      list: (tenantId: string) => call<WebhookList>('GET', `/tenants/${tenantId}/webhooks`),
      create: (tenantId: string, input: { url: string; events: string[] }) =>
        call<IssuedWebhook>('POST', `/tenants/${tenantId}/webhooks`, input),
      setEnabled: (id: string, enabled: boolean) =>
        call<WebhookEndpoint>('POST', `/webhooks/${id}/enabled`, { enabled }),
      rotate: (id: string) => call<IssuedWebhook>('POST', `/webhooks/${id}/rotate`),
      test: (id: string) => call<{ ok: boolean }>('POST', `/webhooks/${id}/test`),
      remove: (id: string) => call<{ ok: boolean }>('DELETE', `/webhooks/${id}`),
      retry: (deliveryId: number) => call<{ ok: boolean }>('POST', `/webhook-deliveries/${deliveryId}/retry`),
    },
    /** The custom domain and the DNS records it needs, as the server builds them. */
    domain: (tenantId: string) => call<DomainStatus>('GET', `/tenants/${tenantId}/domain`),
    privacy: {
      /** A brand's privacy requests, open ones by deadline. */
      requests: (tenantId: string, status?: PrivacyRequest['status']) =>
        call<PrivacyRequestsResponse>(
          'GET',
          `/customers/privacy-requests?tenantId=${tenantId}${status ? `&status=${status}` : ''}`,
        ),
      /** Logs a request a customer made by phone or email. */
      log: (customerId: string, kind: PrivacyRequestKind, note: string) =>
        call<PrivacyRequest>('POST', '/customers/privacy-requests', { customerId, kind, note }),
      complete: (id: string, note: string) =>
        call<Delta>('POST', `/customers/privacy-requests/${id}/complete`, { note }),
      export: (customerId: string) => call<CustomerExport>('GET', `/customers/${customerId}/export`),
      audience: (campaignId: string) => call<CampaignAudience>('GET', `/campaigns/${campaignId}/audience`),
    },
    shop: {
      tenants: () => call<{ tenants: Tenant[]; now: string }>('GET', '/shop'),
      /** The store a verified custom domain serves; ApiError 404 for any other host. */
      byHost: (host: string) =>
        call<{ store: string }>('GET', `/shop/by-host?host=${encodeURIComponent(host)}`),
      /**
       * The store's public dataset. The browser asks again each time with the ETag it holds, so the
       * store opens current and an unchanged dataset costs a 304; shared caches may keep it 30 s.
       */
      state: (store: string) => call<StateResponse>('GET', `/shop/${store}/state`, undefined, 'no-cache'),
      /** onOpen gets the server clock, fresh even when the store's dataset came from a cache. */
      subscribe: (store: string, onDelta: (delta: Delta) => void, onOpen?: (now: string) => void) =>
        events(`/shop/${store}/events`, onDelta, onOpen),
      demoCustomers: (store: string) =>
        call<{ customers: Customer[] }>('GET', `/shop/${store}/demo-customers`),
      signIn: (store: string, customerId: string) =>
        call<ShopperResponse>('POST', `/shop/${store}/sign-in`, { customerId }),
      login: (store: string, email: string, password: string) =>
        call<ShopperResponse>('POST', `/shop/${store}/login`, { email, password }),
      register: (
        store: string,
        input: { name: string; email: string; phone: string; password: string; captchaToken?: string },
      ) => call<ShopperResponse>('POST', `/shop/${store}/register`, input),
      setPassword: (store: string, currentPassword: string, newPassword: string) =>
        call<{ token: string }>('POST', `/shop/${store}/password`, { currentPassword, newPassword }),
      forgotPassword: (store: string, email: string) =>
        call<{ message: string }>('POST', `/shop/${store}/forgot`, { email }),
      resetPassword: (store: string, token: string, newPassword: string) =>
        call<void>('POST', `/shop/${store}/reset`, { token, newPassword }),
      sendVerifyEmail: (store: string) => call<{ message: string }>('POST', `/shop/${store}/verify-email`),
      verifyEmail: (store: string, token: string) => call<void>('POST', `/shop/${store}/verify`, { token }),
      me: (store: string) => call<MeResponse>('GET', `/shop/${store}/me`),
      ai: (store: string, input: AIChatInput) => call<AIChatAnswer>('POST', `/shop/${store}/ai/chat`, input),
      privacyRequests: (store: string) =>
        call<PrivacyRequestsResponse>('GET', `/shop/${store}/privacy-requests`),
      requestPrivacy: (store: string, kind: PrivacyRequestKind, note: string) =>
        call<PrivacyRequestsResponse>('POST', `/shop/${store}/privacy-requests`, { kind, note }),
      /** The shopper's data, once the store completed their access request. */
      exportData: (store: string) => call<CustomerExport>('GET', `/shop/${store}/export`),
    },
  }
}

export type Api = ReturnType<typeof createApi>
export * from './token'
