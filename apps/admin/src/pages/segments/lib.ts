import { fmtIdrShort, fmtNumber, listOf } from '@rc/fixtures'
import type { LifecycleStage, LoyaltyTier, Segment, SegmentField, SegmentOp, SegmentRule } from '@rc/types'
import { LIFECYCLE_STAGE_LABEL, LOYALTY_TIER_LABEL, SEGMENT_FIELD_LABEL, SEGMENT_OP_LABEL } from '@rc/types'

export const SEGMENT_FIELDS = Object.keys(SEGMENT_FIELD_LABEL) as SegmentField[]

/** Operators that make sense for each field. Category, city and flags only match exactly. */
export const FIELD_OPS: Record<SegmentField, SegmentOp[]> = {
  orders: ['gt', 'lt', 'eq'],
  spend: ['gt', 'lt'],
  days_since_purchase: ['gt', 'lt'],
  tier: ['eq'],
  stage: ['eq'],
  interest: ['eq'],
  city: ['eq'],
  abandoned_cart: ['eq'],
}

export const NUMERIC_FIELDS = new Set<SegmentField>(['orders', 'spend', 'days_since_purchase'])

export function defaultRule(field: SegmentField): SegmentRule {
  const value: Record<SegmentField, string> = {
    orders: '1',
    spend: '1000000',
    days_since_purchase: '60',
    tier: 'gold',
    stage: 'repeat_buyer',
    interest: '',
    city: '',
    abandoned_cart: 'yes',
  }
  return { field, op: FIELD_OPS[field][0]!, value: value[field] }
}

/** "Lifetime spend more than Rp 10 jt" */
function ruleText(rule: SegmentRule, categoryName: (id: string) => string): string {
  const field = SEGMENT_FIELD_LABEL[rule.field]
  const op = SEGMENT_OP_LABEL[rule.op]
  switch (rule.field) {
    case 'spend':
      return `${field} ${op} ${fmtIdrShort(Number(rule.value))}`
    case 'orders':
      return `${field} ${op} ${fmtNumber(Number(rule.value))}`
    case 'days_since_purchase':
      return `Last purchase ${rule.op === 'eq' ? 'exactly' : op}${fmtNumber(Number(rule.value))} days ago`
    case 'tier':
      return `Tier is ${LOYALTY_TIER_LABEL[rule.value as LoyaltyTier] ?? rule.value}`
    case 'stage':
      return `Stage is ${LIFECYCLE_STAGE_LABEL[rule.value as LifecycleStage] ?? rule.value}`
    case 'interest':
      return `Interested in ${categoryName(rule.value)}`
    case 'city':
      return `Lives in ${rule.value || 'any city'}`
    case 'abandoned_cart':
      return rule.value === 'yes'
        ? 'Abandoned a cart in the last 7 days'
        : 'No abandoned cart in the last 7 days'
  }
}

/** All rules joined in words: "Order count more than 5 and Lifetime spend more than Rp 10 jt". */
export function ruleSummary(
  segment: Pick<Segment, 'rules' | 'match'>,
  categoryName: (id: string) => string,
): string {
  if (!segment.rules.length) return 'No rules yet'
  const parts = segment.rules.map((r) => ruleText(r, categoryName))
  return segment.match === 'all' ? listOf(parts) : parts.join(' or ')
}

/** Why a segment cannot be removed, or null when it can. The reducer refuses the same cases. */

/** The first problem with a rule, as an instruction, or null. */
export function ruleError(rule: SegmentRule): string | null {
  if (NUMERIC_FIELDS.has(rule.field)) {
    const n = Number(rule.value)
    if (rule.value.trim() === '' || !Number.isFinite(n) || n < 0) return 'Enter a number of zero or more.'
    return null
  }
  if (!rule.value)
    return rule.field === 'interest'
      ? 'Choose a category.'
      : rule.field === 'city'
        ? 'Choose a city.'
        : 'Choose a value.'
  return null
}
