// Records what the TypeScript reducer does for every action, as the delta each one produces, so the
// Go service can prove it does the same (apps/api/internal/service/parity_test.go).
// Run with: pnpm gen:golden
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Customer, MenuLink, Order, Page, ReturnReason, ShopperEmailKind } from '../packages/types/src/index.ts'
import { FIXTURE_NOW } from '../packages/fixtures/src/clock.ts'
import { seedState } from '../packages/fixtures/src/data.ts'
import { DAY, HOUR, toIso, toMs } from '../packages/fixtures/src/dates.ts'
import { deriveFacts } from '../packages/fixtures/src/facts.ts'
import { type AppAction, type AppState, reduce } from '../packages/fixtures/src/store.ts'

type Collection = keyof AppState

interface Case {
  name: string
  action: AppAction
  by: string
  at: string
  /** The rows the reducer wrote (by id) and removed, per collection; empty when it refused. */
  upserts: Partial<Record<Collection, unknown[]>>
  removes: Partial<Record<Collection, string[]>>
}

// newId mints from the clock and Math.random. Pinning both here keeps this file the same on every
// run, so CI can compare it with the committed copy.
let randomState = 1
Math.random = () => {
  randomState = (randomState * 48271) % 2147483647
  return randomState / 2147483647
}
Date.now = () => toMs(FIXTURE_NOW)

const at = (hours = 0) => toIso(toMs(FIXTURE_NOW) + hours * HOUR)
const idOf = (collection: Collection, row: unknown) =>
  collection === 'agentPolicies' ? (row as { tenantId: string }).tenantId : (row as { id: string }).id

/** Rows that changed between two states, by id and deep equality, per collection. */
function diff(before: AppState, after: AppState) {
  const upserts: Case['upserts'] = {}
  const removes: Case['removes'] = {}
  for (const key of Object.keys(after) as Collection[]) {
    const prev = new Map((before[key] as unknown[]).map((r) => [idOf(key, r), r]))
    const next = new Map((after[key] as unknown[]).map((r) => [idOf(key, r), r]))
    const changed = [...next].filter(([id, row]) => JSON.stringify(prev.get(id)) !== JSON.stringify(row))
    const gone = [...prev.keys()].filter((id) => !next.has(id))
    if (changed.length) upserts[key] = changed.map(([, row]) => row)
    if (gone.length) removes[key] = gone
  }
  return { upserts, removes }
}

let state = seedState()
const cases: Case[] = []
let hours = 1
const run = (name: string, action: AppAction, by = 'usr-budi') => {
  const when = at(hours++)
  const after = reduce(state, { action, meta: { by, at: when } })
  cases.push({ name, action, by, at: when, ...diff(state, after) })
  state = after
}

const lari = 'ten-lari'
const find = <T>(list: T[], test: (x: T) => boolean, what: string): T => {
  const found = list.find(test)
  if (!found) throw new Error(`golden: no ${what}`)
  return found
}

// --- tenants and brand ---
const tenant = find(state.tenants, (t) => t.id === lari, 'tenant')
run('tenants/completeStep', { type: 'tenants/completeStep', tenantId: lari, step: 'golden-step' }, 'usr-andi')
run('brand/update', { type: 'brand/update', tenantId: lari, brand: { ...tenant.brand, tagline: 'Golden tagline' } }, 'usr-andi')
run('brand/toggleLock', { type: 'brand/toggleLock', tenantId: lari, key: 'logo' }, 'usr-andi')
run(
  'tenants/create',
  {
    type: 'tenants/create',
    tenant: { ...tenant, id: 'ten-golden', code: 'GOLD', name: 'Golden Co.', subdomain: 'golden', onboarding: [] },
  },
  'usr-dewi',
)

