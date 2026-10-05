import { fmtIdrShort } from '@rc/fixtures'
import type { LoyaltyConfig, LoyaltyTier } from '@rc/types'

/** Fill classes for tier bars and legends, lowest tier lightest. */
export const TIER_FILL: Record<LoyaltyTier, string> = {
  member: 'bg-chart-muted',
  silver: 'bg-silver',
  gold: 'bg-warning',
  platinum: 'bg-ink',
}

/** The same tier colours for SVG charts, as theme variables. */
export const TIER_COLOR: Record<LoyaltyTier, string> = {
  member: 'var(--color-chart-muted)',
  silver: 'var(--color-silver)',
  gold: 'var(--color-warning)',
  platinum: 'var(--color-ink)',
}

/** Lifetime spend a tier starts at. */
export function tierMinimum(tier: LoyaltyTier, loyalty: LoyaltyConfig): number {
  return tier === 'member' ? 0 : loyalty.thresholds[tier]
}

export function tierRequirement(tier: LoyaltyTier, loyalty: LoyaltyConfig): string {
  return tier === 'member'
    ? 'Everyone who signs up'
    : `Lifetime spend from ${fmtIdrShort(loyalty.thresholds[tier])}`
}

export interface Reward {
  key: string
  name: string
  points: number
  detail: string
}

/** The rewards catalogue members can redeem points for. */
export const REWARDS: Reward[] = [
  {
    key: 'voucher-50',
    name: 'Rp 50 rb voucher',
    points: 500,
    detail: 'Off the next order, no minimum spend',
  },
  { key: 'free-shipping', name: 'Free shipping', points: 300, detail: 'One order, any courier' },
  {
    key: 'early-access',
    name: 'Exclusive colourway early access',
    points: 1500,
    detail: 'Shop limited drops 48 hours early',
  },
  { key: 'event', name: 'Event invitation', points: 2000, detail: 'A seat at the next community event' },
  { key: 'free-product', name: 'Free product', points: 3000, detail: 'One item from the rewards shelf' },
]
