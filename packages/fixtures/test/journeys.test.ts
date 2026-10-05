import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Order, Page } from '../../types/src/index.ts'
import { FIXTURE_NOW } from '../src/clock.ts'
import { HOUR, toIso, toMs } from '../src/dates.ts'
import {
  attributeValueError,
  attributesFor,
  nextOrderStatus,
  segmentContext,
  segmentMembers,
  stockByProduct,
} from '../src/derive.ts'
import { seedState } from '../src/data.ts'
import { optionCombinations, priceCart } from '../src/pricing.ts'
import {
  campaignLaunchBlocker,
  categoryRemoveBlocker,
  orderPlaceBlocker,
  orderAdvanceBlocker,
  orderCancelBlocker,
  pagePublishBlocker,
  sellerTemplateBlocker,
} from '../src/rules.ts'
import { type AppAction, type AppState, audienceSize, reduce } from '../src/store.ts'

const at = (hoursAfterNow = 0) => toIso(toMs(FIXTURE_NOW) + hoursAfterNow * HOUR)
const run = (state: AppState, action: AppAction, by = 'usr-budi', hours = 0) =>
  reduce(state, { action, meta: { by, at: at(hours) } })
const order = (state: AppState, id: string) => state.orders.find((o) => o.id === id)!

function freshOrder(
  state: AppState,
  method: Order['paymentMethod'] = 'qris',
): { state: AppState; id: string } {
  const template = state.orders.find(
    (o) => o.tenantId === 'ten-lari' && o.status === 'completed' && o.lines.length === 1,
  )!
  const line = template.lines[0]!
  const level = state.stock.find(
    (s) => s.variantId === line.variantId && s.warehouseId === template.warehouseId,
  )!
  const id = 'ord-test-1'
  const next: Order = {
    ...template,
    id,
    code: 'LARI-TEST1',
    status: 'new',
    paymentStatus: 'pending',
    paymentMethod: method,
    createdAt: at(),
    trackingNo: null,
    refundedAmount: 0,
    cancelReason: null,
    events: [],
    lines: [{ ...line, qty: 1 }],
  }
  return {
    id,
    state: {
      ...state,
      orders: [...state.orders, next],
      stock: state.stock.map((s) =>
        s.id === level.id
          ? { ...s, onHand: Math.max(s.onHand, s.reserved + 5), reserved: s.reserved + 1 }
          : s,
      ),
    },
  }
}

