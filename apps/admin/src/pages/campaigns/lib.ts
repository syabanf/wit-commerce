import { fmtDate, fmtIdr, fmtNumber, toMs } from '@rc/fixtures'
import {
  CAMPAIGN_STATUS_FLOW,
  CAMPAIGN_STATUS_LABEL,
  FUNNEL_FLOW,
  LIFECYCLE_STAGE_LABEL,
  LOYALTY_TIER_LABEL,
  SEGMENT_FIELD_LABEL,
  SEGMENT_OP_LABEL,
  type Campaign,
  type Funnel,
  type LifecycleStage,
  type LoyaltyTier,
  type Segment,
  type SegmentRule,
} from '@rc/types'
import type { StepsProps } from '@rc/ui'

export const emptyFunnel = (): Funnel => Object.fromEntries(FUNNEL_FLOW.map((step) => [step, 0])) as Funnel

/** Revenue over budget, or null without a budget. */
export const roi = (c: Pick<Campaign, 'revenue' | 'budget'>) => (c.budget > 0 ? c.revenue / c.budget : null)

export const fmtRoi = (value: number | null) => (value === null ? 'None' : `${value.toFixed(1)}x`)

/** Share of clicks that ended in a purchase. */
export const clickToPurchase = (f: Funnel) => (f.clicked ? f.purchased / f.clicked : 0)

/** Steps of the campaign lifecycle; a paused campaign shows "Paused" on the running step. */
export function campaignSteps(c: Campaign, now: number): StepsProps['steps'] {
  const position =
    c.status === 'paused' ? CAMPAIGN_STATUS_FLOW.indexOf('running') : CAMPAIGN_STATUS_FLOW.indexOf(c.status)
  return CAMPAIGN_STATUS_FLOW.map((status, i) => {
    const state =
      i < position ? 'done' : i === position ? (status === 'completed' ? 'done' : 'current') : 'upcoming'
    const label = status === 'running' && c.status === 'paused' ? 'Paused' : CAMPAIGN_STATUS_LABEL[status]
    const hint =
      status === 'scheduled'
        ? `Starts ${fmtDate(c.startAt)}`
        : status === 'completed'
          ? `${toMs(c.endAt) < now ? 'Ended' : 'Ends'} ${fmtDate(c.endAt)}`
          : undefined
    return { key: status, label, state, hint }
  })
}

function ruleValue(rule: SegmentRule, categoryName: (id: string) => string): string {
  switch (rule.field) {
    case 'spend':
      return fmtIdr(Number(rule.value))
    case 'orders':
    case 'days_since_purchase':
      return fmtNumber(Number(rule.value))
    case 'tier':
      return LOYALTY_TIER_LABEL[rule.value as LoyaltyTier] ?? rule.value
    case 'stage':
      return LIFECYCLE_STAGE_LABEL[rule.value as LifecycleStage] ?? rule.value
    case 'interest':
      return categoryName(rule.value)
    case 'abandoned_cart':
      return rule.value === 'yes' ? 'yes' : 'no'
    case 'city':
      return rule.value
  }
}

/** "Lifetime spend more than Rp 5.000.000" lines of a segment. */
export function ruleLines(segment: Pick<Segment, 'rules'>, categoryName: (id: string) => string): string[] {
  return segment.rules.map(
    (r) => `${SEGMENT_FIELD_LABEL[r.field]} ${SEGMENT_OP_LABEL[r.op]} ${ruleValue(r, categoryName)}`,
  )
}
