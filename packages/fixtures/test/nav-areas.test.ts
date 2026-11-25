import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Role } from '@rc/types'
import {
  EMPLOYEE_NAV,
  NAV,
  areaNav,
  areaOfPath,
  areasFor,
  codeFor,
  leafFor,
  mayOpen,
  navFor,
  sectionFor,
} from '../../../apps/admin/src/layouts/nav.ts'
import { ROLE_PERMISSIONS } from '../src/permissions.ts'

const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[]
const sections = (role: Role) => navFor(role).map((s) => s.id)
const pages = (role: Role) => navFor(role).flatMap((s) => s.items?.map((i) => i.code) ?? [s.code])
const groups = (role: Role) => [...new Set(navFor(role).map((s) => s.group))]

describe('back-office menu per role', () => {
  it('gives staff nothing, not even Home', () => {
    assert.deepEqual(navFor('staff'), [])
    assert.deepEqual(navFor(undefined), [])
  })

  it('gives a platform admin every page', () => {
    assert.deepEqual(navFor('platform_admin'), NAV)
  })

  it('keeps platform pages from a tenant admin and nothing else', () => {
    const all = NAV.flatMap((s) => s.items?.map((i) => i.code) ?? [s.code])
    assert.deepEqual(
      all.filter((code) => !pages('tenant_admin').includes(code)),
      ['EML', 'FXR', 'HOL', 'PLN'],
    )
  })

  it('shows each role the sections its permissions cover', () => {
    assert.deepEqual(sections('marketing'), [
      'home',
      'agents',
      'customers',
      'store',
      'marketing',
      'analytics',
    ])
    assert.deepEqual(sections('operations'), [
      'home',
      'orders',
      'returns',
      'payments',
      'inventory',
      'store',
      'catalog',
      'analytics',
    ])
    assert.deepEqual(sections('service'), ['home', 'orders', 'returns', 'payments', 'customers', 'sales'])
    assert.deepEqual(sections('sales'), ['home', 'orders', 'customers', 'sales'])
  })

  it('shows each role only the pages of a section it can use', () => {
    assert.deepEqual(pages('marketing'), ['HOM', 'AGT', 'SEG', 'EDT', 'MED', 'CMP', 'PRM', 'AUT', 'ANL'])
    assert.deepEqual(pages('service'), ['HOM', 'ORD', 'RET', 'PAY', 'CUS', 'SUP', 'LOY', 'LED'])
    assert.deepEqual(pages('sales'), ['HOM', 'ORD', 'CUS', 'LOY', 'LED'])
  })

  it('opens a trimmed section on its first remaining page', () => {
    const customers = navFor('marketing').find((s) => s.id === 'customers')
    assert.equal(customers?.to, '/customers/segments')
    assert.equal(navFor('sales').find((s) => s.id === 'sales')?.to, '/customers/leads')
  })

  it('leaves no heading without a section', () => {
    assert.deepEqual(groups('operations'), ['Daily work', 'Selling', 'Master data', 'Insights & setup'])
    assert.deepEqual(groups('sales'), ['Daily work', 'Selling', 'Growth'])
    assert.deepEqual(groups('marketing'), ['Daily work', 'Selling', 'Growth', 'Insights & setup'])
  })

  it('never shows a page whose permissions the role lacks', () => {
    for (const role of ROLES) {
      for (const section of navFor(role)) {
        for (const page of [section, ...(section.items ?? [])]) {
          assert.ok(
            !page.needs || page.needs.some((p) => ROLE_PERMISSIONS[role].includes(p)),
            `${role} sees ${page.label}`,
          )
        }
      }
    }
  })
})

describe('menu areas', () => {
  it('puts every path under /me in the employee area', () => {
    assert.equal(areaOfPath('/me'), 'employee')
    assert.equal(areaOfPath('/me/account'), 'employee')
    assert.equal(areaOfPath('/'), 'backoffice')
    assert.equal(areaOfPath('/commerce/orders/ord-1'), 'backoffice')
    assert.equal(areaOfPath('/media'), 'backoffice')
  })

  it('shows tabs only to a role with both areas', () => {
    for (const role of ROLES) {
      assert.deepEqual(areasFor(role), role === 'staff' ? ['employee'] : ['backoffice', 'employee'], role)
    }
  })

  it('gives everyone the same employee pages', () => {
    for (const role of ROLES) assert.equal(areaNav(role, 'employee'), EMPLOYEE_NAV)
    assert.deepEqual(areaNav('staff', 'backoffice'), [])
  })

  it('finds the section, page and code of employee paths', () => {
    assert.equal(sectionFor('/me').id, 'me')
    assert.equal(sectionFor('/me/tasks').id, 'me-tasks')
    assert.equal(codeFor('/me/account'), 'MEA')
    assert.equal(sectionFor('/customers/leads/led-1').id, 'sales')
    assert.equal(leafFor('/customers/leads/led-1')?.code, 'LED')
  })

  it('keeps employee codes apart from back-office codes', () => {
    const back = new Set(NAV.flatMap((s) => s.items?.map((i) => i.code) ?? [s.code]))
    const own = EMPLOYEE_NAV.map((s) => s.code)
    assert.equal(new Set(own).size, own.length)
    assert.deepEqual(
      own.filter((code) => !code || back.has(code)),
      [],
    )
  })

  it('says which links a role may open', () => {
    assert.equal(mayOpen('staff', '/customers/support?ticket=tic-1'), false)
    assert.equal(mayOpen('staff', '/me/tasks'), true)
    assert.equal(mayOpen('service', '/customers/support?ticket=tic-1'), true)
    assert.equal(mayOpen('sales', '/customers/support'), false)
    assert.equal(mayOpen('sales', '/customers/leads/led-1'), true)
    assert.equal(mayOpen('marketing', '/commerce/orders'), false)
  })
})