// --- catalog ---
const product = find(state.products, (p) => p.tenantId === lari && p.status === 'active' && p.variants.length > 1, 'product')
run('products/save', { type: 'products/save', product: { ...product, name: `${product.name} (golden)` } })
run('products/setAttributes', { type: 'products/setAttributes', id: product.id, attributes: { ...product.attributes, golden: 'yes' } })
run('products/setStatus archive', { type: 'products/setStatus', id: product.id, status: 'archived' })
run('products/setStatus activate', { type: 'products/setStatus', id: product.id, status: 'active' })
const draftNoVariants = find(state.products, (p) => p.tenantId === lari && p.status === 'draft', 'draft product')
run('products/setStatus refused', {
  type: 'products/setStatus',
  id: draftNoVariants.id,
  status: 'active',
})
const category = find(state.categories, (c) => c.tenantId === lari && c.parentId === null, 'category')
run('categories/save', {
  type: 'categories/save',
  category: { id: 'cat-golden', tenantId: lari, name: 'Golden', description: 'Golden things', parentId: null },
})
run('categories/remove refused', { type: 'categories/remove', id: category.id })
run('categories/remove', { type: 'categories/remove', id: 'cat-golden' })
const attribute = find(state.attributes, (a) => a.tenantId === lari, 'attribute')
run('attributes/save', {
  type: 'attributes/save',
  attribute: { ...attribute, id: 'attr-golden', code: 'golden', name: 'Golden', categoryIds: [] },
})
run('attributes/remove', { type: 'attributes/remove', id: attribute.id })
const group = find(state.modifiers, (g) => g.tenantId === lari && g.options.some((o) => o.stockTracked), 'modifier group')
run('modifiers/save', { type: 'modifiers/save', group: { ...group, name: `${group.name} (golden)` } })
run('modifiers/remove refused', { type: 'modifiers/remove', id: group.id })
run('modifiers/save new', {
  type: 'modifiers/save',
  group: {
    id: 'mod-golden',
    tenantId: lari,
    name: 'Golden wrap',
    selection: 'single',
    required: false,
    maxChoices: 1,
    options: [{ id: 'opt-golden-1', name: 'Gold paper', priceDelta: 5000 }],
    productIds: [product.id],
  },
})
run('modifiers/remove', { type: 'modifiers/remove', id: 'mod-golden' })
const collection = find(state.collections, (c) => c.tenantId === lari, 'collection')
run('collections/save', { type: 'collections/save', collection: { ...collection, id: 'col-golden', slug: 'golden', name: 'Golden picks' } })
run('collections/remove', { type: 'collections/remove', id: 'col-golden' })
const paymentType = find(state.paymentTypes, (t) => t.tenantId === lari && t.enabled, 'payment type')
run('paymentTypes/save', { type: 'paymentTypes/save', paymentType: { ...paymentType, instructions: 'Golden instructions' } })
run('paymentTypes/toggle', { type: 'paymentTypes/toggle', id: paymentType.id })
run('paymentTypes/toggle back', { type: 'paymentTypes/toggle', id: paymentType.id })
const policy = find(state.agentPolicies, (p) => p.tenantId === lari, 'agent policy')
run('agentPolicy/save', { type: 'agentPolicy/save', policy: { ...policy, maxAutoDiscountPct: 7, updatedAt: at(0) } }, 'usr-andi')

// --- stock ---
const level = find(state.stock, (s) => s.tenantId === lari && s.onHand > s.reserved + 5, 'stock level')
run('stock/adjust', { type: 'stock/adjust', levelId: level.id, delta: -2, note: 'Golden count' })
run('stock/adjust refused', { type: 'stock/adjust', levelId: level.id, delta: -(level.onHand + 100), note: 'Too many' })
run('stock/receive', {
  type: 'stock/receive',
  tenantId: lari,
  productId: level.productId,
  variantId: level.variantId,
  warehouseId: level.warehouseId,
  qty: 7,
  note: 'Golden delivery',
})
// A variant and warehouse with no stock row yet, so the receipt opens a level.
const opening = find(
  state.products
    .filter((p) => p.tenantId === lari && p.type === 'physical')
    .flatMap((p) =>
      p.variants.flatMap((v) =>
        state.warehouses
          .filter((w) => w.tenantId === lari)
          .map((w) => ({ productId: p.id, variantId: v.id, warehouseId: w.id })),
      ),
    ),
  (x) => !state.stock.some((s) => s.variantId === x.variantId && s.warehouseId === x.warehouseId),
  'variant without stock at a warehouse',
)
run('stock/receive new level', { type: 'stock/receive', tenantId: lari, ...opening, qty: 3, note: 'Golden opening' })
const mLevel = find(state.modifierStock, (s) => s.tenantId === lari && s.onHand > 2, 'modifier level')
run('modifierStock/adjust', { type: 'modifierStock/adjust', levelId: mLevel.id, delta: -1, note: 'Golden count' })
run('modifierStock/receive', {
  type: 'modifierStock/receive',
  tenantId: lari,
  groupId: mLevel.groupId,
  optionId: mLevel.optionId,
  warehouseId: mLevel.warehouseId,
  qty: 4,
  note: 'Golden delivery',
})

