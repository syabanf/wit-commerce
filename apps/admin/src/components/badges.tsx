import type {
  AutomationStatus,
  CampaignStatus,
  Channel,
  IntegrationHealth,
  LeadStage,
  LifecycleStage,
  LoyaltyTier,
  OrderStatus,
  PageStatus,
  PaymentStatus,
  ProductStatus,
  PromotionStatus,
  SellerStatus,
  StockState,
  TicketStatus,
} from '@rc/types'
import {
  AUTOMATION_STATUS_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CHANNEL_LABEL,
  INTEGRATION_HEALTH_LABEL,
  LEAD_STAGE_LABEL,
  LIFECYCLE_STAGE_LABEL,
  LOYALTY_TIER_LABEL,
  ORDER_STATUS_LABEL,
  PAGE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  PROMOTION_STATUS_LABEL,
  SELLER_STATUS_LABEL,
  STOCK_STATE_LABEL,
  TICKET_STATUS_LABEL,
} from '@rc/types'
import { Badge, type BadgeProps, type Tone } from '@rc/ui'

type Variant = NonNullable<BadgeProps['variant']>

export const ORDER_STATUS_VARIANT: Record<OrderStatus, Variant> = {
  new: 'outline',
  confirmed: 'default',
  paid: 'ink',
  processing: 'info',
  packed: 'info',
  shipped: 'info',
  delivered: 'success',
  completed: 'success',
  cancelled: 'muted',
  returned: 'warning',
  refunded: 'muted',
}
export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  new: 'default',
  confirmed: 'default',
  paid: 'ink',
  processing: 'info',
  packed: 'info',
  shipped: 'info',
  delivered: 'success',
  completed: 'success',
  cancelled: 'default',
  returned: 'warning',
  refunded: 'default',
}

/** Pass ON_INK as className when the badge sits on an ink surface. */
export const ON_INK = 'border-transparent bg-white/10 text-white'

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge
      variant={ORDER_STATUS_VARIANT[status]}
      dot={status === 'processing' || status === 'packed' || status === 'shipped'}
      className={className}
    >
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  )
}

const PAYMENT_VARIANT: Record<PaymentStatus, Variant> = {
  pending: 'warning',
  paid: 'success',
  failed: 'danger',
  refunded: 'muted',
}

export function PaymentBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <Badge variant={PAYMENT_VARIANT[status]} className={className}>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  )
}

const PRODUCT_VARIANT: Record<ProductStatus, Variant> = {
  draft: 'outline',
  scheduled: 'info',
  active: 'success',
  archived: 'muted',
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={PRODUCT_VARIANT[status]}>{PRODUCT_STATUS_LABEL[status]}</Badge>
}

const STOCK_VARIANT: Record<StockState, Variant> = {
  in_stock: 'success',
  low: 'warning',
  out: 'danger',
  untracked: 'muted',
}

export function StockBadge({ state }: { state: StockState }) {
  return (
    <Badge variant={STOCK_VARIANT[state]} dot={state !== 'untracked'}>
      {STOCK_STATE_LABEL[state]}
    </Badge>
  )
}

const LIFECYCLE_VARIANT: Record<LifecycleStage, Variant> = {
  visitor: 'muted',
  lead: 'outline',
  registered: 'default',
  first_buyer: 'info',
  repeat_buyer: 'info',
  loyal: 'success',
  vip: 'ink',
  at_risk: 'warning',
  dormant: 'muted',
}

export function LifecycleBadge({ stage }: { stage: LifecycleStage }) {
  return (
    <Badge variant={LIFECYCLE_VARIANT[stage]} dot={stage === 'at_risk'}>
      {LIFECYCLE_STAGE_LABEL[stage]}
    </Badge>
  )
}

const TIER_VARIANT: Record<LoyaltyTier, Variant> = {
  member: 'muted',
  silver: 'default',
  gold: 'warning',
  platinum: 'ink',
}

export function TierBadge({ tier }: { tier: LoyaltyTier }) {
  return <Badge variant={TIER_VARIANT[tier]}>{LOYALTY_TIER_LABEL[tier]}</Badge>
}

const LEAD_VARIANT: Record<LeadStage, Variant> = {
  new: 'accent',
  qualified: 'default',
  proposal: 'info',
  negotiation: 'warning',
  won: 'success',
  lost: 'muted',
}

export function LeadStageBadge({ stage }: { stage: LeadStage }) {
  return <Badge variant={LEAD_VARIANT[stage]}>{LEAD_STAGE_LABEL[stage]}</Badge>
}

const TICKET_VARIANT: Record<TicketStatus, Variant> = {
  open: 'danger',
  pending: 'warning',
  resolved: 'success',
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={TICKET_VARIANT[status]}>{TICKET_STATUS_LABEL[status]}</Badge>
}

const CAMPAIGN_VARIANT: Record<CampaignStatus, Variant> = {
  draft: 'outline',
  scheduled: 'default',
  running: 'info',
  paused: 'warning',
  completed: 'success',
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant={CAMPAIGN_VARIANT[status]} dot={status === 'running'}>
      {CAMPAIGN_STATUS_LABEL[status]}
    </Badge>
  )
}

const AUTOMATION_VARIANT: Record<AutomationStatus, Variant> = {
  draft: 'outline',
  active: 'success',
  paused: 'warning',
}

export function AutomationStatusBadge({ status }: { status: AutomationStatus }) {
  return (
    <Badge variant={AUTOMATION_VARIANT[status]} dot={status === 'active'}>
      {AUTOMATION_STATUS_LABEL[status]}
    </Badge>
  )
}

const PROMOTION_VARIANT: Record<PromotionStatus, Variant> = {
  draft: 'outline',
  scheduled: 'default',
  active: 'success',
  paused: 'warning',
  expired: 'muted',
}

export function PromotionStatusBadge({ status }: { status: PromotionStatus }) {
  return <Badge variant={PROMOTION_VARIANT[status]}>{PROMOTION_STATUS_LABEL[status]}</Badge>
}

const PAGE_VARIANT: Record<PageStatus, Variant> = {
  draft: 'outline',
  scheduled: 'info',
  published: 'success',
}

export function PageStatusBadge({ status }: { status: PageStatus }) {
  return <Badge variant={PAGE_VARIANT[status]}>{PAGE_STATUS_LABEL[status]}</Badge>
}

const SELLER_VARIANT: Record<SellerStatus, Variant> = {
  active: 'success',
  invited: 'outline',
  suspended: 'danger',
}

export function SellerStatusBadge({ status }: { status: SellerStatus }) {
  return <Badge variant={SELLER_VARIANT[status]}>{SELLER_STATUS_LABEL[status]}</Badge>
}

const HEALTH_VARIANT: Record<IntegrationHealth, Variant> = {
  connected: 'success',
  degraded: 'warning',
  failing: 'accent',
  off: 'muted',
}
export const HEALTH_TONE: Record<IntegrationHealth, Tone> = {
  connected: 'success',
  degraded: 'warning',
  failing: 'danger',
  off: 'default',
}

export function HealthBadge({ health }: { health: IntegrationHealth }) {
  return (
    <Badge variant={HEALTH_VARIANT[health]} dot={health !== 'off'}>
      {INTEGRATION_HEALTH_LABEL[health]}
    </Badge>
  )
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  return <Badge variant="outline">{CHANNEL_LABEL[channel]}</Badge>
}
