import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedState } from '../src/data.ts'
import { domainProblem, domainRecords, newDomainToken } from '../src/domains.ts'
import { reduce } from '../src/store.ts'
import { customDomain, storeHost, storeOrigin } from '../src/storeUrl.ts'

const meta = { by: 'usr-andi', at: '2026-10-05T10:00:00+07:00' }
const teknika = (state: ReturnType<typeof seedState>) => state.tenants.find((t) => t.id === 'ten-teknika')!
const setDomain = (domain: string | null, token = 'wit-verify-test') => ({
  type: 'tenants/setDomain' as const,
  tenantId: 'ten-teknika',
  domain,
  token,
})

describe('domainProblem', () => {
  it('accepts public hostnames', () => {
    for (const ok of ['www.tokosaya.com', 'tokosaya.co.id', 'xn--80ak6aa92e.com'])
      assert.equal(domainProblem(ok), null, ok)
  })
  it('refuses IPs, private names, paths and the platform', () => {
    for (const bad of [
      '',
      'TokoSaya.com',
      'tokosaya',
      '203.0.113.5',
      'tokosaya.com:8443',
      'http://tokosaya.com',
      'localhost',
      'shop.localhost',
      'store.test',
      'lari.commerce.reddie.id',
      'www.commerce.reddie.id',
    ])
      assert.notEqual(domainProblem(bad), null, bad)
    assert.notEqual(domainProblem('admin.example.com', ['example.com']), null)
  })
})

describe('tenants/setDomain and tenants/verifyDomain', () => {
  it('connects unverified with the token, and verifies', () => {
    const set = reduce(seedState(), { action: setDomain('www.teknika-store.com'), meta })
    assert.equal(teknika(set).domain, 'www.teknika-store.com')
    assert.equal(teknika(set).domainVerified, false)
    assert.equal(teknika(set).domainToken, 'wit-verify-test')
    const verified = reduce(set, { action: { type: 'tenants/verifyDomain', tenantId: 'ten-teknika' }, meta })
    assert.equal(teknika(verified).domainVerified, true)
    assert.equal(teknika(verified).domainVerifiedAt, meta.at)
    assert.equal(customDomain(teknika(verified)), 'www.teknika-store.com')
  })

  it('refuses invalid and taken domains, and a verify without a domain', () => {
    const state = seedState()
    assert.equal(reduce(state, { action: setDomain('localhost'), meta }), state)
    assert.equal(reduce(state, { action: setDomain('aruna.id'), meta }), state)
    assert.equal(reduce(state, { action: setDomain('www.aruna.id'), meta }), state)
    assert.equal(reduce(state, { action: setDomain('new.com', ''), meta }), state)
    const verify = reduce(state, { action: { type: 'tenants/verifyDomain', tenantId: 'ten-teknika' }, meta })
    assert.equal(teknika(verify), teknika(state))
  })

  it('starts over on a new domain and clears everything on disconnect', () => {
    let state = reduce(seedState(), { action: setDomain('www.teknika-store.com'), meta })
    state = reduce(state, { action: { type: 'tenants/verifyDomain', tenantId: 'ten-teknika' }, meta })
    const same = reduce(state, { action: setDomain('www.teknika-store.com', 'other'), meta })
    assert.equal(same, state)
    const moved = reduce(state, { action: setDomain('teknika-store.com', 'second'), meta })
    assert.equal(teknika(moved).domainVerified, false)
    assert.equal('domainVerifiedAt' in teknika(moved), false)
    assert.equal(teknika(moved).domainToken, 'second')
    const gone = reduce(moved, { action: setDomain(null), meta })
    assert.equal(teknika(gone).domain, null)
    assert.equal('domainToken' in teknika(gone), false)
  })
})

describe('store links', () => {
  const lari = { subdomain: 'lari', domain: 'www.lari.co.id', domainVerified: true }
  it('ignore a domain no check proved', () => {
    assert.equal(storeOrigin(lari), 'https://lari.commerce.reddie.id')
    assert.equal(
      storeHost({ ...lari, domainVerified: false, domainVerifiedAt: meta.at }),
      'lari.commerce.reddie.id',
    )
  })
  it('prefer the verified custom domain', () => {
    assert.equal(
      storeOrigin({ ...lari, domainVerifiedAt: meta.at }, 'localhost:5375'),
      'https://www.lari.co.id',
    )
    assert.equal(storeHost({ ...lari, domainVerifiedAt: meta.at }), 'www.lari.co.id')
  })
})

describe('domainRecords', () => {
  it('lists the TXT proof and the CNAME to the store host', () => {
    const records = domainRecords(
      { subdomain: 'lari', domain: 'www.tokosaya.com', domainToken: 't' },
      'localhost:5375',
    )
    assert.deepEqual(
      records.map((r) => [r.type, r.name, r.value]),
      [
        ['TXT', '_wit-commerce.www.tokosaya.com', 't'],
        ['CNAME', 'www.tokosaya.com', 'lari.localhost'],
      ],
    )
    assert.match(newDomainToken(), /^wit-verify-[0-9a-f]{32}$/)
  })
})