// --- orders ---
const template = find(
  state.orders,
  (o) => o.tenantId === lari && o.status === 'completed' && o.lines.length === 1 && o.paymentMethod !== 'cod',
  'completed order',
)
const customer = find(state.customers, (c) => c.id === template.customerId, 'customer')
const fresh = (id: string, overrides: Partial<Order> = {}): Order => ({
  ...template,
  id,
  code: `LARI-9${id.slice(-4)}`,
  status: 'new',
  paymentStatus: 'pending',
  trackingNo: null,
  cancelReason: null,
  refundedAmount: 0,
  createdAt: at(hours - 1),
  events: [{ id: `oev-${id}`, at: at(hours - 1), by: 'storefront', status: 'new', note: 'Placed' }],
  voucherCode: null,
  discountLines: [],
  ...overrides,
})
run('orders/place', { type: 'orders/place', order: fresh('ord-golden-1'), customer: null }, 'storefront')
const newCustomer: Customer = { ...customer, id: 'cus-golden', code: 'LARI-C99999', name: 'Golden Shopper', points: 0 }
const paidPromo = find(state.promotions, (p) => p.tenantId === lari && p.status === 'active', 'promotion')
run(
  'orders/place new customer paid',
  {
    type: 'orders/place',
    order: fresh('ord-golden-2', {
      customerId: 'cus-golden',
      paymentStatus: 'paid',
      pointsEarned: 12,
      discountLines: [{ promotionId: paidPromo.id, label: paidPromo.name, amount: 1000 }],
    }),
    customer: newCustomer,
  },
  'storefront',
)
run('orders/advance confirm', { type: 'orders/advance', id: 'ord-golden-1' })
run('orders/advance pay', { type: 'orders/advance', id: 'ord-golden-1' })
run('orders/advance process', { type: 'orders/advance', id: 'ord-golden-1' })
run('orders/advance pack', { type: 'orders/advance', id: 'ord-golden-1' })
run('orders/advance ship', { type: 'orders/advance', id: 'ord-golden-1', trackingNo: 'GOLD123' })
run('orders/note', { type: 'orders/note', id: 'ord-golden-1', note: 'Golden note' })
run('orders/cancel refused shipped', { type: 'orders/cancel', id: 'ord-golden-1', reason: 'customer_request', note: '' })
run('orders/refund partial', { type: 'orders/refund', id: 'ord-golden-1', amount: 1000, note: 'Golden goodwill' })
run('orders/refund rest', { type: 'orders/refund', id: 'ord-golden-1', amount: 10_000_000, note: '' })
run('orders/cancel paid', { type: 'orders/cancel', id: 'ord-golden-2', reason: 'duplicate', note: 'Golden duplicate' })
run('orders/place for cancel', { type: 'orders/place', order: fresh('ord-golden-3'), customer: null }, 'storefront')
run('orders/cancel unpaid', { type: 'orders/cancel', id: 'ord-golden-3', reason: 'customer_request', note: '' })
run('orders/place for expiry', { type: 'orders/place', order: fresh('ord-golden-4'), customer: null }, 'storefront')