describe('order journey', () => {
  it('moves a QRIS order from placed to completed and takes stock off the shelf when it ships', () => {
    const fresh = freshOrder(seedState())
    const { id } = fresh
    let { state } = fresh
    const line = order(state, id).lines[0]!
    const level = () =>
      state.stock.find(
        (s) => s.variantId === line.variantId && s.warehouseId === order(state, id).warehouseId,
      )!
    const before = level()
    const pointsBefore = state.customers.find((c) => c.id === order(state, id).customerId)!.points

    for (const expected of ['confirmed', 'paid', 'processing', 'packed'] as const) {
      state = run(state, { type: 'orders/advance', id })
      assert.equal(order(state, id).status, expected)
    }
    assert.equal(order(state, id).paymentStatus, 'paid')
    assert.equal(
      state.customers.find((c) => c.id === order(state, id).customerId)!.points,
      pointsBefore + order(state, id).pointsEarned,
    )
    assert.equal(level().onHand, before.onHand, 'stock stays on the shelf until the parcel ships')

    state = run(state, { type: 'orders/advance', id, trackingNo: 'JNE123' })
    assert.equal(order(state, id).status, 'shipped')
    assert.equal(order(state, id).trackingNo, 'JNE123')
    assert.equal(level().onHand, before.onHand - 1)
    assert.equal(level().reserved, before.reserved - 1)
    assert.ok(state.stockMoves.some((m) => m.kind === 'sale' && m.note === 'LARI-TEST1'))

    state = run(state, { type: 'orders/advance', id })
    state = run(state, { type: 'orders/advance', id })
    assert.equal(order(state, id).status, 'completed')
    assert.equal(nextOrderStatus(order(state, id)), null)
    assert.equal(orderAdvanceBlocker(order(state, id), state.stock), 'This order is closed.')
  })

  it('skips the paid step for cash on delivery and marks it paid on delivery', () => {
    const fresh = freshOrder(seedState(), 'cod')
    const { id } = fresh
    let { state } = fresh
    state = run(state, { type: 'orders/advance', id })
    state = run(state, { type: 'orders/advance', id })
    assert.equal(order(state, id).status, 'processing')
    assert.equal(order(state, id).paymentStatus, 'pending')
    for (let i = 0; i < 3; i++) state = run(state, { type: 'orders/advance', id, trackingNo: 'SC1' })
    assert.equal(order(state, id).status, 'delivered')
    assert.equal(order(state, id).paymentStatus, 'paid')
  })

  it('refuses to pack when the shelf holds fewer units than the order needs', () => {
    const fresh = freshOrder(seedState())
    const { id } = fresh
    let { state } = fresh
    for (let i = 0; i < 3; i++) state = run(state, { type: 'orders/advance', id })
    const o = order(state, id)
    const line = o.lines[0]!
    state = {
      ...state,
      stock: state.stock.map((s) =>
        s.variantId === line.variantId && s.warehouseId === o.warehouseId ? { ...s, onHand: 0 } : s,
      ),
    }
    assert.match(orderAdvanceBlocker(order(state, id), state.stock) ?? '', /Only 0 left/)
    const after = run(state, { type: 'orders/advance', id })
    assert.equal(order(after, id).status, 'processing')
  })

  it('cancels an unpaid order after 24 hours and releases its reservation', () => {
    const fresh = freshOrder(seedState())
    const { id } = fresh
    let { state } = fresh
    const line = order(state, id).lines[0]!
    const reserved = () =>
      state.stock.find(
        (s) => s.variantId === line.variantId && s.warehouseId === order(state, id).warehouseId,
      )!.reserved
    const held = reserved()
    state = run(state, { type: 'system/tick' }, 'system', 23)
    assert.equal(order(state, id).status, 'new')
    state = run(state, { type: 'system/tick' }, 'system', 25)
    assert.equal(order(state, id).status, 'cancelled')
    assert.equal(order(state, id).cancelReason, 'payment_expired')
    assert.equal(reserved(), held - 1)
  })

  it('turns a cancel into a refund once the order is paid, and blocks it after shipping', () => {
    const fresh = freshOrder(seedState())
    const { id } = fresh
    let { state } = fresh
    state = run(state, { type: 'orders/advance', id })
    state = run(state, { type: 'orders/advance', id })
    state = run(state, { type: 'orders/cancel', id, reason: 'customer_request', note: '' }, 'usr-sari')
    assert.equal(order(state, id).status, 'refunded')
    assert.equal(order(state, id).refundedAmount, order(state, id).total)

    const shipped = state.orders.find((o) => o.status === 'shipped')!
    assert.match(orderCancelBlocker(shipped) ?? '', /return/)
    assert.equal(
      order(
        run(state, { type: 'orders/cancel', id: shipped.id, reason: 'customer_request', note: '' }),
        shipped.id,
      ).status,
      'shipped',
    )
  })
})

