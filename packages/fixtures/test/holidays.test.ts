import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedState } from '../src/data.ts'
import { toMs } from '../src/dates.ts'
import {
  closedDaysBlocker,
  closedDaysOf,
  MAX_CLOSED_DAYS,
  normalizeClosedDays,
  PUBLIC_HOLIDAYS,
} from '../src/holidays.ts'
import { addWorkingDays } from '../src/legal.ts'
import { legalReturnDeadline } from '../src/rules.ts'
import { reduce } from '../src/store.ts'

// apps/api/internal/rules/holidays_test.go runs the same cases.
const christmas = closedDaysOf(['2026-12-24', '2026-12-25'], { closedDays: ['2026-12-29'] })

describe('working-day calendar', () => {
  it('moves the legal return deadline past holidays and closed days', () => {
    assert.equal(
      legalReturnDeadline(toMs('2026-12-23T10:00:00+07:00'), christmas),
      toMs('2026-12-30T23:59:59.999+07:00'),
    )
    assert.equal(
      legalReturnDeadline(toMs('2026-12-21T10:00:00+07:00'), christmas),
      toMs('2026-12-23T23:59:59.999+07:00'),
    )
    assert.equal(
      legalReturnDeadline(toMs('2026-12-23T10:00:00+07:00')),
      toMs('2026-12-25T23:59:59.999+07:00'),
    )
  })

  it('moves complaint due times past holidays and closed days', () => {
    assert.equal(addWorkingDays('2026-12-23T10:00:00+07:00', 3, christmas), '2026-12-31T10:00:00+07:00')
  })

  it('checks and sorts closed days', () => {
    const days = normalizeClosedDays([' 2026-12-31', '2026-12-30', '2026-12-31'])
    assert.deepEqual(days, ['2026-12-30', '2026-12-31'])
    assert.equal(closedDaysBlocker(days), null)
    for (const bad of ['2026-02-30', '31-12-2026', '']) assert.notEqual(closedDaysBlocker([bad]), null, bad)
    assert.equal(
      closedDaysBlocker(Array(MAX_CLOSED_DAYS + 1).fill('2026-12-30')),
      'Keep at most 60 closed days.',
    )
  })

  it('keeps the seed sorted, one row per date', () => {
    const dates = PUBLIC_HOLIDAYS.map((h) => h.date)
    assert.deepEqual(dates, [...new Set(dates)].sort())
  })

  it('saves and clears a brand closed days', () => {
    const meta = { by: 'usr-andi', at: '2026-10-09T16:00:00+07:00' }
    const set = reduce(seedState(), {
      action: {
        type: 'tenants/setClosedDays',
        tenantId: 'ten-lari',
        closedDays: ['2026-12-31', '2026-12-30'],
      },
      meta,
    })
    assert.deepEqual(set.tenants.find((t) => t.id === 'ten-lari')?.closedDays, ['2026-12-30', '2026-12-31'])
    const cleared = reduce(set, {
      action: { type: 'tenants/setClosedDays', tenantId: 'ten-lari', closedDays: [] },
      meta,
    })
    assert.equal(cleared.tenants.find((t) => t.id === 'ten-lari')?.closedDays, undefined)
    assert.equal(
      reduce(set, {
        action: { type: 'tenants/setClosedDays', tenantId: 'ten-lari', closedDays: ['soon'] },
        meta,
      }),
      set,
    )
  })
})
