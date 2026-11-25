import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { ApiError } from '@rc/api'
import {
  complaintBlocker,
  consentBlocker,
  orderPlaceBlocker,
  paymentConfirmationBlocker,
  returnCancelBlocker,
  returnRequestBlocker,
  seedState,
  toIso,
  toMs,
} from '@rc/fixtures'
import type { ModifierGroup, Order } from '@rc/types'
import { chooseLanguage } from '../src/i18n'
import { en } from '../src/i18n/en'
import { id } from '../src/i18n/id'
import {
  REFUSAL_CODES,
  REFUSAL_PATTERNS,
  REFUSAL_SENTENCES,
  problemText,
  refusalText,
} from '../src/i18n/refusals'

const DAY = 86_400_000
const now = toMs('2026-10-05T09:41:00+07:00')
const state = seedState()
const base = state.orders.find((o) => o.tenantId === 'ten-lari' && o.status === 'completed')!
const line = base.lines[0]!
const product = state.products.find((p) => p.variants.some((v) => v.id === line.variantId))!

/** A Lari order with one line of `qty`, waiting for payment by transfer. */
const order = (qty: number, extra: Partial<Order> = {}): Order => ({
  ...base,
  id: 'ord-ref',
  status: 'new',
  paymentStatus: 'pending',
  paymentMethod: 'transfer',
  paymentConfirmation: undefined,
  lines: [{ ...line, qty }],
  ...extra,
})
const stockOf = (onHand: number, reserved: number) => [
  { variantId: line.variantId, warehouseId: base.warehouseId, onHand, reserved },
]
const physical = [{ ...product, type: 'physical' as const }]
const delivered = order(2, {
  status: 'delivered',
  paymentStatus: 'paid',
  events: [{ id: 'e1', at: toIso(now - 2 * DAY), by: 'x', status: 'delivered', note: 'Delivered' }],
})
const wrap: ModifierGroup[] = [
  { options: [{ id: 'opt-wrap', name: 'Gift wrap', stockTracked: true }] } as unknown as ModifierGroup,
]
const item = (qty: number, reason: 'damaged' | 'changed_mind' = 'damaged') => [
  { variantId: line.variantId, qty, reason },
]
const payment = { amount: 100_000, channel: 'BCA', senderName: 'Rina', transferredAt: '2026-10-05 09:00' }
const contact = { name: 'Rina', email: 'rina@example.com', phone: '' }
const customer = state.customers.find((c) => c.tenantId === 'ten-lari')!

/** What the shared rules really return for shopper actions the storefront and the shop routes check. */
const ruleOutputs = [
  orderPlaceBlocker(order(1, { lines: [] }), []),
  orderPlaceBlocker(order(1), [], [], [], physical),
  orderPlaceBlocker(order(3), stockOf(5, 3)),
  orderPlaceBlocker(order(3), stockOf(5, 5)),
  orderPlaceBlocker(
    order(2, {
      lines: [{ ...line, qty: 2, modifiers: [{ optionId: 'opt-wrap' }] } as Order['lines'][number]],
    }),
    stockOf(9, 0),
    [{ optionId: 'opt-wrap', warehouseId: base.warehouseId, onHand: 1, reserved: 0 }],
    wrap,
  ),
  returnRequestBlocker(order(1), [], item(1), 'shopper', now, 7),
  returnRequestBlocker(delivered, [], [], 'shopper', now, 7),
  returnRequestBlocker(
    delivered,
    [],
    [{ variantId: 'var-none', qty: 1, reason: 'damaged' }],
    'shopper',
    now,
    7,
  ),
  returnRequestBlocker(delivered, [], [...item(1), ...item(1)], 'shopper', now, 7),
  returnRequestBlocker(delivered, [], item(0), 'shopper', now, 7),
  returnRequestBlocker(delivered, [], item(3), 'shopper', now, 7),
  returnRequestBlocker(delivered, [], item(1), 'shopper', now + 10 * DAY, 7),
  returnRequestBlocker(delivered, [], item(1, 'changed_mind'), 'shopper', now, 0),
  returnRequestBlocker(delivered, [], item(1), 'shopper', now + 10 * DAY, 0),
  returnCancelBlocker({ status: 'received' }),
  paymentConfirmationBlocker(order(1, { paymentMethod: 'cod' }), payment),
  paymentConfirmationBlocker(order(1, { paymentStatus: 'paid' }), payment),
  paymentConfirmationBlocker(order(1), { ...payment, amount: 0 }),
  paymentConfirmationBlocker(order(1), { ...payment, channel: ' ' }),
  paymentConfirmationBlocker(order(1), { ...payment, senderName: '' }),
  paymentConfirmationBlocker(order(1), { ...payment, transferredAt: '' }),
  paymentConfirmationBlocker(order(1), { ...payment, proofUrl: 'https://elsewhere/x.png' }),
  complaintBlocker({ subject: 'Hi', message: 'The parcel arrived torn.', contact }),
  complaintBlocker({ subject: 'Torn parcel', message: 'Torn', contact }),
  complaintBlocker({
    subject: 'Torn parcel',
    message: 'The parcel arrived torn.',
    contact: { ...contact, name: '' },
  }),
  complaintBlocker({
    subject: 'Torn parcel',
    message: 'The parcel arrived torn.',
    contact: { ...contact, email: '' },
  }),
  complaintBlocker({
    subject: 'Torn parcel',
    message: 'The parcel arrived torn.',
    contact: { ...contact, email: 'x' },
  }),
  complaintBlocker({
    subject: 'Torn parcel',
    message: 'The parcel arrived torn.',
    contact: { ...contact, phone: '12' },
  }),
  consentBlocker({ ...customer, erasedAt: toIso(now) }, true, 'account', 'v1'),
  consentBlocker(customer, true, 'elsewhere' as never, 'v1'),
  consentBlocker(customer, true, 'account', ' '),
].filter((why): why is string => why !== null)

