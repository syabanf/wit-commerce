import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CREATE_CODE, NAV } from '../../../apps/admin/src/layouts/nav.ts'

describe('transaction codes', () => {
  const pages = NAV.flatMap((section) => section.items ?? [section])
  const codes = [...pages.map((page) => page.code), ...Object.values(CREATE_CODE)]

  it('gives every page a code', () => {
    assert.deepEqual(
      pages.filter((page) => !page.code).map((page) => page.to),
      [],
    )
  })

  it('never reuses a code', () => {
    assert.equal(new Set(codes).size, codes.length)
  })
})
