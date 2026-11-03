import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countBy, matchesQuery } from '../../ui/src/lib/table-filter.ts'

describe('table filters', () => {
  it('matches every word of the query across fields, ignoring case', () => {
    assert.equal(matchesQuery('', 'anything'), true)
    assert.equal(matchesQuery('   ', 'anything'), true)
    assert.equal(matchesQuery('ORD-1042', 'ord-1042', 'Rina'), true)
    assert.equal(matchesQuery('rina 1042', 'ORD-1042', 'Rina Putri'), true)
    assert.equal(matchesQuery('rina 2001', 'ORD-1042', 'Rina Putri'), false)
  })

  it('skips missing fields and searches numbers as text', () => {
    assert.equal(matchesQuery('12', null, undefined, 120), true)
    assert.equal(matchesQuery('null', null), false)
  })

  it('counts rows per value and leaves out rows without one', () => {
    const rows = [{ kind: 'in' }, { kind: 'out' }, { kind: 'in' }, { kind: null }]
    assert.deepEqual(
      countBy(rows, (r) => r.kind),
      { in: 2, out: 1 },
    )
    assert.deepEqual(
      countBy([], (r: { kind: string }) => r.kind),
      {},
    )
  })
})
