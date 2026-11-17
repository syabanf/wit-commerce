import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedState } from '../src/data.ts'
import {
  ERASED_NAME,
  consentBlocker,
  customerEraseBlocker,
  marketingAllowed,
  marketingReach,
} from '../src/privacy.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'

const at = '2026-10-05T09:41:00+07:00'
const act = (state: AppState, action: AppAction, by = 'usr-andi') =>
  reduce(state, { action, meta: { by, at } })

const closedCustomer = (state: AppState) =>
  state.customers.find(
    (c) =>
      c.tenantId === 'ten-lari' &&
      state.orders.some((o) => o.customerId === c.id) &&
      state.orders
        .filter((o) => o.customerId === c.id)
        .every((o) => ['delivered', 'completed', 'cancelled', 'refunded', 'returned'].includes(o.status)) &&
      state.tickets.some((t) => t.customerId === c.id),
  )!

describe('personal data', () => {
  it('erases the customer and their free text, and keeps order amounts', () => {
    const before = seedState()
    const c = closedCustomer(before)
    const noted = act(before, { type: 'customers/note', id: c.id, note: `Call ${c.name} at ${c.phone}` })
    const after = act(noted, { type: 'customers/erase', id: c.id, note: '' })
    const erased = after.customers.find((x) => x.id === c.id)!
    assert.equal(erased.name, ERASED_NAME)
    assert.equal(erased.email, '')
    assert.equal(erased.phone, '')
    assert.equal(erased.erasedAt, at)
    assert.equal(erased.code, c.code)
    const text = JSON.stringify([
      after.customers.filter((x) => x.id === c.id),
      after.customerEvents.filter((e) => e.customerId === c.id),
      after.tickets.filter((t) => t.customerId === c.id),
      after.orders.filter((o) => o.customerId === c.id),
    ])
    for (const value of [c.email, c.phone, c.name]) assert.ok(!text.includes(value), `${value} survived`)
    const totals = (s: AppState) => s.orders.filter((o) => o.customerId === c.id).map((o) => o.total)
    assert.deepEqual(totals(after), totals(before))
    assert.ok(after.customerEvents.some((e) => e.customerId === c.id && e.label === 'Personal data erased'))
    assert.equal(act(after, { type: 'customers/erase', id: c.id, note: '' }), after)
  })

  it('waits for orders on their way and open returns', () => {
    const c = seedState().customers[0]!
    assert.match(
      customerEraseBlocker(c, [{ code: 'LARI-1', status: 'shipped' }], [])!,
      /Deliver or cancel LARI-1/,
    )
    assert.match(customerEraseBlocker(c, [], [{ code: 'RET-1', status: 'approved' }])!, /Close return RET-1/)
    assert.equal(customerEraseBlocker(c, [{ code: 'LARI-1', status: 'delivered' }], []), null)
  })

  it('records consent with its source and wording, and an edit cannot forge it', () => {
    const state = seedState()
    const c = state.customers.find((x) => x.tenantId === 'ten-lari')!
    assert.equal(marketingAllowed(c), false)
    const consent = { type: 'customers/setConsent' as const, id: c.id, source: 'checkout' as const }
    const granted = act(state, { ...consent, granted: true, textVersion: '2026-11' }, 'storefront')
    const agreed = granted.customers.find((x) => x.id === c.id)!
    assert.deepEqual(agreed.marketingConsent, {
      granted: true,
      at,
      source: 'checkout',
      textVersion: '2026-11',
    })
    assert.equal(act(granted, { ...consent, granted: true, textVersion: '2026-11' }), granted)

    const forged = act(state, {
      type: 'customers/save',
      customer: { ...c, marketingConsent: agreed.marketingConsent },
    })
    assert.equal(forged.customers.find((x) => x.id === c.id)!.marketingConsent, undefined)
    const edited = act(granted, { type: 'customers/save', customer: { ...c, name: 'Renamed' } })
    assert.deepEqual(edited.customers.find((x) => x.id === c.id)!.marketingConsent, agreed.marketingConsent)

    const withdrawn = act(granted, { ...consent, source: 'unsubscribe', granted: false, textVersion: '' })
    const after = withdrawn.customers.find((x) => x.id === c.id)!
    assert.equal(after.marketingConsent?.granted, false)
    assert.equal(after.marketingConsent?.textVersion, '2026-11')
    assert.equal(withdrawn.customerEvents[0]!.label, 'Withdrew marketing consent · unsubscribe')
  })

  it('skips customers without consent from marketing', () => {
    const customers = seedState().customers.slice(0, 3)
    const one = {
      ...customers[0]!,
      marketingConsent: { granted: true, at, source: 'account' as const, textVersion: 'v' },
    }
    const { reach, skipped } = marketingReach([one, customers[1]!, customers[2]!])
    assert.deepEqual(
      reach.map((c) => c.id),
      [one.id],
    )
    assert.equal(skipped, 2)
    assert.equal(
      consentBlocker(one, true, 'account', 'v'),
      'This customer already agreed to marketing messages.',
    )
    assert.equal(
      consentBlocker(customers[1]!, true, 'account', ' '),
      'Name the wording the shopper agreed to.',
    )
  })
})
