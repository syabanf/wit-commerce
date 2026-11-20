import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { Order, TaxSettings } from '@rc/types'
import { seedState } from '../src/data.ts'
import { returnItemsPaid } from '../src/rules.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'
import { normalizeTax, orderTax, roundHalfUp, taxBlocker, taxProfileOf, withOrderTax } from '../src/tax.ts'

const AT = '2026-10-09T16:00:00+07:00'
const run = (state: AppState, action: AppAction) =>
  reduce(state, { action, meta: { by: 'usr-andi', at: AT } })

interface Case {
  name: string
  tax: TaxSettings
  discount: number
  lines: { productId: string; categoryId: string; qty: number; price: number }[]
  want: { lines: unknown[]; dpp: number; ppn: number }
}

// apps/api/internal/rules/tax_test.go answers the same file, so both sides charge the same rupiah.
const shared = JSON.parse(
  readFileSync(new URL('../../../apps/api/testdata/tax_cases.json', import.meta.url), 'utf8'),
) as { cases: Case[] }

describe('PPN per order', () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const category = new Map(c.lines.map((l) => [l.productId, l.categoryId]))
      const got = orderTax(c.lines, c.discount, c.tax, (id) => category.get(id))
      assert.deepEqual({ lines: got.lines, dpp: got.dpp, ppn: got.ppn }, c.want)
    })
  }

  it('charges 11% in effect on standard goods and 12% on luxury goods', () => {
    const one = (profile: TaxSettings['profile'], pricesIncludeTax: boolean, price: number) =>
      orderTax(
        [{ productId: 'p', qty: 1, price }],
        0,
        { pkp: true, pricesIncludeTax, profile },
        () => undefined,
      ).ppn
    assert.equal(one('standard', false, 1_000_000), 110_000)
    assert.equal(one('luxury', false, 1_000_000), 120_000)
    assert.equal(one('standard', true, 1_110_000), 110_000)
    assert.equal(one('luxury', true, 1_120_000), 120_000)
    assert.equal(one('exempt', false, 1_000_000), 0)
  })

  it('reconciles: the totals are the sums of the lines, and net plus PPN is what each line costs', () => {
    const lines = [
      { productId: 'a', qty: 3, price: 33_333 },
      { productId: 'b', qty: 1, price: 111_111 },
      { productId: 'c', qty: 7, price: 4_999 },
    ]
    for (const pricesIncludeTax of [true, false]) {
      const t = orderTax(lines, 12_345, { pkp: true, pricesIncludeTax, profile: 'standard' }, () => undefined)
      assert.equal(
        t.ppn,
        t.lines.reduce((n, l) => n + l.ppn, 0),
      )
      assert.equal(
        t.dpp,
        t.lines.reduce((n, l) => n + l.dpp, 0),
      )
      const goods = lines.reduce((n, l) => n + l.qty * l.price, 0) - 12_345
      const paid = t.lines.reduce((n, l) => n + l.net + (pricesIncludeTax ? l.ppn : 0), 0)
      assert.equal(paid, goods)
    }
  })

  it('rounds halves up', () => {
    assert.equal(roundHalfUp(0.5), 1)
    assert.equal(roundHalfUp(1.4999), 1)
    assert.equal(roundHalfUp(2.5), 3)
  })

  it('takes the product override, then the category override, then the default', () => {
    const tax: TaxSettings = {
      pkp: true,
      pricesIncludeTax: true,
      profile: 'standard',
      overrides: [
        { kind: 'category', id: 'c1', profile: 'luxury' },
        { kind: 'product', id: 'p1', profile: 'exempt' },
      ],
    }
    assert.equal(taxProfileOf(tax, 'p1', 'c1'), 'exempt')
    assert.equal(taxProfileOf(tax, 'p2', 'c1'), 'luxury')
    assert.equal(taxProfileOf(tax, 'p2', 'c2'), 'standard')
  })
})

