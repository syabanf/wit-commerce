import type {
  AttributeDef,
  Automation,
  AutomationStatus,
  BrandConfig,
  BrandLockKey,
  Campaign,
  CancelReason,
  Category,
  Collection,
  Customer,
  CustomerEvent,
  CustomerEventKind,
  Integration,
  IntegrationLog,
  IsoDate,
  Lead,
  ModifierGroup,
  PaymentType,
  LeadStage,
  Order,
  OrderEvent,
  Page,
  PageSection,
  Product,
  ProductStatus,
  Promotion,
  PromotionStatus,
  SearchTerm,
  Segment,
  Seller,
  SellerStatus,
  StockLevel,
  StockMove,
  Template,
  Tenant,
  Ticket,
  TrafficDay,
  User,
  Warehouse,
} from '@rc/types'
import { ORDER_STATUS_LABEL } from '@rc/types'
import { DAY, HOUR, toIso, toMs } from './dates'
import { attributesFor, nextOrderStatus, segmentContext, segmentMembers } from './derive'
import { newId } from './ids'
import {
  campaignLaunchBlocker,
  paymentTypeDisableBlocker,
  orderPlaceBlocker,
  categoryRemoveBlocker,
  leadMoveBlocker,
  orderAdvanceBlocker,
  orderCancelBlocker,
  orderRefundBlocker,
  pagePublishBlocker,
  productActivateBlocker,
  segmentRemoveBlocker,
  sellerTemplateBlocker,
  stockAdjustBlocker,
} from './rules'

export interface AppState {
  tenants: Tenant[]
  users: User[]
  sellers: Seller[]
  templates: Template[]
  pages: Page[]
  categories: Category[]
  attributes: AttributeDef[]
  modifiers: ModifierGroup[]
  collections: Collection[]
  products: Product[]
  warehouses: Warehouse[]
  stock: StockLevel[]
  stockMoves: StockMove[]
  customers: Customer[]
  customerEvents: CustomerEvent[]
  orders: Order[]
  segments: Segment[]
  leads: Lead[]
  tickets: Ticket[]
  campaigns: Campaign[]
  automations: Automation[]
  promotions: Promotion[]
  paymentTypes: PaymentType[]
  integrations: Integration[]
  integrationLogs: IntegrationLog[]
  traffic: TrafficDay[]
  searchTerms: SearchTerm[]
}