/** Go source of the API, without tests: every fixed sentence must still be written there. */
function goSource(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((path) =>
      statSync(path).isDirectory()
        ? goSource(path)
        : path.endsWith('.go') && !path.endsWith('_test.go')
          ? readFileSync(path, 'utf8')
          : '',
    )
    .join('\n')
}

const keys = [
  ...Object.values(REFUSAL_SENTENCES),
  ...REFUSAL_PATTERNS.map(([, key]) => key),
  ...Object.values(REFUSAL_CODES),
]

test('every refusal key has English and Indonesian text', () => {
  for (const key of keys) {
    assert.ok(en[key]?.trim(), `en ${key}`)
    assert.ok(id[key]?.trim(), `id ${key}`)
    assert.notEqual(id[key], en[key], `${key} is not translated`)
  }
})

test('English shoppers read the server sentence word for word', () => {
  for (const [sentence, key] of Object.entries(REFUSAL_SENTENCES)) assert.equal(en[key], sentence)
})

test('each mapped sentence is still what the API writes, so a reworded rule fails here', () => {
  const go = goSource(new URL('../../api/internal', import.meta.url).pathname)
  for (const sentence of Object.keys(REFUSAL_SENTENCES))
    assert.ok(go.includes(sentence), `the API no longer writes: ${sentence}`)
})

test('every shopper refusal the shared rules return is mapped, in both languages', () => {
  assert.ok(ruleOutputs.length >= 30, `only ${ruleOutputs.length} rule outputs`)
  for (const why of ruleOutputs) {
    chooseLanguage('en')
    assert.equal(refusalText(why), why, why)
    chooseLanguage('id')
    assert.notEqual(refusalText(why), why, `not translated: ${why}`)
  }
})

test('real refusals read in Bahasa Indonesia', () => {
  chooseLanguage('id')
  assert.equal(
    refusalText('One item just sold out. Remove it to continue.'),
    'Salah satu barang baru saja habis. Hapus barang itu untuk lanjut.',
  )
  assert.equal(
    refusalText('Only 2 left of one item. Lower the quantity to continue.'),
    'Salah satu barang hanya tersisa 2. Kurangi jumlahnya untuk lanjut.',
  )
  assert.equal(
    refusalText('Gift wrap has only 1 left. Lower the quantity or choose another option.'),
    'Gift wrap hanya tersisa 1. Kurangi jumlahnya atau pilih opsi lain.',
  )
  assert.equal(
    refusalText('The 7-day return window for this order has closed.'),
    'Batas retur 7 hari untuk pesanan ini sudah lewat.',
  )
  assert.equal(refusalText('order not found'), 'Pesanan tidak ditemukan.')
  const problem = (status: number, code: string, detail: string) => new ApiError({ status, code, detail })
  assert.equal(
    problemText(problem(429, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.')),
    'Terlalu banyak percobaan. Coba lagi dalam satu menit.',
  )
  assert.equal(
    problemText(problem(401, 'BAD_CREDENTIALS', 'That email and password do not match.')),
    'Email dan kata sandi tidak cocok.',
  )
  // A sentence the map does not know falls back to its code, then to the server's own words.
  assert.equal(
    problemText(problem(429, 'RATE_LIMITED', 'Slow down.')),
    'Terlalu banyak percobaan. Coba lagi dalam satu menit.',
  )
  assert.equal(
    problemText(problem(502, 'HTTP_502', 'Bad Gateway')),
    'Toko tidak merespons. Coba lagi sebentar lagi.',
  )
  assert.equal(problemText(problem(409, 'REFUSED', 'Something new.')), 'Something new.')
  assert.equal(problemText(new Error('offline')), 'Toko tidak merespons. Coba lagi sebentar lagi.')
  chooseLanguage('en')
  assert.equal(
    problemText(problem(503, 'BUSY', 'Too many sign-ins at once. Try again in a few seconds.')),
    'Too many sign-ins at once. Try again in a few seconds.',
  )
})
