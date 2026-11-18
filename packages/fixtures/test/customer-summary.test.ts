import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIXTURE_NOW } from '../src/clock.ts'
import { buyerFigures, buyersSince, customerSummary, nextCustomerColor } from '../src/customers.ts'
import { lifetimeValue } from '../src/analytics.ts'
import { seedState } from '../src/data.ts'
import { DAY, dayKey, toMs } from '../src/dates.ts'
import { segmentContextFromRows, segmentMembers } from '../src/derive.ts'
import { deriveFacts } from '../src/facts.ts'
import { nextCode } from '../src/ids.ts'

// The console no longer holds every customer with the API, so the figures that summed them come
// from one summary. On the seed it must give what the pages computed from the whole list.
const state = seedState()
const now = toMs(FIXTURE_NOW)
const REWARDS = [500, 1000, 2500]

for (const tenant of state.tenants) {
  const own = <T extends { tenantId: string }>(rows: readonly T[]) => rows.filter((r) => r.tenantId === tenant.id)
  const customers = own(state.customers)
  const products = own(state.products)
  const segments = own(state.segments)
  const facts = deriveFacts(own(state.orders), own(state.customerEvents))
  const summary = customerSummary({
    customers,
    metrics: facts.customerMetrics,
    segments,
    products,
    tenantCode: tenant.code,
    rewards: REWARDS,
    now,
  })
  const ctx = segmentContextFromRows(facts.customerMetrics, products, now)

  describe(`customer summary, ${tenant.name}`, () => {
    it('counts customers by tier, stage and seller as the lists did', () => {
      assert.equal(summary.total, customers.length)
      for (const c of customers) {
        assert.ok((summary.byTier[c.tier] ?? 0) > 0)
        assert.ok((summary.byStage[c.stage] ?? 0) > 0)
      }
      const tiers = Object.values(summary.byTier).reduce((a, b) => a + b, 0)
      assert.equal(tiers, customers.length)
      assert.equal(summary.newIn30, customers.filter((c) => toMs(c.createdAt) >= now - 30 * DAY).length)
      for (const [seller, n] of Object.entries(summary.bySeller)) {
        assert.equal(n, customers.filter((c) => c.sellerId === seller).length)
      }
    })
    it('ranks points and counts who can redeem each reward', () => {
      assert.equal(summary.points, customers.reduce((n, c) => n + c.points, 0))
      assert.deepEqual(
        summary.top.map((c) => c.id),
        [...customers].sort((a, b) => b.points - a.points).slice(0, 8).map((c) => c.id),
      )
      assert.deepEqual(
        summary.redeemable,
        REWARDS.map((min) => customers.filter((c) => c.points >= min).length),
      )
    })
    it('sizes segments and abandoned carts from the metrics rows', () => {
      for (const seg of segments) assert.equal(summary.segments[seg.id], segmentMembers(seg, customers, ctx).length)
      assert.equal(summary.abandoned, ctx.abandoned.size)
    })
    it('sums buyers, lifetime value and the days they bought', () => {
      const buyers = facts.customerMetrics.filter((m) => m.orders > 0)
      assert.equal(summary.buyers.buyers, buyers.length)
      assert.equal(summary.buyers.repeatBuyers, buyers.filter((m) => m.orders > 1).length)
      let spend = 0
      for (const m of ctx.metrics.values()) spend += m.spend
      assert.deepEqual(lifetimeValue(summary.buyers), { value: spend / ctx.metrics.size, buyers: ctx.metrics.size })
      const from = dayKey(now - 29 * DAY)
      assert.equal(
        buyersSince(summary.buyers.lastDays, from),
        buyers.filter((m) => dayKey(toMs(m.lastAt!)) >= from).length,
      )
      assert.deepEqual(buyerFigures(facts.customerMetrics), summary.buyers)
    })
    it('suggests the next code, colour, cities and tags', () => {
      assert.equal(
        summary.nextCode,
        nextCode(
          customers.map((c) => c.code),
          `${tenant.code}-C`,
          5,
        ),
      )
      const palette = [...new Set(customers.map((c) => c.color))]
      assert.equal(nextCustomerColor(summary, '#000'), palette[customers.length % palette.length])
      assert.deepEqual(summary.tags, [...new Set(customers.flatMap((c) => c.tags))].sort())
      assert.equal(new Set(summary.cities).size, new Set(customers.map((c) => c.city).filter(Boolean)).size)
    })
  })
}