export type AppAction =
  | { type: 'tenants/create'; tenant: Tenant }
  | { type: 'tenants/completeStep'; tenantId: string; step: string }
  | { type: 'brand/update'; tenantId: string; brand: BrandConfig }
  | { type: 'brand/toggleLock'; tenantId: string; key: BrandLockKey }
  | { type: 'products/save'; product: Product }
  | { type: 'products/setAttributes'; id: string; attributes: Record<string, string> }
  | { type: 'categories/save'; category: Category }
  | { type: 'categories/remove'; id: string }
  | { type: 'attributes/save'; attribute: AttributeDef }
  | { type: 'attributes/remove'; id: string }
  | { type: 'modifiers/save'; group: ModifierGroup }
  | { type: 'modifiers/remove'; id: string }
  | { type: 'collections/save'; collection: Collection }
  | { type: 'collections/remove'; id: string }
  | { type: 'paymentTypes/save'; paymentType: PaymentType }
  | { type: 'paymentTypes/toggle'; id: string }
  | { type: 'products/setStatus'; id: string; status: ProductStatus }
  | { type: 'stock/adjust'; levelId: string; delta: number; note: string }
  | {
      type: 'stock/receive'
      tenantId: string
      productId: string
      variantId: string
      warehouseId: string
      qty: number
      note: string
    }
  | { type: 'orders/place'; order: Order; customer: Customer | null }
  | { type: 'orders/advance'; id: string; trackingNo?: string }
  | { type: 'orders/cancel'; id: string; reason: CancelReason; note: string }
  | { type: 'orders/refund'; id: string; amount: number; note: string }
  | { type: 'orders/note'; id: string; note: string }
  | { type: 'customers/save'; customer: Customer }
  | { type: 'customers/note'; id: string; note: string }
  | { type: 'customers/addPoints'; id: string; points: number; reason: string }
  | { type: 'segments/save'; segment: Segment }
  | { type: 'segments/remove'; id: string }
  | { type: 'leads/save'; lead: Lead }
  | { type: 'leads/move'; id: string; stage: LeadStage; lostReason?: string }
  | { type: 'tickets/assign'; id: string; assigneeId: string | null }
  | { type: 'tickets/resolve'; id: string }
  | { type: 'campaigns/save'; campaign: Campaign }
  | { type: 'campaigns/launch'; id: string }
  | { type: 'campaigns/pause'; id: string }
  | { type: 'automations/save'; automation: Automation }
  | { type: 'automations/setStatus'; id: string; status: AutomationStatus }
  | { type: 'promotions/save'; promotion: Promotion }
  | { type: 'promotions/setStatus'; id: string; status: PromotionStatus }
  | { type: 'pages/create'; page: Page }
  | { type: 'pages/save'; id: string; sections: PageSection[]; seo?: Page['seo']; note: string }
  | { type: 'pages/setTemplate'; id: string; templateId: string }
  | { type: 'pages/publish'; id: string }
  | { type: 'pages/schedule'; id: string; at: IsoDate }
  | { type: 'pages/unpublish'; id: string }
  | { type: 'pages/rollback'; id: string; revisionId: string }
  | { type: 'sellers/save'; seller: Seller }
  | { type: 'sellers/setTemplate'; id: string; templateId: string }
  | { type: 'sellers/setStatus'; id: string; status: SellerStatus }
  | { type: 'integrations/toggle'; id: string }
  | { type: 'integrations/sync'; id: string }
  | { type: 'system/tick' }

export interface Envelope {
  action: AppAction
  meta: { by: string; at: IsoDate }
}

/** Hours a customer has to pay before an unpaid order is cancelled. */
export const PAYMENT_WINDOW_HOURS = 24

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

const patch = <T extends { id: string }>(list: T[], id: string, fn: (x: T) => T) =>
  list.map((x) => (x.id === id ? fn(x) : x))

function customerEvent(
  order: Pick<Order, 'tenantId' | 'customerId' | 'id'>,
  kind: CustomerEventKind,
  label: string,
  at: IsoDate,
  by: string,
): CustomerEvent {
  return {
    id: newId('ev'),
    tenantId: order.tenantId,
    customerId: order.customerId,
    kind,
    at,
    label,
    productId: null,
    orderId: order.id,
    campaignId: null,
    by,
  }
}

function orderEvent(at: IsoDate, by: string, status: Order['status'] | null, note: string): OrderEvent {
  return { id: newId('oev'), at, by, status, note }
}

/** Puts reserved stock back for every line of an order that has not shipped. */
function releaseReservation(stock: StockLevel[], order: Order): StockLevel[] {
  return stock.map((s) => {
    const line = order.lines.find((l) => l.variantId === s.variantId && s.warehouseId === order.warehouseId)
    return line ? { ...s, reserved: Math.max(0, s.reserved - line.qty) } : s
  })
}

/** Takes shipped units off the shelf and out of the reservation. */
function shipStock(stock: StockLevel[], order: Order): StockLevel[] {
  return stock.map((s) => {
    const line = order.lines.find((l) => l.variantId === s.variantId && s.warehouseId === order.warehouseId)
    return line
      ? { ...s, onHand: Math.max(0, s.onHand - line.qty), reserved: Math.max(0, s.reserved - line.qty) }
      : s
  })
}

