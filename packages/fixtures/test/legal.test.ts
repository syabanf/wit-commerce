import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedState } from '../src/data.ts'
import {
  addWorkingDays,
  complaintBlocker,
  courierEta,
  courierEtaBlocker,
  etaLabel,
  legalBlocker,
  legalMissing,
  normalizeLegal,
  termsVersion,
} from '../src/legal.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'

const AT = '2026-10-09T16:00:00+07:00'
const run = (state: AppState, action: AppAction) =>
  reduce(state, { action, meta: { by: 'usr-andi', at: AT } })

describe('terms version', () => {
  // apps/api/internal/rules/legal_test.go pins the same values, so both sides agree on a consent.
  // Enabled payment types of the brand count; a disabled one and another brand's do not.
  const pays = [
    { tenantId: 'ten-lari', name: 'QRIS', method: 'qris', enabled: true },
    { tenantId: 'ten-lari', name: 'Bayar di tempat', method: 'cod', enabled: true },
    { tenantId: 'ten-lari', name: 'Kartu kredit', method: 'credit_card', enabled: false },
    { tenantId: 'ten-other', name: 'Transfer BCA', method: 'bank_transfer', enabled: true },
  ] as const

  it('matches the API for the same tenant', () => {
    const tenant = {
      id: 'ten-lari',
      name: 'Lari.',
      returnWindowDays: 14,
      courierEtaDays: { pickup: { min: 0, max: 0 }, jne: { min: 1, max: 2 } },
      legal: {
        entityName: 'PT Lari Nusantara',
        address: 'Jl. Senopati 10 · Kebayoran Baru',
        complaintDays: 5,
      },
    }
    assert.equal(termsVersion(tenant, pays), '1.11fdac78')
    assert.equal(termsVersion({ name: 'Lari.' }, []), '1.098c9bd5')
  })

  it('changes when an enabled payment type changes, whatever the list order', () => {
    const tenant = { id: 'ten-lari', name: 'Lari.' }
    assert.equal(termsVersion(tenant, pays), termsVersion(tenant, [...pays].reverse()))
    assert.notEqual(termsVersion(tenant, pays), termsVersion(tenant, pays.slice(1)))
    assert.equal(termsVersion(tenant, pays), termsVersion(tenant, pays.slice(0, 3)))
  })

  it('changes when the return window or the legal details change', () => {
    const base = { name: 'Lari.', legal: { city: 'Bandung' } }
    assert.notEqual(termsVersion(base, []), termsVersion({ ...base, returnWindowDays: 10 }, []))
    assert.notEqual(termsVersion(base, []), termsVersion({ ...base, legal: { city: 'Bogor' } }, []))
  })
})

describe('working days', () => {
  it('skips Saturday and Sunday in WIB', () => {
    assert.equal(addWorkingDays('2026-10-09T16:00:00+07:00', 3), '2026-10-14T16:00:00+07:00')
    assert.equal(addWorkingDays('2026-10-10T10:00:00+07:00', 1), '2026-10-12T10:00:00+07:00')
  })
})

describe('legal details', () => {
  it('normalizes and checks the identity fields', () => {
    assert.deepEqual(normalizeLegal({ entityName: ' PT Lari ', address: '  ', nib: '1234567890123' }), {
      entityName: 'PT Lari',
      nib: '1234567890123',
    })
    assert.equal(legalBlocker({ nib: '123' }), 'The NIB has 13 digits.')
    assert.equal(legalBlocker({ npwp: '01.234.567.8-901.000' }), null)
    assert.equal(
      legalBlocker({ complaintDays: 31 }),
      'Set the complaint resolution time between 1 and 30 working days.',
    )
    assert.deepEqual(legalMissing({ legal: { entityName: 'PT Lari', nib: '1234567890123' } }), [
      'Business type',
      'Registered address',
      'Customer service phone',
      'Customer service email',
      'Service hours',
    ])
  })

  it('saves through the reducer and drops an empty record', () => {
    let state = seedState()
    state = run(state, {
      type: 'tenants/setLegal',
      tenantId: 'ten-lari',
      legal: { entityName: ' PT Lari ', nib: 'x' },
    })
    assert.equal(state.tenants.find((t) => t.id === 'ten-lari')!.legal, undefined)
    state = run(state, { type: 'tenants/setLegal', tenantId: 'ten-lari', legal: { entityName: ' PT Lari ' } })
    assert.deepEqual(state.tenants.find((t) => t.id === 'ten-lari')!.legal, { entityName: 'PT Lari' })
    state = run(state, { type: 'tenants/setLegal', tenantId: 'ten-lari', legal: { entityName: ' ' } })
    assert.equal('legal' in state.tenants.find((t) => t.id === 'ten-lari')!, false)
  })
})

describe('delivery estimates', () => {
  it('falls back to the platform default and labels the window', () => {
    assert.deepEqual(courierEta({}, 'jne'), { min: 2, max: 3 })
    assert.deepEqual(courierEta({ courierEtaDays: { jne: { min: 1, max: 1 } } }, 'jne'), { min: 1, max: 1 })
    assert.equal(etaLabel({ min: 0, max: 0 }), 'Same day')
    assert.equal(etaLabel({ min: 1, max: 1 }), '1 day')
    assert.equal(etaLabel({ min: 2, max: 4 }), '2 to 4 days')
    assert.notEqual(courierEtaBlocker({ jne: { min: 3, max: 2 } }), null)
    assert.equal(courierEtaBlocker({ jne: { min: 1, max: 2 } }), null)
  })
})

describe('complaints', () => {
  const contact = { name: 'Rina', email: 'rina@example.com', phone: '' }
  const complaint = {
    id: 'tic-t1',
    tenantId: 'ten-lari',
    customerId: null,
    orderId: null,
    subject: 'Torn parcel',
    message: 'The box arrived open.',
    contact,
  }

  it('needs a subject, a message and a way to reply', () => {
    assert.equal(complaintBlocker(complaint), null)
    assert.equal(
      complaintBlocker({ ...complaint, contact: { ...contact, email: '' } }),
      'Leave an email or a phone number so we can reply.',
    )
    assert.equal(
      complaintBlocker({ ...complaint, message: 'short' }),
      'Describe the problem in 10 to 2000 characters.',
    )
  })

  it('opens a complaint ticket due in the brand complaint days', () => {
    const state = run(seedState(), { type: 'tickets/open', complaint })
    const ticket = state.tickets.find((t) => t.id === 'tic-t1')!
    assert.equal(ticket.code, 'LARI-T0001')
    assert.equal(ticket.kind, 'complaint')
    assert.equal(ticket.channel, 'web')
    assert.equal(ticket.slaDueAt, '2026-10-14T16:00:00+07:00')
  })

  it('refuses an order that is not the shopper own', () => {
    const order = seedState().orders.find((o) => o.tenantId === 'ten-lari')!
    const before = seedState()
    const after = run(before, { type: 'tickets/open', complaint: { ...complaint, orderId: order.id } })
    assert.equal(after, before)
  })
})