describe('storefront and brand governance', () => {
  it('blocks publishing while a required section is hidden, then publishes and rolls back', () => {
    let state = seedState()
    const page = state.pages.find((p) => p.id === 'page-lari-runmonth')!
    const hero = page.sections.find((s) => s.kind === 'hero')!
    const hidden: Page['sections'] = page.sections.map((s) => (s.id === hero.id ? { ...s, hidden: true } : s))
    state = run(
      state,
      { type: 'pages/save', id: page.id, sections: hidden, note: 'Hid the hero' },
      'usr-maya',
    )
    const saved = state.pages.find((p) => p.id === page.id)!
    assert.match(pagePublishBlocker(saved) ?? '', /Hero section is required/)
    assert.equal(
      run(state, { type: 'pages/publish', id: page.id }, 'usr-maya').pages.find((p) => p.id === page.id)!
        .publishedAt,
      page.publishedAt,
    )

    state = run(
      state,
      { type: 'pages/rollback', id: page.id, revisionId: saved.revisions[1]!.id },
      'usr-maya',
    )
    assert.equal(pagePublishBlocker(state.pages.find((p) => p.id === page.id)!), null)
    state = run(state, { type: 'pages/publish', id: page.id }, 'usr-maya')
    assert.equal(state.pages.find((p) => p.id === page.id)!.status, 'published')
  })

  it('keeps seller content when the template changes, and only to an allowed template', () => {
    let state = seedState()
    const seller = state.sellers.find((s) => s.id === 'sel-fahmi')!
    const before = state.pages.find((p) => p.sellerId === seller.id)!
    assert.match(sellerTemplateBlocker(seller, 'tpl-luxury') ?? '', /not allowed/)
    assert.equal(
      run(state, { type: 'sellers/setTemplate', id: seller.id, templateId: 'tpl-luxury' }).sellers.find(
        (s) => s.id === seller.id,
      )!.templateId,
      seller.templateId,
    )

    state = run(
      state,
      { type: 'sellers/setTemplate', id: seller.id, templateId: 'tpl-specialist' },
      'usr-andi',
    )
    const after = state.pages.find((p) => p.sellerId === seller.id)!
    assert.equal(after.templateId, 'tpl-specialist')
    const copy = (p: Page, kind: string) => p.sections.find((s) => s.kind === kind)
    for (const kind of ['hero', 'featured_product', 'cta'])
      assert.deepEqual(
        copy(after, kind)?.headline,
        copy(before, kind)?.headline,
        `${kind} copy stays with the page`,
      )
    assert.deepEqual(
      copy(after, 'featured_product')?.productIds,
      copy(before, 'featured_product')?.productIds,
    )
    assert.ok(
      after.sections.some((s) => s.kind === 'comparison'),
      'the specialist template adds its comparison section',
    )
  })

  it('switches a page to another template and keeps its content by section kind', () => {
    const before = seedState()
    const page = before.pages.find((p) => p.id === 'page-lari-runmonth')!
    const state = run(
      before,
      { type: 'pages/setTemplate', id: page.id, templateId: 'tpl-launch' },
      'usr-maya',
    )
    const after = state.pages.find((p) => p.id === page.id)!
    assert.equal(after.templateId, 'tpl-launch')
    assert.deepEqual(
      after.sections.map((s) => s.kind),
      before.templates.find((t) => t.id === 'tpl-launch')!.sections.map((s) => s.kind),
    )
    const hero = (p: Page) => p.sections.find((s) => s.kind === 'hero')!
    assert.equal(hero(after).headline, hero(page).headline)
    assert.equal(after.revisions[0]!.note, 'Switched to Editorial Launch')
  })

  it('gives an invited seller a draft personal page and syncs featured products into it', () => {
    let state = seedState()
    const fahmi = state.sellers.find((s) => s.id === 'sel-fahmi')!
    state = run(
      state,
      { type: 'sellers/save', seller: { ...fahmi, featuredProductIds: ['prd-lr-110'] } },
      'usr-fahmi',
    )
    const fahmiPage = state.pages.find((p) => p.sellerId === fahmi.id)!
    assert.deepEqual(fahmiPage.sections.find((s) => s.kind === 'featured_product')!.productIds, [
      'prd-lr-110',
    ])

    const invited = {
      ...fahmi,
      id: 'sel-new',
      code: 'A-099',
      name: 'Tari Ayu',
      slug: 'tari',
      status: 'invited' as const,
      featuredProductIds: [],
    }
    state = run(state, { type: 'sellers/save', seller: invited }, 'usr-andi')
    const page = state.pages.find((p) => p.sellerId === 'sel-new')!
    assert.equal(page.status, 'draft')
    assert.equal(page.slug, '/tari')
    assert.equal(page.templateId, fahmi.templateId)
  })

  it('toggles a brand lock', () => {
    const state = run(
      seedState(),
      { type: 'brand/toggleLock', tenantId: 'ten-lari', key: 'headline' },
      'usr-andi',
    )
    assert.equal(state.tenants.find((t) => t.id === 'ten-lari')!.brand.locks.headline, true)
  })
})