function advanceOrder(state: AppState, order: Order, by: string, at: IsoDate, trackingNo?: string): AppState {
  if (orderAdvanceBlocker(order, state.stock)) return state
  const next = nextOrderStatus(order)!
  let stock = state.stock
  let stockMoves = state.stockMoves
  let customerEvents = state.customerEvents
  let customers = state.customers
  const updated: Order = {
    ...order,
    status: next,
    trackingNo: next === 'shipped' ? (trackingNo ?? order.trackingNo) : order.trackingNo,
    paymentStatus:
      next === 'paid' || (next === 'delivered' && order.paymentMethod === 'cod')
        ? 'paid'
        : order.paymentStatus,
    events: [
      orderEvent(
        at,
        by,
        next,
        next === 'shipped' && trackingNo ? `Tracking ${trackingNo}` : ORDER_STATUS_LABEL[next],
      ),
      ...order.events,
    ],
  }
  if (next === 'paid' || (next === 'processing' && order.paymentMethod === 'cod')) {
    customerEvents = [customerEvent(order, 'purchase', `Order ${order.code}`, at, by), ...customerEvents]
    if (order.pointsEarned > 0) {
      customers = patch(customers, order.customerId, (c) => ({ ...c, points: c.points + order.pointsEarned }))
    }
  }
  if (next === 'shipped') {
    stock = shipStock(stock, order)
    stockMoves = [
      ...order.lines.map<StockMove>((l) => ({
        id: newId('mv'),
        tenantId: order.tenantId,
        variantId: l.variantId,
        warehouseId: order.warehouseId,
        kind: 'sale',
        qty: -l.qty,
        at,
        by,
        note: order.code,
      })),
      ...stockMoves,
    ]
  }
  return {
    ...state,
    stock,
    stockMoves,
    customerEvents,
    customers,
    orders: patch(state.orders, order.id, () => updated),
  }
}

/**
 * Lays the template's sections over a page's content. Each section takes the copy of the first
 * unused section of the same kind, so headline, body, products and CTA survive a template change.
 */
export function applyTemplate(content: PageSection[], template: Template, pageId: string): PageSection[] {
  const pool = [...content]
  return template.sections.map((t, i) => {
    const index = pool.findIndex((s) => s.kind === t.kind)
    const from = index >= 0 ? pool.splice(index, 1)[0]! : null
    return {
      id: from?.id ?? `${pageId}-${t.kind}-${i}`,
      kind: t.kind,
      rule: t.rule,
      hidden: false,
      headline: from?.headline ?? '',
      body: from?.body ?? '',
      productIds: from?.productIds ?? [],
      ctaLabel: from?.ctaLabel ?? '',
    }
  })
}

/**
 * Keeps a seller's personal page in step with the seller record: a new seller gets a draft page built
 * from their template, and featured products flow into the page's product section.
 */
function syncSellerPage(state: AppState, seller: Seller, by: string, at: IsoDate): Page[] {
  const page = state.pages.find((p) => p.sellerId === seller.id)
  if (page) {
    return patch(state.pages, page.id, (p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.kind === 'featured_product' ? { ...s, productIds: seller.featuredProductIds } : s,
      ),
    }))
  }
  const template = state.templates.find((t) => t.id === seller.templateId)
  if (!template) return state.pages
  const id = `page-${seller.id}`
  const sections = applyTemplate(
    [
      {
        id: `${id}-hero`,
        kind: 'hero',
        rule: 'required',
        hidden: false,
        headline: seller.headline || seller.name,
        body: seller.bio,
        productIds: [],
        ctaLabel: 'Chat on WhatsApp',
      },
      {
        id: `${id}-picks`,
        kind: 'featured_product',
        rule: 'required',
        hidden: false,
        headline: `${seller.name.split(' ')[0]}'s picks`,
        body: '',
        productIds: seller.featuredProductIds,
        ctaLabel: '',
      },
    ],
    template,
    id,
  )
  const created: Page = {
    id,
    tenantId: seller.tenantId,
    title: `${seller.name} · personal store`,
    slug: `/${seller.slug}`,
    kind: 'personal',
    templateId: template.id,
    sellerId: seller.id,
    status: 'draft',
    sections,
    seo: { title: `${seller.name} · ${seller.headline || 'Personal store'}`, description: seller.bio },
    updatedAt: at,
    updatedBy: by,
    publishedAt: null,
    scheduledAt: null,
    revisions: [
      { id: newId('rev'), at, by, note: 'Created from template', sections, templateId: template.id },
    ],
    views30d: 0,
  }
  return [...state.pages, created]
}

