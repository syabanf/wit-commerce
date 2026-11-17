import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Order } from '@rc/types'
import { DAY, toIso, toMs } from '../src/dates.ts'
import { seedState } from '../src/data.ts'
import {
  legalReturnDeadline,
  orderFullyReturned,
  returnRefundCap,
  returnRefundProofBlocker,
  returnRefundSplit,
  returnRequestBlocker,
  returnShippingPayer,
  returnableQty,
} from '../src/rules.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'

const delivered = (at: number): Order => {
  const base = seedState().orders.find((o) => o.tenantId === 'ten-lari' && o.status === 'completed')!
  const line = { ...base.lines[0]!, qty: 3, price: 100_000 }
  return {
    ...base,
    id: 'ord-ret',
    status: 'delivered',
    lines: [line],
    subtotal: 300_000,
    discount: 30_000,
    shipping: 20_000,
    total: 290_000,
    refundedAmount: 0,
    paymentStatus: 'paid',
    events: [{ id: 'e1', at: toIso(at), by: 'x', status: 'delivered', note: 'Delivered' }],
  }
}

describe('returns', () => {
  const now = toMs('2026-10-05T09:41:00+07:00')
  const order = delivered(now - 2 * DAY)
  const variantId = order.lines[0]!.variantId
  const item = (qty: number) => [{ variantId, qty, reason: 'damaged' as const }]
  const transfer = { method: 'manual' as const, reference: 'TRF-1', refundedOn: '2026-10-06' }

  it('holds shoppers to the return window and delivered orders', () => {
    assert.equal(returnRequestBlocker(order, [], item(1), 'shopper', now, 7), null)
    assert.equal(
      returnRequestBlocker(order, [], item(1), 'shopper', now + 6 * DAY, 7),
      'The 7-day return window for this order has closed.',
    )
    assert.match(
      returnRequestBlocker({ ...order, status: 'shipped' }, [], item(1), 'shopper', now, 7)!,
      /delivered/,
    )
    assert.equal(returnRequestBlocker({ ...order, status: 'shipped' }, [], item(1), 'staff', now, 7), null)
    // Returns off stops change of mind; a damaged item still gets its legal window (Pasal 69).
    const changedMind = [{ variantId, qty: 1, reason: 'changed_mind' as const }]
    assert.match(returnRequestBlocker(order, [], changedMind, 'shopper', now, 0)!, /Contact the store/)
    assert.equal(returnRequestBlocker(order, [], item(1), 'shopper', now, 0), null)
  })

  it('caps the refund at what the items cost after the discount, and at what is left', () => {
    // One of three units: 100,000 less its 10 percent share of the discount. Shipping stays.
    assert.equal(returnRefundCap(order, { items: item(1) }), 90_000)
    assert.equal(returnRefundCap({ ...order, refundedAmount: 250_000 }, { items: item(3) }), 40_000)
  })

  it('turns the order returned once refunded returns cover every unit', () => {
    let state: AppState = { ...seedState(), orders: [order] }
    const run = (action: AppAction) => {
      state = reduce(state, { action, meta: { by: 'usr-andi', at: toIso(now) } })
    }
    const request = (id: string, qty: number): AppAction => ({
      type: 'returns/request',
      id,
      orderId: order.id,
      items: item(qty),
      note: '',
      who: 'staff',
    })
    run(request('r1', 2))
    run(request('r2', 2))
    assert.equal(state.returns.length, 1, 'a second open return on the same item is refused')
    assert.equal(returnableQty(order, state.returns).get(variantId), 1)
    for (const id of ['r1']) {
      run({ type: 'returns/approve', id, note: '' })
      run({ type: 'returns/receive', id, restock: true })
      run({ type: 'returns/refund', id, amount: 1_000_000, note: '', ...transfer })
    }
    assert.equal(state.orders[0]!.status, 'delivered')
    assert.equal(state.orders[0]!.refundedAmount, 180_000)
    run(request('r3', 1))
    run({ type: 'returns/approve', id: 'r3', note: '' })
    run({ type: 'returns/receive', id: 'r3', restock: false })
    run({ type: 'returns/refund', id: 'r3', amount: 1_000_000, note: '', ...transfer })
    assert.equal(state.orders[0]!.status, 'returned')
    assert.ok(orderFullyReturned(state.orders[0]!, state.returns))
    assert.equal(state.returns.find((r) => r.id === 'r3')!.code, 'LARI-R0002')
  })

  // The same cases run against the Go rules in apps/api/internal/rules/returns_test.go.
  it('counts 2 working days after delivery in WIB', () => {
    const cases: [string, string][] = [
      ['2026-10-05T10:00:00+07:00', '2026-10-07T23:59:59.999+07:00'],
      ['2026-10-08T10:00:00+07:00', '2026-10-12T23:59:59.999+07:00'],
      ['2026-10-09T18:00:00+07:00', '2026-10-13T23:59:59.999+07:00'],
      ['2026-10-10T09:00:00+07:00', '2026-10-13T23:59:59.999+07:00'],
      ['2026-10-09T23:30:00+07:00', '2026-10-13T23:59:59.999+07:00'],
      ['2026-10-10T00:30:00+07:00', '2026-10-13T23:59:59.999+07:00'],
    ]
    for (const [delivered, want] of cases)
      assert.equal(legalReturnDeadline(toMs(delivered)), toMs(want), delivered)
  })

  it('takes the legal reasons inside the legal window whatever the brand set', () => {
    const friday = delivered(toMs('2026-10-09T18:00:00+07:00'))
    const v = friday.lines[0]!.variantId
    const ask = (
      reason: Parameters<typeof returnShippingPayer>[0][number]['reason'],
      at: string,
      window: number,
    ) => returnRequestBlocker(friday, [], [{ variantId: v, qty: 1, reason }], 'shopper', toMs(at), window)
    const monday = '2026-10-12T12:00:00+07:00'
    const wednesday = '2026-10-14T08:00:00+07:00'
    const off = 'This store takes change-of-mind and fit returns by message. Contact the store.'
    const cases: [Parameters<typeof ask>[0], string, number, string | null][] = [
      ['late_delivery', monday, 0, null],
      ['hidden_defect', monday, 0, null],
      ['expired', monday, 0, null],
      ['changed_mind', monday, 0, off],
      ['size_or_fit', monday, 0, off],
      ['damaged', wednesday, 0, 'The 2-working-day return window for this order has closed.'],
      ['damaged', '2026-10-13T20:00:00+07:00', 3, null],
      ['changed_mind', '2026-10-13T20:00:00+07:00', 3, 'The 3-day return window for this order has closed.'],
      ['changed_mind', wednesday, 14, null],
      ['wrong_item', '2026-10-24T08:00:00+07:00', 14, 'The 14-day return window for this order has closed.'],
    ]
    for (const [reason, at, window, want] of cases)
      assert.equal(ask(reason, at, window), want, `${reason} ${at}`)
  })

  it("puts return shipping on the brand unless every reason is the shopper's own choice", () => {
    const payer = (...reasons: Parameters<typeof returnShippingPayer>[0][number]['reason'][]) =>
      returnShippingPayer(reasons.map((reason) => ({ reason })))
    assert.equal(payer('damaged'), 'brand')
    assert.equal(payer('late_delivery'), 'brand')
    assert.equal(payer('changed_mind'), 'shopper')
    assert.equal(payer('changed_mind', 'size_or_fit'), 'shopper')
    assert.equal(payer('size_or_fit', 'expired'), 'brand')
  })

  it('adds return shipping only when the brand pays it, and needs proof the money moved', () => {
    const o = {
      ...delivered(now),
      lines: [{ ...order.lines[0]!, qty: 2 }],
      subtotal: 200_000,
      discount: 0,
      total: 220_000,
    }
    const items = [{ variantId, qty: 1, reason: 'damaged' as const }]
    assert.deepEqual(returnRefundSplit(o, { items, shippingPaidBy: 'brand' }, 1_000_000, 15_000), {
      items: 100_000,
      shipping: 15_000,
    })
    assert.deepEqual(returnRefundSplit(o, { items, shippingPaidBy: 'shopper' }, 1_000_000, 15_000), {
      items: 100_000,
      shipping: 0,
    })
    assert.deepEqual(
      returnRefundSplit(
        { ...o, refundedAmount: 110_000 },
        { items, shippingPaidBy: 'brand' },
        1_000_000,
        15_000,
      ),
      { items: 100_000, shipping: 10_000 },
    )
    assert.equal(returnRefundProofBlocker({ reference: 'TRF-1', refundedOn: '2026-10-06' }), null)
    assert.match(
      returnRefundProofBlocker({ method: 'manual', reference: ' ', refundedOn: '2026-10-06' })!,
      /transfer reference/,
    )
    assert.match(returnRefundProofBlocker({ method: 'manual', reference: 'TRF-1' })!, /date/)
    assert.equal(returnRefundProofBlocker({ method: 'midtrans', reference: 'ret-1-1' }), null)
    assert.match(returnRefundProofBlocker({ method: 'midtrans' })!, /no refund reference/)
  })

  it('refuses a refund without proof and records the transfer', () => {
    let state: AppState = { ...seedState(), orders: [order] }
    const run = (action: AppAction) => {
      state = reduce(state, { action, meta: { by: 'usr-andi', at: toIso(now) } })
    }
    run({ type: 'returns/request', id: 'r1', orderId: order.id, items: item(1), note: '', who: 'staff' })
    assert.equal(state.returns[0]!.shippingPaidBy, 'brand')
    run({ type: 'returns/approve', id: 'r1', note: '' })
    run({ type: 'returns/receive', id: 'r1', restock: false })
    run({ type: 'returns/refund', id: 'r1', amount: 1_000_000, note: '' })
    assert.equal(state.returns[0]!.status, 'received', 'no reference, no refund')
    run({ type: 'returns/refund', id: 'r1', amount: 1_000_000, note: '', shippingCost: 12_000, ...transfer })
    const ret = state.returns[0]!
    assert.equal(ret.status, 'refunded')
    assert.equal(ret.refundAmount, 102_000)
    assert.equal(ret.refundShipping, 12_000)
    assert.equal(ret.refundReference, 'TRF-1')
    assert.equal(ret.refundedOn, '2026-10-06')
  })
})