// --- customers and CRM ---
run('customers/save', { type: 'customers/save', customer: { ...customer, tags: [...customer.tags, 'golden'] } }, 'usr-sari')
run('customers/note', { type: 'customers/note', id: customer.id, note: 'Golden note' }, 'usr-sari')
run('customers/addPoints', { type: 'customers/addPoints', id: customer.id, points: 50, reason: 'Golden bonus' }, 'usr-sari')
run('customers/addPoints refused', { type: 'customers/addPoints', id: customer.id, points: -1_000_000, reason: 'Too many' }, 'usr-sari')
const segment = find(state.segments, (s) => s.tenantId === lari && !s.builtIn, 'segment')
run('segments/save', { type: 'segments/save', segment: { ...segment, id: 'seg-golden', name: 'Golden' } }, 'usr-maya')
run('segments/remove', { type: 'segments/remove', id: 'seg-golden' }, 'usr-maya')
const lead = find(state.leads, (l) => l.tenantId === lari && l.stage === 'new' && l.value > 0, 'lead')
run('leads/save', { type: 'leads/save', lead: { ...lead, note: 'Golden note' } }, 'usr-fahmi')
run('leads/move', { type: 'leads/move', id: lead.id, stage: 'qualified' }, 'usr-fahmi')
run('leads/move lost', { type: 'leads/move', id: lead.id, stage: 'lost', lostReason: 'Golden reason' }, 'usr-fahmi')
run('leads/move refused', { type: 'leads/move', id: lead.id, stage: 'won' }, 'usr-fahmi')
const ticket = find(state.tickets, (t) => t.tenantId === lari && t.status === 'open', 'ticket')
run('tickets/assign', { type: 'tickets/assign', id: ticket.id, assigneeId: ticket.assigneeId === 'usr-sari' ? 'usr-budi' : 'usr-sari' }, 'usr-sari')
run('tickets/resolve', { type: 'tickets/resolve', id: ticket.id }, 'usr-sari')

// --- growth ---
const draftCampaign = find(state.campaigns, (c) => c.tenantId === lari && c.status === 'draft', 'draft campaign')
const audienceSegment = find(state.segments, (s) => s.tenantId === lari && s.builtIn, 'built-in segment')
run('campaigns/save', { type: 'campaigns/save', campaign: { ...draftCampaign, segmentId: audienceSegment.id, channels: ['email'] } }, 'usr-maya')
run('campaigns/launch', { type: 'campaigns/launch', id: draftCampaign.id }, 'usr-maya')
run('campaigns/pause', { type: 'campaigns/pause', id: draftCampaign.id }, 'usr-maya')
const automation = find(state.automations, (a) => a.tenantId === lari, 'automation')
run('automations/save', { type: 'automations/save', automation: { ...automation, description: 'Golden' } }, 'usr-maya')
run('automations/setStatus', { type: 'automations/setStatus', id: automation.id, status: 'paused' }, 'usr-maya')
run('promotions/save', { type: 'promotions/save', promotion: { ...paidPromo, id: 'promo-golden', code: 'GOLDEN', name: 'Golden' } }, 'usr-maya')
run('promotions/setStatus', { type: 'promotions/setStatus', id: 'promo-golden', status: 'paused' }, 'usr-maya')

// --- pages and sellers ---
const page = find(state.pages, (p) => p.tenantId === lari && p.sellerId === null && p.status === 'published', 'page')
const otherTemplate = find(
  state.templates,
  (t) => t.id !== page.templateId && (t.tenantId === null || t.tenantId === lari) && t.scope === 'store',
  'other template',
)
run('pages/save', { type: 'pages/save', id: page.id, sections: page.sections, seo: { ...page.seo, title: 'Golden title' }, note: 'Golden edit' }, 'usr-maya')
run('pages/setTemplate', { type: 'pages/setTemplate', id: page.id, templateId: otherTemplate.id }, 'usr-maya')
run('pages/unpublish', { type: 'pages/unpublish', id: page.id }, 'usr-maya')
run('pages/schedule', { type: 'pages/schedule', id: page.id, at: at(hours + 48) }, 'usr-maya')
run('pages/publish', { type: 'pages/publish', id: page.id }, 'usr-maya')
// Roll back to a seeded revision: both sides know its id, unlike the ones this run minted.
run('pages/rollback', { type: 'pages/rollback', id: page.id, revisionId: page.revisions[0]!.id }, 'usr-maya')
// The page is live, so the save, the template switch and the rollback above went into its draft.
run('pages/discardDraft', { type: 'pages/discardDraft', id: page.id }, 'usr-maya')
run('pages/discardDraft without a draft', { type: 'pages/discardDraft', id: page.id }, 'usr-maya')
const newPage: Page = { ...page, id: 'page-golden', slug: '/golden', title: 'Golden page', status: 'draft', revisions: [], publishedAt: null }
run('pages/create', { type: 'pages/create', page: newPage }, 'usr-maya')
// A page that was never published takes a save directly; once scheduled, saves wait for the tick.
run('pages/save draft page', { type: 'pages/save', id: newPage.id, sections: newPage.sections, note: 'Golden draft edit' }, 'usr-maya')
run('pages/schedule draft page', { type: 'pages/schedule', id: newPage.id, at: at(hours + 5) }, 'usr-maya')
run('pages/save scheduled page', { type: 'pages/save', id: newPage.id, sections: newPage.sections, seo: { ...newPage.seo, title: 'Golden scheduled title' }, note: 'Golden scheduled edit' }, 'usr-maya')
const seller = find(state.sellers, (s) => s.tenantId === lari && s.allowedTemplateIds.length > 1, 'seller')
run('sellers/save', { type: 'sellers/save', seller: { ...seller, featuredProductIds: [product.id] } }, 'usr-andi')
run('sellers/save new', {
  type: 'sellers/save',
  seller: { ...seller, id: 'sel-golden', code: 'GOLD-S1', name: 'Golden Seller', slug: 'golden-seller', userId: null },
}, 'usr-andi')
const allowed = find(seller.allowedTemplateIds, (id) => id !== seller.templateId, 'allowed template')
run('sellers/setTemplate', { type: 'sellers/setTemplate', id: seller.id, templateId: allowed }, 'usr-andi')
run('sellers/setStatus', { type: 'sellers/setStatus', id: seller.id, status: 'suspended' }, 'usr-andi')

