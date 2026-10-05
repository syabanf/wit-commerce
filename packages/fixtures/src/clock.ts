import type { IsoDate } from '@rc/types'
import { toIso, toMs } from './dates'

/** Every fixture timestamp is relative to this instant. */
export const FIXTURE_NOW: IsoDate = '2026-10-05T09:41:00+07:00'

// The app clock starts at FIXTURE_NOW and then ticks in real time, so "x minutes ago" labels move
// while the seeded data stays consistent.
const offset = toMs(FIXTURE_NOW) - Date.now()

export const nowMs = (): number => Date.now() + offset
export const nowIso = (): IsoDate => toIso(nowMs())
