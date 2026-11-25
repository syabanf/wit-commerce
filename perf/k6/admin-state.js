// GET /state, the console's dataset at sign-in, for a tenant admin and a sales user at once.
import http from 'k6/http'
import { check } from 'k6'
import { Trend } from 'k6/metrics'
import { BASE, DURATION, USERS, auth, login } from './lib.js'

const stateBytes = new Trend('state_bytes')

export const options = {
  scenarios: {
    tenant_admin: {
      executor: 'constant-vus',
      vus: 5,
      duration: DURATION,
      exec: 'tenantAdmin',
      tags: { role: 'tenant_admin' },
    },
    sales: { executor: 'constant-vus', vus: 5, duration: DURATION, exec: 'sales', tags: { role: 'sales' } },
  },
  thresholds: {
    'http_req_failed{scenario:tenant_admin}': ['rate==0'],
    'http_req_failed{scenario:sales}': ['rate==0'],
    'http_req_duration{scenario:tenant_admin}': ['p(95)<2000'],
    'http_req_duration{scenario:sales}': ['p(95)<1500'],
    // Uncompressed: what the browser parses and holds.
    'state_bytes{role:tenant_admin}': ['max<3000000'],
    'state_bytes{role:sales}': ['max<3000000'],
  },
}

export function setup() {
  return { admin: login(USERS.tenantAdmin), sales: login(USERS.sales) }
}

function readState(token, role) {
  const res = http.get(`${BASE}/state`, { ...auth(token, 'GET /state'), responseType: 'binary' })
  check(res, { 'state 200': (r) => r.status === 200 })
  if (res.status === 200) stateBytes.add(res.body.byteLength, { role })
}

export function tenantAdmin(data) {
  readState(data.admin, 'tenant_admin')
}

export function sales(data) {
  readState(data.sales, 'sales')
}
