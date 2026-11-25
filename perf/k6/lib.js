// Shared helpers for the k6 profiles. BASE_URL is the API origin (no /api/v1), STORE the store slug,
// TENANT its tenant id, and PASSWORD the demo password every seeded staff user signs in with.
import http from 'k6/http'
import { fail } from 'k6'

export const BASE = `${__ENV.BASE_URL || 'http://localhost:8090'}/api/v1`
export const STORE = __ENV.STORE || 'lari'
export const TENANT = __ENV.TENANT || 'ten-lari'
const PASSWORD = __ENV.PASSWORD || 'perf-demo-pass'

export const USERS = {
  tenantAdmin: __ENV.ADMIN_EMAIL || 'andi@lari.co.id',
  sales: __ENV.SALES_EMAIL || 'fahmi@lari.co.id',
}

/** Signs a staff user in once, in setup(), and returns the bearer token. */
export function login(email) {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  })
  if (res.status !== 200) fail(`sign-in for ${email} answered ${res.status}: ${res.body}`)
  return res.json('token')
}

export const auth = (token, name) => ({ headers: { Authorization: `Bearer ${token}` }, tags: { name } })

export const jsonAuth = (token, name) => ({
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  tags: { name },
})

/** Duration of each profile; DURATION=10s gives a quick smoke run. */
export const DURATION = __ENV.DURATION || '30s'