/** Customers in a segment of one tenant. */
export function audienceSize(
  state: AppState,
  tenantId: string,
  segmentId: string | null,
  now: number,
): number {
  const segment = state.segments.find((s) => s.id === segmentId)
  if (!segment) return 0
  const inTenant = <T extends { tenantId: string }>(list: T[]) => list.filter((x) => x.tenantId === tenantId)
  const ctx = segmentContext(
    inTenant(state.orders),
    inTenant(state.products),
    inTenant(state.customerEvents),
    now,
  )
  return segmentMembers(segment, inTenant(state.customers), ctx).length
}

/** Jobs a backend runs on a timer: expire unpaid orders, start and end promotions and scheduled pages. */
function tick(state: AppState, at: IsoDate): AppState {
  const now = toMs(at)
  let { stock, orders } = state
  orders = orders.map((o) => {
    const unpaid =
      (o.status === 'new' || o.status === 'confirmed') &&
      o.paymentStatus === 'pending' &&
      o.paymentMethod !== 'cod'
    if (!unpaid || now - toMs(o.createdAt) < PAYMENT_WINDOW_HOURS * HOUR) return o
    stock = releaseReservation(stock, o)
    return {
      ...o,
      status: 'cancelled',
      paymentStatus: 'failed',
      cancelReason: 'payment_expired',
      events: [
        orderEvent(at, 'system', 'cancelled', `No payment within ${PAYMENT_WINDOW_HOURS} hours`),
        ...o.events,
      ],
    }
  })
  const promotions = state.promotions.map((p) => {
    if (p.status === 'scheduled' && toMs(p.startAt) <= now) return { ...p, status: 'active' as const }
    if ((p.status === 'active' || p.status === 'paused') && toMs(p.endAt) < now)
      return { ...p, status: 'expired' as const }
    return p
  })
  const pages = state.pages.map((p) =>
    p.status === 'scheduled' && p.scheduledAt && toMs(p.scheduledAt) <= now
      ? { ...p, status: 'published' as const, publishedAt: p.scheduledAt, scheduledAt: null }
      : p,
  )
  const campaigns = state.campaigns.map((c) => {
    if (c.status === 'scheduled' && toMs(c.startAt) <= now) return { ...c, status: 'running' as const }
    if (c.status === 'running' && toMs(c.endAt) < now) return { ...c, status: 'completed' as const }
    return c
  })
  return { ...state, stock, orders, promotions, pages, campaigns }
}

