// The customers screens: the paged list, a search, a filtered view, and the summary figures.
import http from 'k6/http'
import { check } from 'k6'
import { BASE, DURATION, TENANT, USERS, auth, login } from './lib.js'

export const options = {
  scenarios: {
    views: { executor: 'constant-vus', vus: 5, duration: DURATION, exec: 'views' },
    summary: { executor: 'constant-vus', vus: 5, duration: DURATION, exec: 'summary' },
  },
  thresholds: {
    'http_req_failed{scenario:views}': ['rate==0'],
    'http_req_failed{scenario:summary}': ['rate==0'],
    'http_req_duration{name:GET /views/customers}': ['p(95)<3000'],
    'http_req_duration{name:GET /views/customer-summary}': ['p(95)<300'],
  },
}

export function setup() {
  return { admin: login(USERS.tenantAdmin) }
}

const QUERIES = ['', '&q=wahyu', '&view=repeat&sort=spend', '&tier=gold', '&view=at-risk']

export function views(data) {
  const query = QUERIES[__ITER % QUERIES.length]
  const res = http.get(
    `${BASE}/views/customers?tenantId=${TENANT}&pageSize=50${query}`,
    auth(data.admin, 'GET /views/customers'),
  )
  check(res, { 'customers 200': (r) => r.status === 200 })
}

export function summary(data) {
  const res = http.get(
    `${BASE}/views/customer-summary?tenantId=${TENANT}&rewards=500,1000,2000`,
    auth(data.admin, 'GET /views/customer-summary'),
  )
  check(res, { 'summary 200': (r) => r.status === 200 })
}