describe('CRM and growth', () => {
  it('evaluates the Loyal runners segment from the spec rules', () => {
    const state = seedState()
    const own = <T extends { tenantId: string }>(list: T[]) => list.filter((x) => x.tenantId === 'ten-lari')
    const ctx = segmentContext(
      own(state.orders),
      own(state.products),
      own(state.customerEvents),
      toMs(FIXTURE_NOW),
    )
    const loyal = state.segments.find((s) => s.id === 'seg-lari-loyal')!
    for (const c of segmentMembers(loyal, own(state.customers), ctx)) {
      const m = ctx.metrics.get(c.id)!
      assert.ok(m.orders > 5 && m.spend > 10_000_000 && (m.daysSinceLast ?? 999) < 60)
    }
    const repeat = segmentMembers(
      state.segments.find((s) => s.id === 'seg-lari-repeat')!,
      own(state.customers),
      ctx,
    )
    assert.ok(repeat.length > 50)
  })

  it('refuses to launch a campaign without an audience, then launches with one', () => {
    let state = seedState()
    const draft = state.campaigns.find((c) => c.id === 'cmp-lari-vip')!
    assert.equal(campaignLaunchBlocker(draft, 0), 'Choose an audience segment.')
    assert.equal(
      run(state, { type: 'campaigns/launch', id: draft.id }, 'usr-maya').campaigns.find(
        (c) => c.id === draft.id,
      )!.status,
      'draft',
    )

    state = run(
      state,
      { type: 'campaigns/save', campaign: { ...draft, segmentId: 'seg-lari-repeat' } },
      'usr-maya',
    )
    assert.ok(audienceSize(state, 'ten-lari', 'seg-lari-repeat', toMs(FIXTURE_NOW)) > 0)
    state = run(state, { type: 'campaigns/launch', id: draft.id }, 'usr-maya')
    assert.equal(state.campaigns.find((c) => c.id === draft.id)!.status, 'scheduled')
  })

  it('moves a lead through the pipeline and needs a value before it is won', () => {
    let state = seedState()
    const lead = state.leads.find((l) => l.value === 0 && l.stage === 'new')!
    state = run(state, { type: 'leads/move', id: lead.id, stage: 'won' }, 'usr-rizky')
    assert.equal(state.leads.find((l) => l.id === lead.id)!.stage, 'new')
    state = run(state, { type: 'leads/save', lead: { ...lead, value: 925_000_000 } }, 'usr-rizky')
    state = run(state, { type: 'leads/move', id: lead.id, stage: 'qualified' }, 'usr-rizky')
    state = run(state, { type: 'leads/move', id: lead.id, stage: 'won' }, 'usr-rizky')
    assert.equal(state.leads.find((l) => l.id === lead.id)!.stage, 'won')
  })

  it('never lets an adjustment drop stock below what open orders reserve', () => {
    const state = seedState()
    const level = state.stock.find((s) => s.reserved > 0)!
    const after = run(state, {
      type: 'stock/adjust',
      levelId: level.id,
      delta: -(level.onHand - level.reserved + 1),
      note: 'count',
    })
    assert.equal(after.stock.find((s) => s.id === level.id)!.onHand, level.onHand)
    assert.ok(stockByProduct(after.stock).size > 0)
  })
})

describe('catalog setup', () => {
  it('applies attributes through the parent category and validates values by type', () => {
    const state = seedState()
    const road = state.products.find((p) => p.id === 'prd-lr-101')!
    const defs = attributesFor(road.categoryId, state.attributes, state.categories).map((d) => d.id)
    assert.ok(defs.includes('att-lari-drop'), 'drop is set on Shoes, the parent of Road running shoes')
    assert.ok(defs.includes('att-lari-plate'))
    assert.ok(!defs.includes('att-lari-fit'), 'fit belongs to apparel')
    const drop = state.attributes.find((a) => a.id === 'att-lari-drop')!
    assert.equal(attributeValueError(drop, 'eight'), 'Heel-to-toe drop takes a number in mm.')
    assert.equal(attributeValueError(drop, ''), 'Enter heel-to-toe drop.')
    assert.equal(attributeValueError(drop, '8'), null)
  })

  it('refuses to remove a category in use and strips a removed attribute from products', () => {
    let state = seedState()
    const road = state.categories.find((c) => c.id === 'cat-lari-road')!
    assert.match(
      categoryRemoveBlocker(road, state.products, state.categories) ?? '',
      /products use this category/,
    )
    assert.ok(
      run(state, { type: 'categories/remove', id: road.id }, 'usr-andi').categories.some(
        (c) => c.id === road.id,
      ),
    )
    const shoes = state.categories.find((c) => c.id === 'cat-lari-shoes')!
    assert.match(categoryRemoveBlocker(shoes, state.products, state.categories) ?? '', /sub-categories/)

    state = run(state, { type: 'attributes/remove', id: 'att-lari-plate' }, 'usr-andi')
    assert.ok(state.products.every((p) => !('att-lari-plate' in p.attributes)))
  })
})