export function reduce(state: AppState, { action, meta }: Envelope): AppState {
  const { by, at } = meta
  switch (action.type) {
    case 'tenants/create':
      return { ...state, tenants: [...state.tenants, action.tenant] }
    case 'tenants/completeStep':
      return {
        ...state,
        tenants: patch(state.tenants, action.tenantId, (t) =>
          t.onboarding.includes(action.step) ? t : { ...t, onboarding: [...t.onboarding, action.step] },
        ),
      }
    case 'brand/update':
      return {
        ...state,
        tenants: patch(state.tenants, action.tenantId, (t) => ({ ...t, brand: action.brand })),
      }
    case 'brand/toggleLock':
      return {
        ...state,
        tenants: patch(state.tenants, action.tenantId, (t) => ({
          ...t,
          brand: { ...t.brand, locks: { ...t.brand.locks, [action.key]: !t.brand.locks[action.key] } },
        })),
      }

    case 'products/save':
      return { ...state, products: upsert(state.products, action.product) }
    case 'products/setAttributes':
      return {
        ...state,
        products: patch(state.products, action.id, (p) => ({ ...p, attributes: action.attributes })),
      }

    case 'categories/save':
      return { ...state, categories: upsert(state.categories, action.category) }
    case 'categories/remove': {
      const category = state.categories.find((c) => c.id === action.id)
      if (!category || categoryRemoveBlocker(category, state.products, state.categories)) return state
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        attributes: state.attributes.map((a) => ({
          ...a,
          categoryIds: a.categoryIds.filter((id) => id !== action.id),
        })),
      }
    }

    case 'attributes/save':
      return { ...state, attributes: upsert(state.attributes, action.attribute) }
    case 'attributes/remove': {
      // Products drop their value for the attribute with it.
      const strip = (values: Record<string, string>) =>
        Object.fromEntries(Object.entries(values).filter(([key]) => key !== action.id))
      return {
        ...state,
        attributes: state.attributes.filter((a) => a.id !== action.id),
        products: state.products.map((p) =>
          action.id in p.attributes ? { ...p, attributes: strip(p.attributes) } : p,
        ),
      }
    }

    case 'modifiers/save':
      return { ...state, modifiers: upsert(state.modifiers, action.group) }
    case 'modifiers/remove':
      return { ...state, modifiers: state.modifiers.filter((m) => m.id !== action.id) }

    case 'collections/save':
      return { ...state, collections: upsert(state.collections, action.collection) }
    case 'collections/remove':
      return { ...state, collections: state.collections.filter((c) => c.id !== action.id) }

    case 'paymentTypes/save':
      return { ...state, paymentTypes: upsert(state.paymentTypes, action.paymentType) }
    case 'paymentTypes/toggle': {
      const type = state.paymentTypes.find((t) => t.id === action.id)
      if (!type || (type.enabled && paymentTypeDisableBlocker(type, state.paymentTypes))) return state
      return {
        ...state,
        paymentTypes: patch(state.paymentTypes, type.id, (t) => ({ ...t, enabled: !t.enabled })),
      }
    }

    case 'products/setStatus': {
      const product = state.products.find((p) => p.id === action.id)
      if (!product) return state
      if (
        action.status === 'active' &&
        productActivateBlocker(product, attributesFor(product.categoryId, state.attributes, state.categories))
      )
        return state
      return {
        ...state,
        products: patch(state.products, action.id, (p) => ({ ...p, status: action.status })),
      }
    }

    case 'stock/adjust': {
      const level = state.stock.find((s) => s.id === action.levelId)
      if (!level || stockAdjustBlocker(level, action.delta)) return state
      return {
        ...state,
        stock: patch(state.stock, level.id, (s) => ({ ...s, onHand: s.onHand + action.delta })),
        stockMoves: [
          {
            id: newId('mv'),
            tenantId: level.tenantId,
            variantId: level.variantId,
            warehouseId: level.warehouseId,
            kind: 'adjustment',
            qty: action.delta,
            at,
            by,
            note: action.note,
          },
          ...state.stockMoves,
        ],
      }
    }
    case 'stock/receive': {
      if (action.qty <= 0) return state
      const existing = state.stock.find(
        (s) => s.variantId === action.variantId && s.warehouseId === action.warehouseId,
      )
      const stock = existing
        ? patch(state.stock, existing.id, (s) => ({ ...s, onHand: s.onHand + action.qty }))
        : [
            ...state.stock,
            {
              id: newId('stk'),
              tenantId: action.tenantId,
              productId: action.productId,
              variantId: action.variantId,
              warehouseId: action.warehouseId,
              onHand: action.qty,
              reserved: 0,
              safety: 5,
            },
          ]
      return {
        ...state,
        stock,
        stockMoves: [
          {
            id: newId('mv'),
            tenantId: action.tenantId,
            variantId: action.variantId,
            warehouseId: action.warehouseId,
            kind: 'receipt',
            qty: action.qty,
            at,
            by,
            note: action.note,
          },
          ...state.stockMoves,
        ],
      }
    }

    case 'orders/advance': {
      const order = state.orders.find((o) => o.id === action.id)
      return order ? advanceOrder(state, order, by, at, action.trackingNo) : state
    }
    case 'orders/cancel': {
      const order = state.orders.find((o) => o.id === action.id)
      if (!order || orderCancelBlocker(order)) return state
      const refund = order.paymentStatus === 'paid'
      return {
        ...state,
        stock: releaseReservation(state.stock, order),
        orders: patch(state.orders, order.id, (o) => ({
          ...o,
          status: refund ? 'refunded' : 'cancelled',
          paymentStatus: refund ? 'refunded' : 'failed',
          refundedAmount: refund ? o.total : 0,
          cancelReason: action.reason,
          events: [orderEvent(at, by, 'cancelled', action.note || 'Cancelled'), ...o.events],
        })),
      }
    }
    case 'orders/refund': {
      const order = state.orders.find((o) => o.id === action.id)
      if (!order || orderRefundBlocker(order) || action.amount <= 0) return state
      const amount = Math.min(action.amount, order.total - order.refundedAmount)
      const full = order.refundedAmount + amount >= order.total
      return {
        ...state,
        orders: patch(state.orders, order.id, (o) => ({
          ...o,
          refundedAmount: o.refundedAmount + amount,
          status: full ? 'refunded' : o.status,
          paymentStatus: full ? 'refunded' : o.paymentStatus,
          events: [
            orderEvent(
              at,
              by,
              full ? 'refunded' : null,
              `Refunded ${amount}${action.note ? ` · ${action.note}` : ''}`,
            ),
            ...o.events,
          ],
        })),
      }
    }
    case 'orders/place': {
      const { order, customer } = action
      if (orderPlaceBlocker(order, state.stock)) return state
      const isNew = !!customer && !state.customers.some((c) => c.id === customer.id)
      const paid = order.paymentStatus === 'paid'
      const events: CustomerEvent[] = [
        ...(paid ? [customerEvent(order, 'purchase', `Order ${order.code}`, at, by)] : []),
        customerEvent(order, 'checkout_started', 'Checked out on the storefront', at, by),
        ...(isNew ? [customerEvent(order, 'registered', 'Created an account at checkout', at, by)] : []),
      ]
      return {
        ...state,
        customers: [
          ...(isNew ? [...state.customers, customer] : state.customers).map((c) =>
            c.id === order.customerId && paid ? { ...c, points: c.points + order.pointsEarned } : c,
          ),
        ],
        orders: [...state.orders, order],
        // Placing reserves the units until the parcel ships or the order is cancelled.
        stock: state.stock.map((s) => {
          const qty = order.lines.filter((l) => l.variantId === s.variantId).reduce((n, l) => n + l.qty, 0)
          return qty && s.warehouseId === order.warehouseId ? { ...s, reserved: s.reserved + qty } : s
        }),
        // Every promotion the order earned counts one use.
        promotions: state.promotions.map((p) =>
          order.discountLines?.some((d) => d.promotionId === p.id) ||
          (!order.discountLines && p.code === order.voucherCode)
            ? { ...p, used: p.used + 1, revenue: p.revenue + order.total }
            : p,
        ),
        customerEvents: [...events, ...state.customerEvents],
      }
    }
    case 'orders/note':
      return {
        ...state,
        orders: patch(state.orders, action.id, (o) => ({
          ...o,
          events: [orderEvent(at, by, null, action.note), ...o.events],
        })),
      }

    case 'customers/save':
      return { ...state, customers: upsert(state.customers, action.customer) }
    case 'customers/note': {
      const c = state.customers.find((x) => x.id === action.id)
      if (!c) return state
      const ev: CustomerEvent = {
        id: newId('ev'),
        tenantId: c.tenantId,
        customerId: c.id,
        kind: 'note',
        at,
        label: action.note,
        productId: null,
        orderId: null,
        campaignId: null,
        by,
      }
      return { ...state, customerEvents: [ev, ...state.customerEvents] }
    }
    case 'customers/addPoints': {
      const c = state.customers.find((x) => x.id === action.id)
      if (!c || c.points + action.points < 0) return state
      const ev: CustomerEvent = {
        id: newId('ev'),
        tenantId: c.tenantId,
        customerId: c.id,
        kind: 'points_earned',
        at,
        label: `${action.points > 0 ? '+' : ''}${action.points} points · ${action.reason}`,
        productId: null,
        orderId: null,
        campaignId: null,
        by,
      }
      return {
        ...state,
        customers: patch(state.customers, c.id, (x) => ({ ...x, points: x.points + action.points })),
        customerEvents: [ev, ...state.customerEvents],
      }
    }

    case 'segments/save':
      return { ...state, segments: upsert(state.segments, action.segment) }
    case 'segments/remove': {
      const segment = state.segments.find((s) => s.id === action.id)
      if (!segment || segmentRemoveBlocker(segment, state.campaigns)) return state
      return { ...state, segments: state.segments.filter((s) => s.id !== action.id) }
    }

    case 'leads/save':
      return { ...state, leads: upsert(state.leads, { ...action.lead, updatedAt: at }) }
    case 'leads/move': {
      const lead = state.leads.find((l) => l.id === action.id)
      if (!lead || leadMoveBlocker(lead, action.stage)) return state
      return {
        ...state,
        leads: patch(state.leads, lead.id, (l) => ({
          ...l,
          stage: action.stage,
          updatedAt: at,
          lostReason: action.stage === 'lost' ? (action.lostReason ?? null) : null,
        })),
      }
    }

    case 'tickets/assign':
      return {
        ...state,
        tickets: patch(state.tickets, action.id, (t) => ({ ...t, assigneeId: action.assigneeId })),
      }
    case 'tickets/resolve':
      return {
        ...state,
        tickets: patch(state.tickets, action.id, (t) => ({ ...t, status: 'resolved', resolvedAt: at })),
      }

    case 'campaigns/save':
      return { ...state, campaigns: upsert(state.campaigns, action.campaign) }
    case 'campaigns/launch': {
      const campaign = state.campaigns.find((c) => c.id === action.id)
      if (
        !campaign ||
        campaignLaunchBlocker(campaign, audienceSize(state, campaign.tenantId, campaign.segmentId, toMs(at)))
      )
        return state
      return {
        ...state,
        campaigns: patch(state.campaigns, campaign.id, (c) => ({
          ...c,
          status: toMs(c.startAt) > toMs(at) ? 'scheduled' : 'running',
          endAt: toMs(c.endAt) < toMs(at) ? toIso(toMs(at) + 14 * DAY) : c.endAt,
        })),
      }
    }
    case 'campaigns/pause':
      return {
        ...state,
        campaigns: patch(state.campaigns, action.id, (c) =>
          c.status === 'running' ? { ...c, status: 'paused' } : c,
        ),
      }

    case 'automations/save':
      return { ...state, automations: upsert(state.automations, { ...action.automation, updatedAt: at }) }
    case 'automations/setStatus':
      return {
        ...state,
        automations: patch(state.automations, action.id, (a) => ({
          ...a,
          status: action.status,
          updatedAt: at,
        })),
      }

    case 'promotions/save':
      return { ...state, promotions: upsert(state.promotions, action.promotion) }
    case 'promotions/setStatus':
      return {
        ...state,
        promotions: patch(state.promotions, action.id, (p) => ({ ...p, status: action.status })),
      }

    case 'pages/create':
      return { ...state, pages: [...state.pages, action.page] }
    case 'pages/save':
      return {
        ...state,
        pages: patch(state.pages, action.id, (p) => ({
          ...p,
          sections: action.sections,
          seo: action.seo ?? p.seo,
          updatedAt: at,
          updatedBy: by,
          revisions: [
            {
              id: newId('rev'),
              at,
              by,
              note: action.note,
              sections: action.sections,
              templateId: p.templateId,
            },
            ...p.revisions,
          ].slice(0, 12),
        })),
      }
    case 'pages/setTemplate': {
      const page = state.pages.find((p) => p.id === action.id)
      const template = state.templates.find((t) => t.id === action.templateId)
      if (!page || !template || page.templateId === template.id) return state
      const sections = applyTemplate(page.sections, template, page.id)
      return {
        ...state,
        pages: patch(state.pages, page.id, (p) => ({
          ...p,
          templateId: template.id,
          sections,
          updatedAt: at,
          updatedBy: by,
          revisions: [
            {
              id: newId('rev'),
              at,
              by,
              note: `Switched to ${template.name}`,
              sections,
              templateId: template.id,
            },
            ...p.revisions,
          ].slice(0, 12),
        })),
      }
    }
    case 'pages/publish': {
      const page = state.pages.find((p) => p.id === action.id)
      if (!page || pagePublishBlocker(page)) return state
      return {
        ...state,
        pages: patch(state.pages, page.id, (p) => ({
          ...p,
          status: 'published',
          publishedAt: at,
          scheduledAt: null,
          revisions: [
            { id: newId('rev'), at, by, note: 'Published', sections: p.sections, templateId: p.templateId },
            ...p.revisions,
          ].slice(0, 12),
        })),
      }
    }
    case 'pages/schedule': {
      const page = state.pages.find((p) => p.id === action.id)
      if (!page || pagePublishBlocker(page)) return state
      return {
        ...state,
        pages: patch(state.pages, page.id, (p) => ({ ...p, status: 'scheduled', scheduledAt: action.at })),
      }
    }
    case 'pages/unpublish':
      return {
        ...state,
        pages: patch(state.pages, action.id, (p) => ({ ...p, status: 'draft', scheduledAt: null })),
      }
    case 'pages/rollback': {
      const page = state.pages.find((p) => p.id === action.id)
      const rev = page?.revisions.find((r) => r.id === action.revisionId)
      if (!page || !rev) return state
      return {
        ...state,
        pages: patch(state.pages, page.id, (p) => ({
          ...p,
          sections: rev.sections,
          templateId: rev.templateId,
          updatedAt: at,
          updatedBy: by,
          revisions: [
            {
              id: newId('rev'),
              at,
              by,
              note: `Rolled back to ${rev.note.toLowerCase()}`,
              sections: rev.sections,
              templateId: rev.templateId,
            },
            ...p.revisions,
          ].slice(0, 12),
        })),
      }
    }

    case 'sellers/save':
      return {
        ...state,
        sellers: upsert(state.sellers, action.seller),
        pages: syncSellerPage(state, action.seller, by, at),
      }
    case 'sellers/setTemplate': {
      const seller = state.sellers.find((s) => s.id === action.id)
      const template = state.templates.find((t) => t.id === action.templateId)
      if (!seller || sellerTemplateBlocker(seller, action.templateId)) return state
      return {
        ...state,
        sellers: patch(state.sellers, seller.id, (s) => ({ ...s, templateId: action.templateId })),
        // The page keeps its content; the new template decides which sections show it.
        pages: state.pages.map((p) =>
          p.sellerId === seller.id && template
            ? {
                ...p,
                templateId: template.id,
                sections: applyTemplate(p.sections, template, p.id),
                updatedAt: at,
                updatedBy: by,
              }
            : p,
        ),
      }
    }
    case 'sellers/setStatus':
      return { ...state, sellers: patch(state.sellers, action.id, (s) => ({ ...s, status: action.status })) }

    case 'integrations/toggle':
      return {
        ...state,
        integrations: patch(state.integrations, action.id, (i) => ({
          ...i,
          enabled: !i.enabled,
          health: i.enabled ? 'off' : 'connected',
        })),
      }
    case 'integrations/sync':
      return {
        ...state,
        integrations: patch(state.integrations, action.id, (i) =>
          i.enabled ? { ...i, lastSyncAt: at, health: i.health === 'failing' ? 'degraded' : i.health } : i,
        ),
      }

    case 'system/tick':
      return tick(state, at)
  }
}