// --- integrations and the clock ---
const integration = find(state.integrations, (i) => i.tenantId === lari && i.enabled, 'integration')
run('integrations/sync', { type: 'integrations/sync', id: integration.id }, 'usr-andi')
run('integrations/toggle', { type: 'integrations/toggle', id: integration.id }, 'usr-andi')
hours += 30
run('system/tick', { type: 'system/tick' }, 'system')

// Added after the timer so the cases above keep their timestamps.
const currencies = (list: string[]) => ({ type: 'tenants/setDisplayCurrencies' as const, tenantId: lari, currencies: list })
run('tenants/setDisplayCurrencies', currencies(['USD', 'SGD', 'USD']), 'usr-andi')
run('tenants/setDisplayCurrencies refused', currencies(['XYZ']), 'usr-andi')

// Custom domains, on the brand that has none so the cases above keep their rows.
const teknika = 'ten-teknika'
const setDomain = (domain: string | null) =>
  ({ type: 'tenants/setDomain' as const, tenantId: teknika, domain, token: 'wit-verify-golden' })
run('tenants/verifyDomain refused without a domain', { type: 'tenants/verifyDomain', tenantId: teknika })
run('tenants/setDomain refused when invalid', setDomain('localhost'))
run('tenants/setDomain refused when taken', setDomain('www.aruna.id'))
run('tenants/setDomain', setDomain('www.teknika-store.com'))
run('tenants/verifyDomain', { type: 'tenants/verifyDomain', tenantId: teknika })
run('tenants/setDomain same domain', setDomain('www.teknika-store.com'))
run('tenants/setDomain disconnect', setDomain(null))

// Store content: a seller's own copy, then the store's menus.
const profile = (id: string, headline: string, bio: string, photoUrl = '') => ({ type: 'sellers/updateProfile' as const, id, headline, bio, photoUrl })
run('sellers/updateProfile', profile('sel-sherlyn', ' Trail picks, tested on Rinjani. ', 'I run the club\'s trail group.', '/media/ten-lari/med-golden0001.webp'), 'usr-andi')
run('sellers/updateProfile own', profile('sel-fahmi', 'Race-day shoes, fitted by Fahmi.', 'Ask me about carbon plates.'), 'usr-fahmi')
run('sellers/updateProfile refused', profile('sel-fahmi', 'x'.repeat(81), ''), 'usr-andi')
const menus = (header: MenuLink[], footer: MenuLink[]) => ({ type: 'menus/save' as const, tenantId: lari, menus: { header, footer } })
run('menus/save', menus(
  [
    { label: ' About us ', target: { kind: 'page', id: 'page-lari-about' } },
    { label: 'Shoes', target: { kind: 'category', id: find(state.categories, (c) => c.tenantId === lari, 'category').id } },
    { label: 'Everything', target: { kind: 'catalog' } },
    { label: 'Instagram', target: { kind: 'url', url: 'https://instagram.com/lari' } },
  ],
  [
    { label: 'FAQ', target: { kind: 'page', id: 'page-lari-faq' } },
    { label: 'Your cart', target: { kind: 'url', url: '/cart' } },
  ],
), 'usr-maya')
run('menus/save refused', menus([{ label: 'Bad', target: { kind: 'url', url: 'javascript:alert(1)' } }], []), 'usr-maya')
run('menus/save cleared', menus([], []), 'usr-maya')

