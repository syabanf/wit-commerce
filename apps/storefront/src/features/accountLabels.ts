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
