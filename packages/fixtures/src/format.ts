import type { IsoDate } from '@rc/types'
import { nowMs } from './clock'
import { DAY, HOUR, MINUTE, isSameDay, toMs, wib } from './dates'

// Every date renders in WIB (Jakarta time) regardless of the viewer's timezone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const numberFmt = new Intl.NumberFormat('en-US')
const idrFmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const idrCompactFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

const parts = (value: IsoDate | number) => wib(typeof value === 'number' ? value : toMs(value))
const pad = (n: number) => String(n).padStart(2, '0')

/** 22 Sep 2026 */
export function fmtDate(value: IsoDate | number) {
  const d = parts(value)
  return `${pad(d.day)} ${MONTHS[d.month]} ${d.year}`
}
/** 22 Sep */
export function fmtDateShort(value: IsoDate | number) {
  const d = parts(value)
  return `${pad(d.day)} ${MONTHS[d.month]}`
}
/** 08:12 */
export function fmtTime(value: IsoDate | number) {
  const d = parts(value)
  return `${pad(d.hours)}:${pad(d.minutes)}`
}
/** 22 Sep 2026 08:12 */
export const fmtDateTime = (value: IsoDate | number) => `${fmtDate(value)} ${fmtTime(value)}`
/** Tue */
export const fmtWeekday = (value: IsoDate | number) => WEEKDAYS[parts(value).weekday]!
/** Sep 2026 */
export function fmtMonth(value: IsoDate | number) {
  const d = parts(value)
  return `${MONTHS[d.month]} ${d.year}`
}
/** Sep */
export const fmtMonthShort = (value: IsoDate | number) => MONTHS[parts(value).month]!

/** "Today 08:12", "Yesterday 16:40", "Mon 21 Sep 08:12" style for activity lists. */
export function fmtWhen(value: IsoDate | number, now = nowMs()): string {
  const ms = typeof value === 'number' ? value : toMs(value)
  if (isSameDay(ms, now)) return `Today ${fmtTime(ms)}`
  if (isSameDay(ms, now - DAY)) return `Yesterday ${fmtTime(ms)}`
  if (isSameDay(ms, now + DAY)) return `Tomorrow ${fmtTime(ms)}`
  return `${fmtDateShort(ms)} ${fmtTime(ms)}`
}

/** "just now", "12m ago", "3h ago", "2d ago", "in 3h" */
export function fmtAgo(value: IsoDate | number, now = nowMs()): string {
  const ms = typeof value === 'number' ? value : toMs(value)
  const diff = now - ms
  const future = diff < 0
  const abs = Math.abs(diff)
  let text: string
  if (abs < MINUTE) return 'just now'
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)}m`
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`
  else if (abs < 14 * DAY) text = `${Math.round(abs / DAY)}d`
  else if (abs < 60 * DAY) text = `${Math.round(abs / (7 * DAY))}w`
  else text = `${Math.round(abs / (30 * DAY))}mo`
  return future ? `in ${text}` : `${text} ago`
}

/** Minutes → "50m", "1h 20m", "2d 4h" */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 24) return rest ? `${h}h ${rest}m` : `${h}h`
  const d = Math.floor(h / 24)
  const hr = h % 24
  return hr ? `${d}d ${hr}h` : `${d}d`
}

/** Minutes → hours with one decimal: "1.5" */
export const fmtHours = (minutes: number, digits = 1) => (minutes / 60).toFixed(digits)

/** 8,442 */
export const fmtNumber = (value: number, digits = 0) =>
  digits
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : numberFmt.format(Math.round(value))

/** 0.921 → "92%" */
export const fmtPercent = (ratio: number, digits = 0) => `${(ratio * 100).toFixed(digits)}%`

/** Rp 125.000 */
export const fmtIdr = (value: number) => idrFmt.format(Math.round(value)).replace(/\u00a0/g, ' ')

/** Rp 850 rb · Rp 12,5 jt · Rp 1,2 M */
export function fmtIdrShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}Rp ${idrCompactFmt.format(abs / 1e9)} M`
  if (abs >= 1e6) return `${sign}Rp ${idrCompactFmt.format(abs / 1e6)} jt`
  if (abs >= 1e3) return `${sign}Rp ${idrCompactFmt.format(abs / 1e3)} rb`
  return `${sign}Rp ${Math.round(abs)}`
}

/** Initials for avatars: "Budi Santoso" → "BS" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/** 1 → "1 item", 3 → "3 items" */
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${fmtNumber(count)} ${count === 1 ? one : many}`

const conjunction = new Intl.ListFormat('en-GB', { type: 'conjunction' })

/** "A", "A and B", "A, B and C". */
export const listOf = (items: readonly string[]) => conjunction.format(items)

/** Readable file size from kilobytes. */
export const fmtFileSize = (kb: number) =>
  kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