// Returns, added at the end so every case above keeps its output. One order of four units goes
// through every return step until refunded returns cover it all and it turns returned.
const shopSettings = (returnWindowDays: number, shopperEmailsOff: ShopperEmailKind[]) =>
  ({ type: 'tenants/setShopSettings' as const, tenantId: lari, returnWindowDays, shopperEmailsOff })
run('tenants/setShopSettings', shopSettings(14, ['order_shipped', 'order_placed']), 'usr-andi')
run('tenants/setShopSettings refused', shopSettings(120, []), 'usr-andi')
const line = { ...template.lines[0]!, qty: 4 }
const returnable = fresh('ord-golden-r1', {
  lines: [line],
  subtotal: line.qty * line.price,
  discount: 0,
  total: line.qty * line.price + template.shipping,
})
run('orders/place for returns', { type: 'orders/place', order: returnable, customer: null }, 'storefront')
for (const step of ['confirm', 'pay', 'process', 'pack', 'ship', 'deliver'])
  run(`orders/advance ${step} for returns`, { type: 'orders/advance', id: returnable.id })
const ask = (id: string, qty: number, who: 'staff' | 'shopper', reason: ReturnReason = 'damaged') =>
  ({
    type: 'returns/request' as const,
    id,
    orderId: returnable.id,
    items: [{ variantId: line.variantId, qty, reason }],
    note: `Golden ${id}`,
    who,
  })
run('returns/request refused too many', ask('ret-golden-0', 5, 'staff'))
run('returns/request shopper', ask('ret-golden-1', 1, 'shopper'), 'storefront')
run('returns/request refused open item', ask('ret-golden-x', 1, 'staff'))
run('returns/refund refused not received', { type: 'returns/refund', id: 'ret-golden-1', amount: 1000, note: '' })
run('returns/approve', { type: 'returns/approve', id: 'ret-golden-1', note: '' })
run('returns/receive restock', { type: 'returns/receive', id: 'ret-golden-1', restock: true })
run('returns/cancel refused received', { type: 'returns/cancel', id: 'ret-golden-1', note: '' })
// Pasal 71: a refund records how the money went back.
const transfer = { method: 'manual' as const, reference: 'TRF-GOLDEN-1', refundedOn: '2026-10-06' }
run('returns/refund capped', { type: 'returns/refund', id: 'ret-golden-1', amount: 100_000_000, note: 'Golden refund', ...transfer })
run('returns/request staff', ask('ret-golden-2', 2, 'staff', 'size_or_fit'))
run('returns/reject refused no reason', { type: 'returns/reject', id: 'ret-golden-2', reason: ' ' })
run('returns/reject', { type: 'returns/reject', id: 'ret-golden-2', reason: 'Worn and washed' })
run('returns/request after rejection', ask('ret-golden-3', 2, 'staff'))
run('returns/cancel', { type: 'returns/cancel', id: 'ret-golden-3', note: 'Shopper kept them' })
run('returns/request rest', ask('ret-golden-4', 3, 'staff', 'wrong_item'))
run('returns/approve rest', { type: 'returns/approve', id: 'ret-golden-4', note: 'Golden approval' })
run('returns/receive no restock', { type: 'returns/receive', id: 'ret-golden-4', restock: false })
run('returns/refund closes the order', { type: 'returns/refund', id: 'ret-golden-4', amount: 100_000_000, note: '', ...transfer })

