import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Order } from '@rc/types'
import { HOUR, toIso, toMs } from '../src/dates.ts'
import { seedState } from '../src/data.ts'
import { paymentConfirmationBlocker, paymentWindowOpen, shopperPlacement } from '../src/payments.ts'
import { orderAdvanceBlocker, orderRefundBlocker } from '../src/rules.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'

const now = toMs('2026-10-05T09:41:00+07:00')
const at = (hours: number) => toIso(now + hours * HOUR)

/** A Lari order built by the browser as paid, as the old checkout did. */
const browserPaid = (): Order => {
  const base = seedState().orders.find(
    (o) => o.tenantId === 'ten-lari' && o.status === 'completed' && o.paymentMethod !== 'cod',
  )!
  return {
    ...base,
    id: 'ord-pay',
    code: 'LARI-9PAY1',
    status: 'paid',
    paymentStatus: 'paid',
    trackingNo: null,
    cancelReason: null,
    refundedAmount: 0,
    createdAt: at(0),
    voucherCode: null,
    discountLines: [],
    events: [
      { id: 'e2', at: at(0), by: 'storefront', status: 'paid', note: 'Paid' },
      { id: 'e1', at: at(0), by: 'storefront', status: 'new', note: 'Placed' },
    ],
  }
}

function run(state: AppState, action: AppAction, by = 'usr-budi', hours = 1) {
  return reduce(state, { action, meta: { by, at: at(hours) } })
}
const orderOf = (state: AppState) => state.orders.find((o) => o.id === 'ord-pay')!
const report = (amount: number) => ({ amount, channel: 'BCA', senderName: 'Rina', transferredAt: '2026-10-05T10:00' })

describe('payments', () => {
  it('places a shopper order unpaid, whatever the browser sent', () => {
    const placed = shopperPlacement(browserPaid(), browserPaid().createdAt)
    assert.equal(placed.status, 'confirmed')
    assert.equal(placed.paymentStatus, 'pending')
    assert.deepEqual(
      placed.events.map((e) => e.status),
      ['new'],
    )
    const state = run(seedState(), { type: 'orders/place', order: browserPaid(), customer: null }, 'storefront')
    assert.equal(orderOf(state).paymentStatus, 'pending')
    // Staff placing an order on a customer's behalf keep what they record.
    const staff = run(seedState(), { type: 'orders/place', order: browserPaid(), customer: null })
    assert.equal(orderOf(staff).paymentStatus, 'paid')
  })

  it('takes a payment confirmation, which only staff turn into a paid order', () => {
    let state = run(seedState(), { type: 'orders/place', order: browserPaid(), customer: null }, 'storefront')
    const order = orderOf(state)
    assert.equal(paymentConfirmationBlocker(order, { ...report(order.total), senderName: ' ' }), 'Enter the name on the account you paid from.')
    assert.equal(paymentConfirmationBlocker({ ...order, paymentMethod: 'cod' }, report(1)), 'Cash on delivery is paid to the courier.')
    state = run(state, { type: 'orders/submitPayment', id: order.id, confirmation: report(order.total) }, 'storefront', 2)
    assert.equal(orderOf(state).paymentConfirmation?.status, 'submitted')
    assert.equal(orderOf(state).paymentStatus, 'pending')
    assert.match(orderAdvanceBlocker(orderOf(state), state.stock)!, /payment confirmation first/)
    assert.equal(run(state, { type: 'orders/submitPayment', id: order.id, confirmation: report(1) }), state)

    state = run(state, { type: 'orders/rejectPayment', id: order.id, reason: 'No transfer' }, 'usr-budi', 3)
    assert.equal(orderOf(state).paymentConfirmation?.status, 'rejected')
    assert.equal(run(state, { type: 'orders/confirmPayment', id: order.id }), state)

    state = run(state, { type: 'orders/submitPayment', id: order.id, confirmation: report(order.total) }, 'storefront', 4)
    state = run(state, { type: 'orders/confirmPayment', id: order.id }, 'usr-budi', 5)
    const paid = orderOf(state)
    assert.equal(paid.status, 'paid')
    assert.equal(paid.paymentStatus, 'paid')
    assert.equal(paid.paymentConfirmation?.status, 'confirmed')
    assert.equal(paid.paymentConfirmation?.reviewedBy, 'usr-budi')
  })

  it('keeps the payment window open while staff check, and reopens it after a rejection', () => {
    const order = shopperPlacement(browserPaid(), browserPaid().createdAt)
    const window = 24 * HOUR
    assert.equal(paymentWindowOpen(order, now + 25 * HOUR, window), false)
    const checking: Order = {
      ...order,
      paymentConfirmation: { ...report(1), submittedAt: at(1), status: 'submitted' },
    }
    assert.equal(paymentWindowOpen(checking, now + 48 * HOUR, window), true)
    const rejected: Order = {
      ...checking,
      paymentConfirmation: { ...checking.paymentConfirmation!, status: 'rejected', reviewedAt: at(30) },
    }
    assert.equal(paymentWindowOpen(rejected, now + 40 * HOUR, window), true)
    assert.equal(paymentWindowOpen(rejected, now + 55 * HOUR, window), false)
  })

  it('cancels a paid order with the refund owed until staff record the transfer', () => {
    let state = run(seedState(), { type: 'orders/place', order: browserPaid(), customer: null })
    state = run(state, { type: 'orders/cancel', id: 'ord-pay', reason: 'out_of_stock', note: '' }, 'usr-budi', 2)
    let order = orderOf(state)
    assert.equal(order.status, 'cancelled')
    assert.equal(order.paymentStatus, 'paid')
    assert.deepEqual(order.cancelRefund, { amount: order.total, status: 'owed' })
    assert.match(orderRefundBlocker(order)!, /cancellation refund/)
    const noDate = { type: 'orders/refundCancelled' as const, id: 'ord-pay', reference: 'BCA-1', refundedOn: '' }
    assert.equal(run(state, noDate), state)
    state = run(state, { ...noDate, refundedOn: '2026-10-06' }, 'usr-budi', 3)
    order = orderOf(state)
    assert.equal(order.status, 'refunded')
    assert.equal(order.refundedAmount, order.total)
    assert.deepEqual(order.cancelRefund, {
      amount: order.total,
      status: 'succeeded',
      method: 'manual',
      reference: 'BCA-1',
      refundedOn: '2026-10-06',
    })
  })

  it('closes a cancelled paid order at once when the transfer proof comes with it', () => {
    let state = run(seedState(), { type: 'orders/place', order: browserPaid(), customer: null })
    const cancel = { type: 'orders/cancel' as const, id: 'ord-pay', reason: 'out_of_stock' as const, note: '' }
    assert.equal(run(state, { ...cancel, refundReference: 'BCA-2', refundedOn: '' }), state)
    state = run(state, { ...cancel, refundReference: 'BCA-2', refundedOn: '2026-10-06' })
    assert.equal(orderOf(state).status, 'refunded')
    assert.equal(orderOf(state).cancelRefund?.reference, 'BCA-2')
  })
})
