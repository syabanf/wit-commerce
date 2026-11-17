import type {
  AgentKind,
  BusinessType,
  Channel,
  Courier,
  LifecycleStage,
  LoyaltyTier,
  OrderStatus,
  PaymentStatus,
  PrivacyRequestKind,
  ReturnReason,
  ReturnShippingPayer,
  ReturnStatus,
} from '@rc/types'
import { COURIER_LABEL } from '@rc/types'
import { type MessageKey, t } from '../i18n'

// Shopper-facing names of the enums @rc/types labels in English, read in the shopper's language.

const keyed =
  <T extends string>(prefix: string) =>
  (value: T) =>
    t(`${prefix}.${value}` as MessageKey)

export const tierLabel = keyed<LoyaltyTier>('account.tier')
export const stageLabel = keyed<LifecycleStage>('account.stage')
export const orderStatusLabel = keyed<OrderStatus>('account.orderStatus')
export const paymentStatusLabel = keyed<PaymentStatus>('account.payment')
export const channelLabel = keyed<Channel>('account.channel')
/** Lower case, for "Placed by your chat assistant". */
export const agentKindLabel = keyed<AgentKind>('account.agent')
export const returnStatusLabel = keyed<ReturnStatus>('account.returnStatus')
export const returnReasonLabel = keyed<ReturnReason>('account.reason')
export const shippingPayerLabel = keyed<ReturnShippingPayer>('account.payer')
export const privacyKindLabel = keyed<PrivacyRequestKind>('account.privacyKind')
export const businessTypeLabel = keyed<BusinessType>('account.business')

/** Courier brand names stay; store pickup is translated. */
export const courierLabel = (courier: Courier) =>
  courier === 'pickup' ? t('account.courier.pickup') : COURIER_LABEL[courier]

/** The refusals @rc/fixtures writes in English for a shopper's return, in the shopper's language. */
export function returnBlockerText(message: string): string {
  const fixed: Record<string, MessageKey> = {
    'You can ask for a return once the order is delivered.': 'account.returns.block.notDelivered',
    'Choose at least one item to return.': 'account.returns.block.none',
    'One item is not part of this order.': 'account.returns.block.notInOrder',
    'List each item once.': 'account.returns.block.once',
    'Choose a reason for each item.': 'account.returns.block.reason',
    'Enter how many units to return.': 'account.returns.block.qty',
    'One item already has an open return. Finish that one first.': 'account.returns.block.open',
    'One item was already returned in full.': 'account.returns.block.full',
    'This store takes change-of-mind and fit returns by message. Contact the store.':
      'account.returns.block.byMessage',
  }
  if (fixed[message]) return t(fixed[message])
  const only = /^Only (\d+) of one item can still be returned\.$/.exec(message)
  if (only) return t('account.returns.block.only', { count: only[1]! })
  const working = /^The (\d+)-working-day return window for this order has closed\.$/.exec(message)
  if (working) return t('account.returns.block.windowWorking', { days: working[1]! })
  const days = /^The (\d+)-day return window for this order has closed\.$/.exec(message)
  if (days) return t('account.returns.block.windowDays', { days: days[1]! })
  return message
}

/** The refusals complaintBlocker writes in English, in the shopper's language. */
export function complaintBlockerText(message: string): string {
  const fixed: Record<string, MessageKey> = {
    'Give your complaint a subject of 3 to 120 characters.': 'account.help.block.subject',
    'Describe the problem in 10 to 2000 characters.': 'account.help.block.message',
    'Enter your name, up to 80 characters.': 'account.help.block.name',
    'Leave an email or a phone number so we can reply.': 'account.help.block.contact',
    'Enter an email such as you@example.com.': 'account.help.block.email',
    'Enter a phone number of 8 to 15 digits.': 'account.help.block.phone',
  }
  return fixed[message] ? t(fixed[message]) : message
}