// PP 80/2019 Pasal 69, added at the end. A brand with returns off still takes the legal reasons
// inside 2 working days and pays their return shipping; change of mind follows its own policy.
run('tenants/setShopSettings refused under the legal floor', shopSettings(1, []), 'usr-andi')
run('tenants/setShopSettings returns off', shopSettings(0, []), 'usr-andi')
const legal = fresh('ord-golden-r2', {
  lines: [line],
  subtotal: line.qty * line.price,
  discount: 0,
  total: line.qty * line.price + template.shipping,
})
run('orders/place for legal returns', { type: 'orders/place', order: legal, customer: null }, 'storefront')
for (const step of ['confirm', 'pay', 'process', 'pack', 'ship', 'deliver'])
  run(`orders/advance ${step} for legal returns`, { type: 'orders/advance', id: legal.id })
const askLegal = (id: string, qty: number, reason: ReturnReason) =>
  ({
    type: 'returns/request' as const,
    id,
    orderId: legal.id,
    items: [{ variantId: line.variantId, qty, reason }],
    note: '',
    who: 'shopper' as const,
  })
run('returns/request refused changed mind with returns off', askLegal('ret-golden-5', 1, 'changed_mind'), 'storefront')
run('returns/request late delivery with returns off', askLegal('ret-golden-6', 1, 'late_delivery'), 'storefront')
run('returns/approve late delivery', { type: 'returns/approve', id: 'ret-golden-6', note: '' })
run('returns/receive late delivery', { type: 'returns/receive', id: 'ret-golden-6', restock: true })
run('returns/refund refused without a transfer reference', {
  type: 'returns/refund',
  id: 'ret-golden-6',
  amount: 100_000_000,
  note: '',
  method: 'manual',
  reference: ' ',
  refundedOn: '2026-10-06',
})
run('returns/refund with return shipping', {
  type: 'returns/refund',
  id: 'ret-golden-6',
  amount: 100_000_000,
  note: '',
  shippingCost: 15_000,
  method: 'manual',
  reference: 'TRF-GOLDEN-6',
  refundedOn: '2026-10-07',
})
run('tenants/setShopSettings change of mind', shopSettings(14, []), 'usr-andi')
run('returns/request size or fit, shopper pays shipping', askLegal('ret-golden-7', 1, 'size_or_fit'), 'storefront')

// Personal data, added at the end so every case above keeps its output. A customer with sold orders,
// a ticket and a lead gives consent, then is erased; one with an order on its way cannot be.
const BEFORE_DELIVERY = ['new', 'confirmed', 'paid', 'processing', 'packed', 'shipped']
const ordersOf = (id: string) => state.orders.filter((o) => o.customerId === id)
const erasable = find(
  state.customers,
  (c) =>
    c.tenantId === lari &&
    ordersOf(c.id).length > 0 &&
    ordersOf(c.id).every((o) => !BEFORE_DELIVERY.includes(o.status)) &&
    !state.returns.some((r) => r.customerId === c.id) &&
    state.tickets.some((t) => t.customerId === c.id),
  'erasable customer',
)
const waiting = find(
  state.customers,
  (c) => c.tenantId === lari && ordersOf(c.id).some((o) => BEFORE_DELIVERY.includes(o.status)),
  'customer with an order on its way',
)
const consent = (id: string, granted: boolean, source: 'staff' | 'account') =>
  ({ type: 'customers/setConsent' as const, id, granted, source, textVersion: '2026-11' })
run('customers/setConsent', consent(erasable.id, true, 'staff'))
run('customers/setConsent refused unchanged', consent(erasable.id, true, 'staff'))
run('customers/save keeps consent', {
  type: 'customers/save',
  customer: { ...find(state.customers, (c) => c.id === erasable.id, 'customer'), name: 'Golden Rename', marketingConsent: undefined },
})
const privacyLead = find(state.leads, (l) => l.tenantId === lari, 'lead')
run('leads/save for erasure', {
  type: 'leads/save',
  lead: { ...privacyLead, id: 'lead-golden-privacy', customerId: erasable.id, note: 'Golden lead note' },
})
run('customers/note before erasure', { type: 'customers/note', id: erasable.id, note: 'Golden private note' })
run('customers/erase refused order on its way', { type: 'customers/erase', id: waiting.id, note: '' })
run('customers/erase', { type: 'customers/erase', id: erasable.id, note: 'Golden erasure' })
run('customers/erase refused twice', { type: 'customers/erase', id: erasable.id, note: '' })
run('customers/setConsent refused erased', consent(erasable.id, true, 'staff'))
run('customers/setConsent shopper', consent(waiting.id, true, 'account'), 'storefront')
run('customers/setConsent shopper withdraws', consent(waiting.id, false, 'account'), 'storefront')

