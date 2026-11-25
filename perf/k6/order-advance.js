// Thirty staff sessions move different open orders to their next step at once. Payment and delivery
// recompute the same day's sales facts and customer metrics; this is the load that used to answer 500
// when two transactions collided. Every advance must succeed.
import http from 'k6/http'
import { check, fail } from 'k6'
import exec from 'k6/execution'
import { BASE, USERS, auth, jsonAuth, login } from './lib.js'

const ORDERS = Number(__ENV.ADVANCE_ORDERS || 300)
const STEPS = ['new', 'confirmed', 'paid', 'packed', 'shipped']

export const options = {
  scenarios: {
    advance: { executor: 'shared-iterations', vus: 30, iterations: ORDERS, maxDuration: '2m' },
  },
  thresholds: {
    'http_req_failed{name:POST /orders/advance}': ['rate==0'],
    'http_req_duration{name:POST /orders/advance}': ['p(95)<3000'],
  },
}

export function setup() {
  const token = login(USERS.tenantAdmin)
  const res = http.get(`${BASE}/state`, auth(token, 'GET /state'))
  if (res.status !== 200) fail(`state answered ${res.status}`)
  // Every step but packing, which checks stock, and none with a shopper's payment report to settle.
  const ids = res
    .json('state.orders')
    .filter((o) => STEPS.includes(o.status) && o.paymentConfirmation?.status !== 'submitted')
    .map((o) => o.id)
  if (ids.length < ORDERS) fail(`only ${ids.length} orders can advance; lower ADVANCE_ORDERS`)
  return { token, ids: ids.slice(0, ORDERS) }
}

export default function (data) {
  const id = data.ids[exec.scenario.iterationInTest]
  const res = http.post(`${BASE}/orders/${id}/advance`, null, jsonAuth(data.token, 'POST /orders/advance'))
  check(res, { advanced: (r) => r.status === 200 })
  if (res.status !== 200) console.error(`advance ${id}: ${res.status} ${res.body}`)
}
