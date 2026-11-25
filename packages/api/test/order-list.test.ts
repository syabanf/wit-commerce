import assert from 'node:assert/strict'
import { it } from 'node:test'
import { seedState } from '../../fixtures/src/data.ts'
import { fromListItem } from '../src/orderList.ts'

// What GET /state leaves out of an open order must come back as the same value.
it('puts back the null, zero and empty values a list item leaves out', () => {
  for (const order of seedState().orders) {
    const item: Record<string, unknown> = {
      ...order,
      events: order.events.filter((e) => e.status === 'shipped'),
    }
    for (const [key, value] of Object.entries(item)) {
      if (value === null || value === 0 || (Array.isArray(value) && key === 'events' && !value.length))
        delete item[key]
    }
    const whole = fromListItem(item)
    for (const key of ['sellerId', 'campaignId', 'trackingNo', 'voucherCode', 'cancelReason'] as const) {
      assert.equal(whole[key], order[key], `${order.id} ${key}`)
    }
    for (const key of [
      'discount',
      'shipping',
      'refundedAmount',
      'pointsEarned',
      'total',
      'subtotal',
    ] as const) {
      assert.equal(whole[key], order[key], `${order.id} ${key}`)
    }
    assert.deepEqual(whole.lines, order.lines)
    assert.deepEqual(
      whole.events,
      order.events.filter((e) => e.status === 'shipped'),
    )
  }
})