// Seller identity, delivery days and complaints, added at the end so every case above keeps its output.
run('tenants/setLegal', {
  type: 'tenants/setLegal',
  tenantId: lari,
  legal: {
    entityName: ' PT Lari Nusantara ',
    businessType: 'pt',
    nib: '1234567890123',
    npwp: '01.234.567.8-901.000',
    address: 'Jl. Senopati 10, Jakarta Selatan',
    city: 'Jakarta Selatan',
    phone: '+62 21 555 0101',
    email: 'help@lari.co.id',
    hours: '',
    complaintDays: 5,
    disputeForum: 'bpsk',
  },
}, 'usr-andi')
run('tenants/setLegal refused', { type: 'tenants/setLegal', tenantId: lari, legal: { nib: '12345' } }, 'usr-andi')
run('tenants/setCourierEta', { type: 'tenants/setCourierEta', tenantId: lari, courierEtaDays: { jne: { min: 1, max: 2 }, pickup: { min: 0, max: 0 } } }, 'usr-andi')
run('tenants/setCourierEta refused', { type: 'tenants/setCourierEta', tenantId: lari, courierEtaDays: { jne: { min: 3, max: 1 } } }, 'usr-andi')
const contact = { name: ' Rina ', email: 'rina@example.com', phone: '' }
run('tickets/open guest', {
  type: 'tickets/open',
  complaint: { id: 'tic-golden-1', tenantId: lari, customerId: null, orderId: null, subject: ' Parcel arrived torn ', message: 'The box was open and one shoe is missing.', contact },
}, 'storefront')
const ownOrder = find(state.orders, (o) => o.tenantId === lari && !!o.customerId, 'order with a customer')
run('tickets/open own order', {
  type: 'tickets/open',
  complaint: { id: 'tic-golden-2', tenantId: lari, customerId: ownOrder.customerId, orderId: ownOrder.id, subject: 'Wrong size', message: 'I ordered 42 and got 40 instead.', contact },
}, 'storefront')
run('tickets/open refused for another order', {
  type: 'tickets/open',
  complaint: { id: 'tic-golden-3', tenantId: lari, customerId: null, orderId: ownOrder.id, subject: 'Wrong size', message: 'I ordered 42 and got 40 instead.', contact },
}, 'storefront')

const generated = new Set<string>()
const seedIds = new Set<string>()
for (const key of Object.keys(seedState()) as Collection[])
  for (const row of seedState()[key] as unknown[]) seedIds.add(idOf(key, row))
for (const c of cases)
  for (const rows of Object.values(c.upserts))
    for (const row of rows as { id?: string }[]) if (row.id && !seedIds.has(row.id)) generated.add(row.id)

const out = {
  fixtureNow: FIXTURE_NOW,
  note: 'Generated by scripts/api-golden.ts from the TypeScript reducer. Do not edit by hand.',
  cases,
}
const dir = dirname(fileURLToPath(import.meta.url))
const target = join(dir, '..', 'apps', 'api', 'testdata', 'golden.json')
writeFileSync(target, JSON.stringify(out, null, 1))
console.log(`golden: ${cases.length} cases, ${cases.filter((c) => Object.keys(c.upserts).length || Object.keys(c.removes).length).length} with changes → ${target}`)
void DAY

// The read models the API projects, as the demo derives them from the same seed. The API's
// readmodel parity test compares its projection with these rows.
const seeded = seedState()
const facts = deriveFacts(seeded.orders, seeded.customerEvents)
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
const readModels = {
  customerMetrics: byId(facts.customerMetrics),
  salesDays: byId(facts.salesDays),
  productDays: byId(facts.productDays),
  sellerBuyers: byId(facts.sellerBuyers),
}
const readModelTarget = join(dirname(target), 'readmodels.json')
writeFileSync(readModelTarget, JSON.stringify(readModels, null, 1))
console.log(`read models: ${Object.entries(readModels).map(([k, v]) => `${k} ${v.length}`).join(', ')} → ${readModelTarget}`)
