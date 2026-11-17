import type { AttributeDef, EtaDays, IsoDate, Promotion } from '@rc/types'
import { fmtDate as fmtDateEn, fmtDateTime as fmtDateTimeEn, fmtIdr, toMs } from '@rc/fixtures'
import { currentLang, locale, t } from '.'

// Dates, numbers and the shopper-facing sentences @rc/fixtures writes in English, in the shopper's
// language. Dates render in WIB, as everywhere else. Rupiah amounts keep fmtIdr (already id-ID).

const ms = (value: IsoDate | number) => (typeof value === 'number' ? value : toMs(value))
const idDate = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
})
const idTime = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
})

/** 22 Sep 2026, or 22 Agu 2026 in Indonesian. */
export const fmtDate = (value: IsoDate | number) =>
  currentLang() === 'id' ? idDate.format(ms(value)) : fmtDateEn(value)

/** 22 Sep 2026 08:12, or 22 Agu 2026 08.12 in Indonesian. */
export const fmtDateTime = (value: IsoDate | number) =>
  currentLang() === 'id' ? `${idDate.format(ms(value))} ${idTime.format(ms(value))}` : fmtDateTimeEn(value)

/** 8.442 in Indonesian, 8,442 in English. */
export const fmtNumber = (value: number) => new Intl.NumberFormat(locale()).format(Math.round(value))

/** "Same day", "1 day" or "2 to 3 days". */
export function etaLabel(eta: EtaDays): string {
  if (eta.max === 0) return t('format.eta.sameDay')
  if (eta.min === eta.max)
    return eta.min === 1 ? t('format.eta.oneDay') : t('format.eta.days', { days: eta.min })
  return t('format.eta.range', { min: eta.min, max: eta.max })
}

/** "8 mm", "Road", "Yes". */
export function formatAttribute(def: AttributeDef, value: string | undefined): string {
  if (!value) return t('format.attribute.notSet')
  if (def.type === 'boolean') return value === 'yes' ? t('format.yes') : t('format.no')
  return def.unit ? `${value} ${def.unit}` : value
}

/** One sentence that says what the offer gives: "15% off, up to Rp 100.000", "Buy 2 get 1 free". */
export function describePromotion(p: Promotion, paymentName?: (id: string) => string): string {
  const getPct = p.getDiscountPct ?? 100
  const head = {
    percentage: p.maxDiscount
      ? t('format.promo.percentCapped', { value: p.value, max: fmtIdr(p.maxDiscount) })
      : t('format.promo.percent', { value: p.value }),
    fixed: t('format.promo.fixed', { amount: fmtIdr(p.value) }),
    bxgy:
      getPct >= 100
        ? t('format.promo.bxgyFree', { buy: p.buyQty ?? 0, get: p.getQty ?? 0 })
        : t('format.promo.bxgyPercent', { buy: p.buyQty ?? 0, get: p.getQty ?? 0, pct: getPct }),
    free_shipping: t('format.promo.freeShipping'),
    bundle: t('format.promo.bundle', { amount: fmtIdr(p.value) }),
  }[p.kind]
  const parts = [head]
  if (p.minSpend) parts.push(t('format.promo.minSpend', { amount: fmtIdr(p.minSpend) }))
  if (p.paymentTypeIds.length && paymentName)
    parts.push(t('format.promo.payWith', { methods: p.paymentTypeIds.map(paymentName).join(t('format.or')) }))
  return parts.join(' ')
}

/** The voucher refusals priceCart writes in English, in the shopper's language. */
export function codeErrorText(message: string): string {
  if (message === 'This code does not exist.') return t('format.code.missing')
  if (message === 'This code is not active right now.') return t('format.code.inactive')
  if (message.startsWith('This code works with another payment type')) return t('format.code.payment')
  if (message === "This code only works in its seller's store.") return t('format.code.seller')
  if (message === 'Nothing in your cart qualifies for this code.') return t('format.code.nothing')
  const spend = /^Spend at least (.+) to use this code\.$/.exec(message)
  if (spend) return t('format.code.minSpend', { amount: spend[1]! })
  const add = /^Add (\d+) qualifying items to use this code\.$/.exec(message)
  if (add) return t('format.code.addItems', { count: add[1]! })
  return message
}
