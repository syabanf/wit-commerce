import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AssistantAction } from '@rc/api'
import {
  ACTION_PERMISSION,
  describeAction,
  startersFor,
  toAppAction,
} from '../../../apps/admin/src/assistant/lib.ts'
import { ROLE_PERMISSIONS } from '../src/permissions.ts'

const action = (type: AssistantAction['type'], params: AssistantAction['params']): AssistantAction => ({
  type,
  label: '',
  reason: '',
  params,
})

const weekend = action('promotions/save', {
  name: 'Weekend 10%',
  kind: 'percentage',
  value: 10,
  trigger: 'automatic',
  code: '',
  minSpend: 0,
  maxDiscount: 0,
  status: 'draft',
  startAt: '2026-10-10',
  endAt: '2026-10-11',
})

describe('assistant actions', () => {
  it('describes each change in one line', () => {
    assert.equal(
      describeAction(weekend),
      "Create promotion 'Weekend 10%' · 10% off · applies automatically · 10 Oct to 11 Oct · Draft",
    )
    assert.equal(
      describeAction(
        action('promotions/setStatus', {
          id: 'p',
          status: 'paused',
          name: 'Run month',
          code: 'RUN',
          from: 'active',
        }),
      ),
      "Pause promotion 'Run month' (RUN) · Active to Paused",
    )
    assert.equal(
      describeAction(
        action('stock/receive', {
          qty: 20,
          product: 'Velocity Pro 3',
          sku: 'LR-101',
          warehouse: 'Cikarang DC',
          onHand: 2,
        }),
      ),
      'Receive 20 units of Velocity Pro 3 (LR-101) at Cikarang DC · on hand 2 to 22',
    )
    assert.equal(
      describeAction(
        action('orders/advance', { id: 'o', code: 'LARI-10838', status: 'paid', nextStatus: 'processing' }),
      ),
      'Move order LARI-10838 from Paid to Processing',
    )
    assert.equal(
      describeAction(
        action('customers/note', { id: 'c', code: 'LARI-C10001', note: 'Called about sizing.' }),
      ),
      'Add a note to customer LARI-C10001: "Called about sizing."',
    )
  })

  it('builds the reducer action a confirmed card dispatches', () => {
    const now = Date.parse('2026-10-05T09:41:00+07:00')
    const save = toAppAction(weekend, { tenantId: 'ten-lari', promotionCodes: new Set(['WEEKEND10']), now })
    assert.equal(save.type, 'promotions/save')
    if (save.type !== 'promotions/save') return
    assert.equal(save.promotion.tenantId, 'ten-lari')
    assert.equal(save.promotion.status, 'draft')
    assert.equal(save.promotion.code, 'WEEKEND102', 'a new code does not repeat one in use')
    assert.equal(save.promotion.startAt.slice(0, 16), '2026-10-10T00:00')
    assert.equal(save.promotion.endAt.slice(0, 16), '2026-10-11T23:59')

    const live = toAppAction(
      { ...weekend, params: { ...weekend.params, status: 'active' } },
      {
        tenantId: 'ten-lari',
        promotionCodes: new Set(),
        now,
      },
    )
    assert.equal(live.type === 'promotions/save' && live.promotion.status, 'scheduled')

    assert.deepEqual(
      toAppAction(
        action('stock/receive', {
          productId: 'prd-1',
          variantId: 'var-1',
          warehouseId: 'wh-1',
          qty: 5,
          note: 'Restock',
          product: 'Shoe',
        }),
        { tenantId: 'ten-lari', promotionCodes: new Set(), now },
      ),
      {
        type: 'stock/receive',
        tenantId: 'ten-lari',
        productId: 'prd-1',
        variantId: 'var-1',
        warehouseId: 'wh-1',
        qty: 5,
        note: 'Restock',
      },
    )
  })

  it('hides order actions from marketing', () => {
    assert.ok(!ROLE_PERMISSIONS.marketing.includes(ACTION_PERMISSION['orders/advance']))
    assert.ok(ROLE_PERMISSIONS.marketing.includes(ACTION_PERMISSION['promotions/save']))
  })

  it('suggests questions for the page', () => {
    assert.deepEqual(startersFor('/'), [
      'What changed this week?',
      'What should I restock?',
      'Which orders are late?',
    ])
    assert.equal(startersFor('/commerce/orders/ord-1')[0], 'What is the next step for this order?')
    assert.equal(startersFor('/commerce/orders')[0], 'Which orders are late?')
  })
})
