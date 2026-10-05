import type { LeadStage, LoyaltyTier, OrderStatus } from '@rc/types'
import { LEAD_STAGE_LABEL, LOYALTY_TIER_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
import { Badge, type BadgeProps, cn } from '@rc/ui'

type Variant = NonNullable<BadgeProps['variant']>

const LEAD_VARIANT: Record<LeadStage, Variant> = {
  new: 'accent',
  qualified: 'default',
  proposal: 'info',
  negotiation: 'warning',
  won: 'success',
  lost: 'muted',
}

/** Lead stage. `onInk` renders it on the ink hero. */
export function LeadStageBadge({ stage, onInk = false }: { stage: LeadStage; onInk?: boolean }) {
  return (
    <Badge
      variant={onInk ? undefined : LEAD_VARIANT[stage]}
      className={cn(onInk && 'bg-white/10 text-white')}
    >
      {LEAD_STAGE_LABEL[stage]}
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

const ORDER_TEXT: Record<OrderStatus, string> = {
  new: 'text-body',
  confirmed: 'text-body',
  paid: 'text-body',
  processing: 'text-info',
  packed: 'text-info',
  shipped: 'text-info',
  delivered: 'text-success',
  completed: 'text-success',
  cancelled: 'text-muted',
  returned: 'text-warning',
  refunded: 'text-muted',
}

/** Order status as coloured text, for compact rows. */
export function OrderStatusText({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn('text-xs font-semibold', ORDER_TEXT[status], className)}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  )
}
