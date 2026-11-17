import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Order } from '@rc/types'
import { DAY, toIso, toMs } from '../src/dates.ts'
import { seedState } from '../src/data.ts'
import { orderFullyReturned, returnRefundCap, returnRequestBlocker, returnableQty } from '../src/rules.ts'
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
    assert.match(returnRequestBlocker(order, [], item(1), 'shopper', now, 0)!, /Contact the store/)
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
      run({ type: 'returns/refund', id, amount: 1_000_000, note: '' })
    }
    assert.equal(state.orders[0]!.status, 'delivered')
    assert.equal(state.orders[0]!.refundedAmount, 180_000)
    run(request('r3', 1))
    run({ type: 'returns/approve', id: 'r3', note: '' })
    run({ type: 'returns/receive', id: 'r3', restock: false })
    run({ type: 'returns/refund', id: 'r3', amount: 1_000_000, note: '' })
    assert.equal(state.orders[0]!.status, 'returned')
    assert.ok(orderFullyReturned(state.orders[0]!, state.returns))
    assert.equal(state.returns.find((r) => r.id === 'r3')!.code, 'LARI-R0002')
  })
})
