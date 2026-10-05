import type { IsoDate } from '@rc/types'

// All calendar math runs in WIB (UTC+7, no daylight saving).
export const TZ_OFFSET_MS = 7 * 3_600_000
export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

export const toMs = (iso: IsoDate): number => Date.parse(iso)

/** Milliseconds → ISO string in WIB, e.g. 2026-09-22T08:12:00+07:00 */
export function toIso(ms: number): IsoDate {
  const d = new Date(ms + TZ_OFFSET_MS)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`
  )
}

/** Calendar fields of an instant in WIB. weekday: 0 = Sunday. */
export function wib(ms: number) {
  const d = new Date(ms + TZ_OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  }
}

/** Build an instant from WIB calendar fields (month is 0-based). */
export function fromWib(year: number, month: number, day: number, hours = 0, minutes = 0): number {
  return Date.UTC(year, month, day, hours, minutes) - TZ_OFFSET_MS
}

export function startOfDay(ms: number): number {
  return Math.floor((ms + TZ_OFFSET_MS) / DAY) * DAY - TZ_OFFSET_MS
}

/** Monday 00:00 of the week that contains ms. */
export function startOfWeek(ms: number): number {
  const diff = (wib(ms).weekday + 6) % 7
  return startOfDay(ms) - diff * DAY
}

export function startOfMonth(ms: number): number {
  const { year, month } = wib(ms)
  return fromWib(year, month, 1)
}

export const addDays = (ms: number, days: number) => ms + days * DAY
export const addHours = (ms: number, hours: number) => ms + hours * HOUR

export function addMonths(ms: number, months: number): number {
  const { year, month, day, hours, minutes } = wib(ms)
  const target = fromWib(year, month + months, 1, hours, minutes)
  const lastDay = wib(fromWib(year, month + months + 1, 0)).day
  return target + (Math.min(day, lastDay) - 1) * DAY
}

export const diffDays = (a: number, b: number) => (a - b) / DAY
export const diffHours = (a: number, b: number) => (a - b) / HOUR
export const diffMinutes = (a: number, b: number) => (a - b) / MINUTE

export const isSameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b)

/** YYYY-MM-DD in WIB */
export function dayKey(ms: number): string {
  const { year, month, day } = wib(ms)
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** YYYY-MM in WIB */
export function monthKey(ms: number): string {
  const { year, month } = wib(ms)
  return `${year}-${pad(month + 1)}`
}

export function fromDayKey(key: string, hours = 0, minutes = 0): number {
  const [y, m, d] = key.split('-').map(Number)
  return fromWib(y!, m! - 1, d!, hours, minutes)
}

/** Value for <input type="date"> */
export const toDateInput = (iso: IsoDate) => dayKey(toMs(iso))

/** Value for <input type="datetime-local"> */
export function toDateTimeInput(iso: IsoDate): string {
  const ms = toMs(iso)
  const { hours, minutes } = wib(ms)
  return `${dayKey(ms)}T${pad(hours)}:${pad(minutes)}`
}

/** Parse a date or datetime-local input value as WIB. */
export function fromInput(value: string): IsoDate {
  const [date, time = '00:00'] = value.split('T')
  const [h, m] = time.split(':').map(Number)
  return toIso(fromDayKey(date!, h ?? 0, m ?? 0))
}
