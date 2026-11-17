import { ApiError, type Invoice, type PlanInfo, type PlanRequest } from '@rc/api'
import {
  PLAN_LIMIT_KEYS,
  PLAN_LIMIT_LABEL,
  type PlanLimitKey,
  fmtIdr,
  fmtMonth,
  fmtNumber,
  fromWib,
} from '@rc/fixtures'
import type { BadgeProps } from '@rc/ui'

export const message = (err: unknown) =>
  err instanceof ApiError ? err.message : 'The server did not answer.'

export const INVOICE_STATUS: Record<Invoice['status'], { label: string; variant: BadgeProps['variant'] }> = {
  due: { label: 'Due', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  void: { label: 'Void', variant: 'muted' },
}

export const REQUEST_STATUS: Record<
  PlanRequest['status'],
  { label: string; variant: BadgeProps['variant'] }
> = {
  pending: { label: 'Waiting', variant: 'info' },
  approved: { label: 'Approved', variant: 'success' },
  declined: { label: 'Declined', variant: 'muted' },
}

export const planName = (plans: PlanInfo[], id: string) => plans.find((p) => p.id === id)?.name ?? id

export const priceLabel = (price: number) => (price === 0 ? 'Free' : `${fmtIdr(price)} a month`)

/** "2026-10" as "October 2026". */
export const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number)
  return fmtMonth(fromWib(year!, month! - 1, 15))
}

/** What a larger plan raises, one line per limit that grows. */
export function planGains(from: PlanInfo, to: PlanInfo): string[] {
  return PLAN_LIMIT_KEYS.filter((key) => to.limits[key] > from.limits[key]).map(
    (key: PlanLimitKey) =>
      `${PLAN_LIMIT_LABEL[key]}: ${fmtNumber(from.limits[key])} to ${fmtNumber(to.limits[key])}`,
  )
}

/** The sentence every billing screen carries, so nobody looks for a pay button. */
export const PAYMENT_NOTE =
  'Nothing is charged here. Payment is arranged with the platform and recorded on these invoices.'
