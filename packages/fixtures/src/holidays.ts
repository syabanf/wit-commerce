import type { PublicHoliday, Tenant } from '@rc/types'
import { dayKey, wib } from './dates'

// The working-day calendar behind the legal return floor (PP 80/2019 Pasal 69(1)) and complaint due
// times (Pasal 27). A working day is Monday to Friday in WIB that is neither a public holiday nor one
// of the brand's closed days. apps/api/internal/rules/holidays.go mirrors every function here.

/**
 * National holidays and cuti bersama from the SKB 3 Menteri, as migration 0039 seeds them. Platform
 * admins keep the live list in the console; the demo and the reducer use this one.
 *
 * 2027: SKB Nomor 1205, 3 and 2 Tahun 2026, signed 15 September 2026, read from news reports of it.
 * 2026: from memory of the 2026 SKB and not read from its text, so every entry needs confirmation.
 */
export const PUBLIC_HOLIDAYS: readonly PublicHoliday[] = [
  { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', kind: 'national', confirmed: false },
  { date: '2026-01-16', name: 'Isra Mikraj Nabi Muhammad SAW', kind: 'national', confirmed: false },
  { date: '2026-02-16', name: 'Cuti bersama Tahun Baru Imlek', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', kind: 'national', confirmed: false },
  { date: '2026-03-18', name: 'Cuti bersama Hari Suci Nyepi', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-03-19', name: 'Hari Suci Nyepi (Tahun Baru Saka 1948)', kind: 'national', confirmed: false },
  { date: '2026-03-20', name: 'Cuti bersama Idul Fitri 1447 H', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 H', kind: 'national', confirmed: false },
  { date: '2026-03-22', name: 'Hari Raya Idul Fitri 1447 H', kind: 'national', confirmed: false },
  { date: '2026-03-23', name: 'Cuti bersama Idul Fitri 1447 H', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-03-24', name: 'Cuti bersama Idul Fitri 1447 H', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-04-03', name: 'Wafat Yesus Kristus', kind: 'national', confirmed: false },
  { date: '2026-04-05', name: 'Kebangkitan Yesus Kristus (Paskah)', kind: 'national', confirmed: false },
  { date: '2026-05-01', name: 'Hari Buruh Internasional', kind: 'national', confirmed: false },
  { date: '2026-05-14', name: 'Kenaikan Yesus Kristus', kind: 'national', confirmed: false },
  { date: '2026-05-15', name: 'Cuti bersama Kenaikan Yesus Kristus', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 H', kind: 'national', confirmed: false },
  { date: '2026-05-28', name: 'Cuti bersama Idul Adha 1447 H', kind: 'cuti_bersama', confirmed: false },
  { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE', kind: 'national', confirmed: false },
  { date: '2026-06-01', name: 'Hari Lahir Pancasila', kind: 'national', confirmed: false },
  { date: '2026-06-16', name: 'Tahun Baru Islam 1448 H', kind: 'national', confirmed: false },
  {
    date: '2026-08-17',
    name: 'Proklamasi Kemerdekaan Republik Indonesia',
    kind: 'national',
    confirmed: false,
  },
  { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW', kind: 'national', confirmed: false },
  {
    date: '2026-12-24',
    name: 'Cuti bersama Kelahiran Yesus Kristus',
    kind: 'cuti_bersama',
    confirmed: false,
  },
  { date: '2026-12-25', name: 'Kelahiran Yesus Kristus (Hari Natal)', kind: 'national', confirmed: false },
  { date: '2027-01-01', name: 'Tahun Baru 2027 Masehi', kind: 'national', confirmed: true },
  { date: '2027-01-05', name: 'Isra Mikraj Nabi Muhammad SAW 1448 H', kind: 'national', confirmed: true },
  { date: '2027-02-05', name: 'Cuti bersama Tahun Baru Imlek', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-02-06', name: 'Tahun Baru Imlek 2578 Kongzili', kind: 'national', confirmed: true },
  { date: '2027-03-08', name: 'Hari Suci Nyepi (Tahun Baru Saka 1949)', kind: 'national', confirmed: true },
  { date: '2027-03-09', name: 'Cuti bersama Idul Fitri 1448 H', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-03-10', name: 'Hari Raya Idul Fitri 1448 H', kind: 'national', confirmed: true },
  { date: '2027-03-11', name: 'Hari Raya Idul Fitri 1448 H', kind: 'national', confirmed: true },
  { date: '2027-03-12', name: 'Cuti bersama Idul Fitri 1448 H', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-03-15', name: 'Cuti bersama Idul Fitri 1448 H', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-03-25', name: 'Cuti bersama Wafat Yesus Kristus', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-03-26', name: 'Wafat Yesus Kristus', kind: 'national', confirmed: true },
  { date: '2027-03-28', name: 'Kebangkitan Yesus Kristus (Paskah)', kind: 'national', confirmed: true },
  { date: '2027-05-01', name: 'Hari Buruh Internasional', kind: 'national', confirmed: true },
  { date: '2027-05-06', name: 'Kenaikan Yesus Kristus', kind: 'national', confirmed: true },
  { date: '2027-05-17', name: 'Hari Raya Idul Adha 1448 H', kind: 'national', confirmed: true },
  { date: '2027-05-18', name: 'Cuti bersama Idul Adha 1448 H', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-05-19', name: 'Cuti bersama Waisak 2571 BE', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-05-20', name: 'Hari Raya Waisak 2571 BE', kind: 'national', confirmed: true },
  { date: '2027-06-01', name: 'Hari Lahir Pancasila', kind: 'national', confirmed: true },
  { date: '2027-06-06', name: 'Tahun Baru Islam 1449 H', kind: 'national', confirmed: true },
  { date: '2027-08-15', name: 'Maulid Nabi Muhammad SAW', kind: 'national', confirmed: true },
  {
    date: '2027-08-17',
    name: 'Proklamasi Kemerdekaan Republik Indonesia',
    kind: 'national',
    confirmed: true,
  },
  { date: '2027-12-24', name: 'Cuti bersama Kelahiran Yesus Kristus', kind: 'cuti_bersama', confirmed: true },
  { date: '2027-12-25', name: 'Kelahiran Yesus Kristus (Hari Natal)', kind: 'national', confirmed: true },
  { date: '2027-12-26', name: 'Isra Mikraj Nabi Muhammad SAW 1449 H', kind: 'national', confirmed: true },
]

export const PUBLIC_HOLIDAY_DATES: readonly string[] = PUBLIC_HOLIDAYS.map((h) => h.date)

/** Days a working-day count skips besides weekends, as YYYY-MM-DD in WIB. */
export type ClosedDays = ReadonlySet<string>

export const NO_CLOSED_DAYS: ClosedDays = new Set()

/** The most closed days a brand may keep. */
export const MAX_CLOSED_DAYS = 60

/** The platform's holidays and the brand's own closed days, as one set. */
export const closedDaysOf = (
  holidays: readonly string[],
  tenant: Pick<Tenant, 'closedDays'> | undefined,
): ClosedDays => new Set([...holidays, ...(tenant?.closedDays ?? [])])

/** Whether the WIB day that holds ms is Monday to Friday and not closed. */
export function isWorkingDay(ms: number, closed: ClosedDays): boolean {
  const { weekday } = wib(ms)
  return weekday !== 0 && weekday !== 6 && !closed.has(dayKey(ms))
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date written YYYY-MM-DD. */
export function isCalendarDate(date: string): boolean {
  if (!DATE.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

/** The brand's closed days sorted, without repeats. */
export const normalizeClosedDays = (days: readonly string[]) => [...new Set(days.map((d) => d.trim()))].sort()

/** Why a list of closed days cannot be saved, or null. Checks the normalized list. */
export function closedDaysBlocker(days: readonly string[]): string | null {
  if (days.length > MAX_CLOSED_DAYS) return `Keep at most ${MAX_CLOSED_DAYS} closed days.`
  const bad = days.find((d) => !isCalendarDate(d))
  return bad === undefined ? null : `${bad || 'An empty date'} is not a date written YYYY-MM-DD.`
}