describe('storefront checkout', () => {
  it('places a paid order for a new customer, reserves stock and counts the voucher', () => {
    let state = seedState()
    const template = state.orders.find(
      (o) => o.tenantId === 'ten-lari' && o.status === 'completed' && o.lines.length === 1,
    )!
    const line = template.lines[0]!
    const level = state.stock.find(
      (s) => s.variantId === line.variantId && s.warehouseId === template.warehouseId,
    )!
    state = {
      ...state,
      stock: state.stock.map((s) => (s.id === level.id ? { ...s, onHand: s.reserved + 3 } : s)),
    }
    const customer = {
      ...state.customers.find((c) => c.id === template.customerId)!,
      id: 'cus-shop-1',
      code: 'LARI-C99999',
      points: 0,
    }
    const order: Order = {
      ...template,
      id: 'ord-shop-1',
      code: 'LARI-WEB1',
      customerId: customer.id,
      status: 'paid',
      paymentStatus: 'paid',
      voucherCode: 'FREESHIP',
      events: [],
      lines: [{ ...line, qty: 2 }],
      refundedAmount: 0,
      cancelReason: null,
      trackingNo: null,
    }
    const usedBefore = state.promotions.find((p) => p.code === 'FREESHIP')!.used
    state = run(state, { type: 'orders/place', order, customer }, 'shopper')
    assert.ok(state.customers.some((c) => c.id === 'cus-shop-1' && c.points === order.pointsEarned))
    assert.equal(state.stock.find((s) => s.id === level.id)!.reserved, level.reserved + 2)
    assert.equal(state.promotions.find((p) => p.code === 'FREESHIP')!.used, usedBefore + 1)

    const greedy: Order = { ...order, id: 'ord-shop-2', lines: [{ ...line, qty: 5 }] }
    assert.match(orderPlaceBlocker(greedy, state.stock) ?? '', /Only 1 left/)
    assert.ok(
      !run(state, { type: 'orders/place', order: greedy, customer: null }).orders.some(
        (o) => o.id === 'ord-shop-2',
      ),
    )
  })
})

describe('pricing engine', () => {
  const state = seedState()
  const own = <T extends { tenantId: string }>(list: T[]) => list.filter((x) => x.tenantId === 'ten-lari')
  const now = toMs(FIXTURE_NOW)
  const line = (productId: string, qty: number) => {
    const p = state.products.find((x) => x.id === productId)!
    return { productId, categoryId: p.categoryId, qty, unitPrice: p.price }
  }
  const price = (
    lines: ReturnType<typeof line>[],
    code: string | null = null,
    paymentTypeId: string | null = null,
  ) =>
    priceCart({
      lines,
      promotions: own(state.promotions),
      categories: own(state.categories),
      code,
      paymentTypeId,
      sellerId: null,
      now,
    })

  it('gives the category discount only on lines in that category, capped', () => {
    const cart = price([line('prd-lr-101', 1), line('prd-lr-110', 1)], 'RUNMONTH15')
    const run = cart.discounts.find((d) => d.promotionId === 'promo-lari-runmonth')!
    assert.equal(run.amount, Math.min(Math.round(2_499_000 * 0.15), 400_000))
    const apparel = cart.discounts.find((d) => d.promotionId === 'promo-lari-apparel')!
    assert.equal(apparel.amount, Math.round(299_000 * 0.2), 'automatic apparel offer applies without a code')
  })

  it('gives buy 2 get 1 on socks and a payment-type discount only after picking QRIS', () => {
    const socks = price([line('prd-lr-115', 3)])
    assert.equal(socks.discounts.find((d) => d.promotionId === 'promo-lari-socks')!.amount, 149_000)
    assert.ok(socks.paymentOffers.some((p) => p.id === 'promo-lari-qris'))
    const withQris = price([line('prd-lr-115', 3)], null, 'pay-lari-qris')
    assert.ok(withQris.discounts.some((d) => d.promotionId === 'promo-lari-qris'))
  })

  it('explains why a nominal card offer does not apply yet', () => {
    const small = price([line('prd-lr-103', 1)], 'BCA150', 'pay-lari-card')
    assert.match(small.codeError ?? '', /Spend at least/)
    const big = price([line('prd-lr-101', 1)], 'BCA150', 'pay-lari-card')
    assert.equal(big.discounts.find((d) => d.promotionId === 'promo-lari-bca')!.amount, 150_000)
    assert.match(
      price([line('prd-lr-101', 1)], 'BCA150', 'pay-lari-qris').codeError ?? '',
      /another payment type/,
    )
  })

  it('builds every option combination for multi-option variants', () => {
    const shoe = state.products.find((p) => p.id === 'prd-lr-102')!
    assert.equal(shoe.variants.length, 6 * 3)
    assert.equal(optionCombinations(shoe.options).length, shoe.variants.length)
    assert.ok(shoe.variants.some((v) => v.name === '42 / Navy' && v.optionValues.Colour === 'Navy'))
  })
})
