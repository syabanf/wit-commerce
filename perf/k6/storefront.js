// The shopper site: the store dataset with ETag revalidation, search and the search box suggestions.
import http from 'k6/http'
import { check } from 'k6'
import { Rate } from 'k6/metrics'
import { BASE, DURATION, STORE } from './lib.js'

const revalidated = new Rate('state_not_modified')

export const options = {
  scenarios: {
    state: { executor: 'constant-vus', vus: 10, duration: DURATION, exec: 'state' },
    search: { executor: 'constant-vus', vus: 5, duration: DURATION, exec: 'search' },
    suggest: { executor: 'constant-vus', vus: 5, duration: DURATION, exec: 'suggest' },
  },
  thresholds: {
    'http_req_failed{scenario:state}': ['rate==0'],
    'http_req_failed{scenario:search}': ['rate==0'],
    'http_req_failed{scenario:suggest}': ['rate==0'],
    'http_req_duration{name:GET /shop/state}': ['p(95)<500'],
    'http_req_duration{name:GET /shop/state 304}': ['p(95)<500'],
    'http_req_duration{name:GET /shop/search}': ['p(95)<600'],
    'http_req_duration{name:GET /shop/suggest}': ['p(95)<400'],
    // Nothing changes during the run, so every revalidation must answer 304.
    state_not_modified: ['rate==1'],
  },
}

export function state() {
  const first = http.get(`${BASE}/shop/${STORE}/state`, { tags: { name: 'GET /shop/state' } })
  const tag = first.headers['Etag']
  check(first, { 'state 200 with an ETag': (r) => r.status === 200 && !!tag })
  if (!tag) return
  // A 304 is not a failure; tell k6 so http_req_failed stays clean.
  const again = http.get(`${BASE}/shop/${STORE}/state`, {
    headers: { 'If-None-Match': tag },
    tags: { name: 'GET /shop/state 304' },
    responseCallback: http.expectedStatuses(200, 304),
  })
  revalidated.add(again.status === 304)
}

const TERMS = ['trail', 'sepatu lari', 'jaket', 'shoes', 'velocty', 'kaos wanita', 'socks', 'run']

export function search() {
  const q = TERMS[__ITER % TERMS.length]
  const sort = ['relevance', 'price_asc', 'best'][__ITER % 3]
  const res = http.get(`${BASE}/shop/${STORE}/search?q=${encodeURIComponent(q)}&sort=${sort}`, {
    tags: { name: 'GET /shop/search' },
  })
  check(res, { 'search 200': (r) => r.status === 200 })
}

export function suggest() {
  const q = TERMS[__ITER % TERMS.length].slice(0, 3)
  const res = http.get(`${BASE}/shop/${STORE}/suggest?q=${encodeURIComponent(q)}`, {
    tags: { name: 'GET /shop/suggest' },
  })
  check(res, { 'suggest 200': (r) => r.status === 200 })
}
