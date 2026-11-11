import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DISPLAY_CURRENCIES,
  FALLBACK_RATES,
  convertFromIdr,
  fmtCurrency,
  minorUnits,
} from '../src/currency.ts'
import { seedState } from '../src/data.ts'
import { reduce } from '../src/store.ts'

describe('convertFromIdr', () => {
  it('rounds to two decimals for most currencies', () => {
    assert.equal(convertFromIdr(224_000, 0.000055364, 'USD'), 12.4)
    assert.equal(convertFromIdr(125_000, 0.000070773, 'SGD'), 8.85)
    assert.equal(convertFromIdr(125_000, 0.000049371, 'EUR'), 6.17)
  })

  it('rounds yen to whole units', () => {
    assert.equal(minorUnits('JPY'), 0)
    assert.equal(convertFromIdr(125_000, 0.0087573, 'JPY'), 1095)
  })

  it('keeps zero at zero', () => {
    assert.equal(convertFromIdr(0, 0.000055364, 'USD'), 0)
  })

  it('has a fallback rate for every display currency', () => {
    for (const code of DISPLAY_CURRENCIES) assert.ok(FALLBACK_RATES[code] > 0, code)
  })
})

describe('formatting', () => {
  it('writes the symbol shoppers expect', () => {
    assert.equal(fmtCurrency(12.4, 'USD'), 'US$12.40')
    assert.equal(fmtCurrency(1095, 'JPY'), 'JP¥1,095')
    assert.equal(fmtCurrency(6.17, 'EUR'), '€6.17')
    assert.equal(fmtCurrency(9.5, 'GBP'), '£9.50')
  })

  it("formats a converted amount to the currency's minor units", () => {
    assert.equal(fmtCurrency(convertFromIdr(224_000, 0.000055364, 'USD'), 'USD'), 'US$12.40')
    assert.equal(fmtCurrency(convertFromIdr(125_000, 0.0087573, 'JPY'), 'JPY'), 'JP¥1,095')
  })
})

describe('tenants/setDisplayCurrencies', () => {
  const meta = { by: 'usr-andi', at: '2026-10-05T10:00:00+07:00' }
  const tenantOf = (state: ReturnType<typeof seedState>) => state.tenants.find((t) => t.id === 'ten-lari')!

  it('saves the codes once each, and an empty list drops the field', () => {
    const set = reduce(seedState(), {
      action: {
        type: 'tenants/setDisplayCurrencies',
        tenantId: 'ten-lari',
        currencies: ['USD', 'JPY', 'USD'],
      },
      meta,
    })
    assert.deepEqual(tenantOf(set).displayCurrencies, ['USD', 'JPY'])
    const cleared = reduce(set, {
      action: { type: 'tenants/setDisplayCurrencies', tenantId: 'ten-lari', currencies: [] },
      meta,
    })
    assert.equal('displayCurrencies' in tenantOf(cleared), false)
  })

  it('refuses an unknown code', () => {
    const before = seedState()
    const after = reduce(before, {
      action: { type: 'tenants/setDisplayCurrencies', tenantId: 'ten-lari', currencies: ['USD', 'IDR'] },
      meta,
    })
    assert.equal(after, before)
  })
})
