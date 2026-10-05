import type { PaymentMethod, PaymentType } from '../../packages/types/src/index.ts'

type Spec = [
  key: string,
  name: string,
  method: PaymentMethod,
  provider: string,
  feePercent: number,
  feeFixed: number,
  minAmount: number,
  maxAmount: number | null,
  instructions: string,
]

const COMMON: Spec[] = [
  [
    'qris',
    'QRIS',
    'qris',
    'Midtrans',
    0.7,
    0,
    1_000,
    10_000_000,
    'Scan the code with any banking or e-wallet app. It expires in 15 minutes.',
  ],
  [
    'va-bca',
    'BCA virtual account',
    'va',
    'Midtrans',
    0,
    4_000,
    10_000,
    null,
    'Pay from BCA mobile, KlikBCA or an ATM to the account number we show.',
  ],
  [
    'va-mandiri',
    'Mandiri virtual account',
    'va',
    'Midtrans',
    0,
    4_000,
    10_000,
    null,
    "Pay from Livin' by Mandiri or an ATM.",
  ],
  [
    'gopay',
    'GoPay',
    'ewallet',
    'Midtrans',
    2,
    0,
    1_000,
    10_000_000,
    'You go to Gojek to confirm the payment.',
  ],
  [
    'ovo',
    'OVO',
    'ewallet',
    'Xendit',
    2,
    0,
    1_000,
    10_000_000,
    'Confirm the push notification in OVO within 30 seconds.',
  ],
  [
    'card',
    'Credit or debit card',
    'credit_card',
    'Midtrans',
    2.9,
    2_000,
    10_000,
    null,
    'Visa, Mastercard and JCB with 3-D Secure.',
  ],
  [
    'kredivo',
    'Kredivo PayLater',
    'paylater',
    'Kredivo',
    2.3,
    0,
    100_000,
    30_000_000,
    'Split the bill over 3, 6 or 12 months after approval.',
  ],
  [
    'cod',
    'Cash on delivery',
    'cod',
    'Courier',
    3,
    0,
    0,
    2_000_000,
    'Pay the courier in cash when the parcel arrives.',
  ],
  [
    'transfer',
    'Manual bank transfer',
    'bank_transfer',
    'Manual',
    0,
    0,
    10_000,
    null,
    'Transfer to our BCA account and upload the receipt. We confirm within 2 hours.',
  ],
]

const TENANT_KEYS: Record<string, { keys: string[]; off: string[] }> = {
  'ten-lari': {
    keys: ['qris', 'va-bca', 'va-mandiri', 'gopay', 'ovo', 'card', 'kredivo', 'cod', 'transfer'],
    off: ['transfer'],
  },
  'ten-aruna': { keys: ['qris', 'va-bca', 'gopay', 'ovo', 'card', 'kredivo', 'cod'], off: ['cod'] },
  'ten-teknika': { keys: ['va-bca', 'va-mandiri', 'transfer', 'card'], off: [] },
}

// Short keys for the ids promotions point at (pay-lari-qris, pay-lari-card, pay-teknika-va).
const ID_KEY: Record<string, string> = { 'va-bca': 'va', 'va-mandiri': 'va-mandiri' }

export const paymentTypes: PaymentType[] = Object.entries(TENANT_KEYS).flatMap(([tenantId, { keys, off }]) =>
  keys.map((key, sort) => {
    const [, name, method, provider, feePercent, feeFixed, minAmount, maxAmount, instructions] = COMMON.find(
      (c) => c[0] === key,
    )!
    return {
      id: `pay-${tenantId.slice(4)}-${ID_KEY[key] ?? key}`,
      tenantId,
      name,
      method,
      provider,
      enabled: !off.includes(key),
      feePercent,
      feeFixed,
      minAmount,
      maxAmount,
      instructions,
      sort,
    }
  }),
)