describe('tax settings', () => {
  const legal = { npwp: '01.234.567.8-901.000' }
  it('turns PKP on only with an NPWP', () => {
    const tax: TaxSettings = { pkp: true, pricesIncludeTax: true, profile: 'standard' }
    assert.match(taxBlocker(tax, undefined) ?? '', /NPWP/)
    assert.equal(taxBlocker(tax, legal), null)
    assert.equal(taxBlocker({ ...tax, pkp: false }, undefined), null)
  })

  it('refuses rates and fractions out of range and repeated overrides', () => {
    const base: TaxSettings = { pkp: false, pricesIncludeTax: true, profile: 'standard' }
    assert.ok(taxBlocker({ ...base, ratePct: 0 }, legal))
    assert.ok(taxBlocker({ ...base, ratePct: 101 }, legal))
    assert.ok(taxBlocker({ ...base, dppNumerator: 11 }, legal))
    assert.ok(taxBlocker({ ...base, dppNumerator: 13, dppDenominator: 12 }, legal))
    assert.equal(taxBlocker({ ...base, ratePct: 11, dppNumerator: 1, dppDenominator: 1 }, legal), null)
    const twice = { kind: 'product' as const, id: 'p1', profile: 'exempt' as const }
    assert.ok(taxBlocker({ ...base, overrides: [twice, { ...twice, id: ' p1 ' }] }, legal))
  })

  it('drops an empty override list', () => {
    assert.deepEqual(normalizeTax({ pkp: false, pricesIncludeTax: true, profile: 'exempt', overrides: [] }), {
      pkp: false,
      pricesIncludeTax: true,
      profile: 'exempt',
    })
  })
})

describe('orders of a PKP brand', () => {
  const seeded = seedState()
  const tenant = seeded.tenants[0]!
  const order = seeded.orders.find((o) => o.tenantId === tenant.id && o.discount > 0 && o.shipping > 0)!
  const pkp = (pricesIncludeTax: boolean) => ({
    tax: { pkp: true, pricesIncludeTax, profile: 'standard' as const },
  })

  it('leave the order alone when the brand is not PKP', () => {
    assert.equal(withOrderTax(order, tenant, seeded.products), order)
    assert.equal(withOrderTax(order, { tax: { ...pkp(true).tax, pkp: false } }, seeded.products), order)
    const stray: Order = { ...order, tax: { ...orderTax(order.lines, 0, pkp(true).tax, () => undefined) } }
    assert.equal(withOrderTax(stray, tenant, seeded.products).tax, undefined)
  })

  it('keep what the shopper pays when prices include PPN', () => {
    const taxed = withOrderTax(order, pkp(true), seeded.products)
    assert.equal(taxed.total, order.total)
    assert.ok(taxed.tax && taxed.tax.ppn > 0)
  })

  it('add PPN to the total when prices exclude it, with no PPN on shipping', () => {
    const taxed = withOrderTax(order, pkp(false), seeded.products)
    assert.equal(taxed.total, order.subtotal - order.discount + taxed.tax!.ppn + order.shipping)
  })

  it('refund the PPN paid on top with the returned items', () => {
    const taxed = withOrderTax(order, pkp(false), seeded.products)
    const items = order.lines.map((l) => ({ variantId: l.variantId, qty: l.qty }))
    assert.equal(returnItemsPaid(taxed, items), order.subtotal - order.discount + taxed.tax!.ppn)
    assert.equal(returnItemsPaid(order, items), order.subtotal - order.discount)
  })

  it('keep the NPWP of a PKP and refuse PKP without one', () => {
    let state = run(seeded, {
      type: 'tenants/setLegal',
      tenantId: tenant.id,
      legal: { npwp: '01.234.567.8-901.000' },
    })
    state = run(state, { type: 'tenants/setTax', tenantId: tenant.id, tax: pkp(true).tax })
    assert.equal(state.tenants.find((t) => t.id === tenant.id)?.tax?.pkp, true)
    const after = run(state, { type: 'tenants/setLegal', tenantId: tenant.id, legal: {} })
    assert.equal(after, state)
  })
})
