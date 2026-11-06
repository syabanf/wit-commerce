import type { AppAction, AppState } from '@rc/fixtures'
import type { Customer, Order, Seller, Tenant, User, CustomerEvent } from '@rc/types'

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
    case 'tenants/completeStep':
      return { method: 'POST', path: `/tenants/${action.tenantId}/onboarding/${action.step}` }
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

export interface StateResponse {
  state: Partial<AppState>
  now: string
  /** A store's state: the payment types a provider collects online. */
  onlinePayments?: string[]
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

export interface MeResponse {
  customer: Customer
  orders: Order[]
  /** Payment pages of the orders still waiting for an online payment, by order id. */
  payments: Record<string, PaymentLink>
  hasPassword: boolean
  emailVerified: boolean
  /** Whether this deployment can send email. */
  emailOn: boolean
}

/** Builds the client. Every method throws ApiError on a non-2xx answer. */
export function createApi({ baseUrl, getToken }: ApiOptions) {
  const root = `${baseUrl.replace(/\/$/, '')}/v1`

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(root + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
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
    me: () => call<{ user: User }>('GET', '/auth/me'),
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
      /** The orders list from the read model: filtered, searched, sorted and paged on the server. */
      orders: (params: OrderRowsQuery) => {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params))
          if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
        return call<OrderRowsPage>('GET', `/views/orders?${query}`)
      },
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
    demoAccounts: () => call<DemoAccounts>('GET', '/auth/demo-accounts'),
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
    shop: {
      tenants: () => call<{ tenants: Tenant[]; now: string }>('GET', '/shop'),
      state: (store: string) => call<StateResponse>('GET', `/shop/${store}/state`),
      subscribe: (store: string, onDelta: (delta: Delta) => void) => events(`/shop/${store}/events`, onDelta),
      demoCustomers: (store: string) =>
        call<{ customers: Customer[] }>('GET', `/shop/${store}/demo-customers`),
      signIn: (store: string, customerId: string) =>
        call<ShopperResponse>('POST', `/shop/${store}/sign-in`, { customerId }),
      login: (store: string, email: string, password: string) =>
        call<ShopperResponse>('POST', `/shop/${store}/login`, { email, password }),
      register: (store: string, input: { name: string; email: string; phone: string; password: string }) =>
        call<ShopperResponse>('POST', `/shop/${store}/register`, input),
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
    },
  }
}

export type Api = ReturnType<typeof createApi>
export * from './token'
