import { fmtIdr, fmtIdrShort } from '@rc/fixtures'
import type { PaymentType } from '@rc/types'

export const PROVIDERS = ['Midtrans', 'Xendit', 'DOKU', 'Kredivo', 'Courier', 'Manual']

/** Order amount the fee tile compares gateways on. */
export const SAMPLE_ORDER = 500_000

/** "0.7% + Rp 0". */
export const feeLabel = (t: Pick<PaymentType, 'feePercent' | 'feeFixed'>) =>
  `${t.feePercent}% + ${fmtIdr(t.feeFixed)}`

/** "Rp 10 rb to Rp 10 jt", or "From Rp 10 rb" without a maximum. */
export const limitsLabel = (t: Pick<PaymentType, 'minAmount' | 'maxAmount'>) =>
  t.maxAmount === null
    ? `From ${fmtIdrShort(t.minAmount)}`
    : `${fmtIdrShort(t.minAmount)} to ${fmtIdrShort(t.maxAmount)}`
