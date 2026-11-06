import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as before from './oracle/analytics-orders.ts'
import * as after from '../src/analytics.ts'
import { FIXTURE_NOW } from '../src/clock.ts'
import { seedState } from '../src/data.ts'
import { toMs } from '../src/dates.ts'
import { abandonedCheckouts, customerMetrics, segmentContextFromRows } from '../src/derive.ts'
import { deriveFacts } from '../src/facts.ts'

// The analytics now read facts (daily sales, product days, seller buyers, customer metrics). On the
// seed they must give exactly what the order-based versions gave, for every tenant and window.
const state = seedState()
const now = toMs(FIXTURE_NOW)

for (const tenant of state.tenants) {
  const own = <T extends { tenantId: string }>(rows: readonly T[]) => rows.filter((r) => r.tenantId === tenant.id)
  const orders = own(state.orders)
  const events = own(state.customerEvents)
  const sellers = own(state.sellers)
  const traffic = own(state.traffic)
  const leads = own(state.leads)
  const products = own(state.products)
  const facts = deriveFacts(orders, events)

  describe(`analytics on facts, ${tenant.name}`, () => {
    for (const days of [7, 14, 30, 90]) {
      it(`period KPIs and daily revenue over ${days} days`, () => {
        assert.deepEqual(
          after.periodKpis(facts.salesDays, facts.customerMetrics, traffic, days, now),
          before.periodKpis(orders, traffic, days, now),
        )
        assert.deepEqual(after.dailyRevenue(facts.salesDays, days, now), before.dailyRevenue(orders, days, now))
      })
      it(`seller and product performance over ${days} days`, () => {
        assert.deepEqual(
          after.sellerPerformance(sellers, facts.salesDays, facts.sellerBuyers, traffic, leads, days, now),
          before.sellerPerformance(sellers, orders, traffic, leads, days, now),
        )
        assert.deepEqual(
          after.productPerformance(products, facts.productDays, days, now),
          before.productPerformance(products, orders, days, now),
        )
      })
    }
    it('monthly revenue, cohorts, repeat rate and channel mix', () => {
      assert.deepEqual(after.monthlyRevenue(facts.salesDays, 12, now), before.monthlyRevenue(orders, 12, now))
      assert.deepEqual(after.cohorts(facts.customerMetrics, 6, 5, now), before.cohorts(orders, 6, 5, now))
      assert.equal(after.repeatRate(facts.customerMetrics), before.repeatRate(orders))
      assert.deepEqual(after.channelMix(facts.salesDays), before.channelMix(orders))
    })
    it('customer metrics and abandoned carts', () => {
      const category = new Map(products.map((p) => [p.id, p.categoryId]))
      const ctx = segmentContextFromRows(facts.customerMetrics, products, now)
      assert.deepEqual(ctx.metrics, customerMetrics(orders, (id) => category.get(id), now))
      assert.deepEqual(ctx.abandoned, abandonedCheckouts(events, now))
    })
  })
}
