import { DAY, fmtIdr, fmtNumber, fmtPercent, plural, toMs } from '@rc/fixtures'
import type { LoyaltyTier } from '@rc/types'
import { LOYALTY_TIER_FLOW, LOYALTY_TIER_LABEL } from '@rc/types'
import {
  BarList,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  PageHeader,
  SegmentBar,
  StatCard,
  cn,
} from '@rc/ui'
import { Award, Coins, Crown, Medal, TrendingUp, Users } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { TierBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/scoped'
import { REWARDS, TIER_FILL, tierRequirement } from './lib'

const TIER_ICON: Record<LoyaltyTier, ReactNode> = {
  member: <Users />,
  silver: <Medal />,
  gold: <Award />,
  platinum: <Crown />,
}
const TOP = 8

export function LoyaltyPage() {
  const s = useScoped()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const loyalty = s.tenant.loyalty

  const data = useMemo(() => {
    const byTier = Object.fromEntries(
      LOYALTY_TIER_FLOW.map((t) => [t, s.customers.filter((c) => c.tier === t).length]),
    ) as Record<LoyaltyTier, number>
    const since = now - 30 * DAY
    const movedUp = new Set(
      s.customerEvents
        .filter((e) => e.kind === 'tier_upgraded' && toMs(e.at) >= since && toMs(e.at) <= now)
        .map((e) => e.customerId),
    )
    const top = [...s.customers].sort((a, b) => b.points - a.points).slice(0, TOP)
    return {
      byTier,
      points: s.customers.reduce((n, c) => n + c.points, 0),
      movedUp: movedUp.size,
      top,
      canRedeem: REWARDS.map((r) => s.customers.filter((c) => c.points >= r.points).length),
    }
  }, [s.customers, s.customerEvents, now])

  const total = s.customers.length
  const pointsOff = loyalty.pointsPer10k === 0

  return (
    <>
      <PageHeader
        title="Loyalty"
        description="Tiers, points and rewards: who sits in each tier, what it takes to move up and what members can redeem today."
      />
      <div className="space-y-4">
        <div className="gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-6 grid grid-cols-2">
          {LOYALTY_TIER_FLOW.map((tier) => (
            <StatCard
              key={tier}
              label={LOYALTY_TIER_LABEL[tier]}
              value={fmtNumber(data.byTier[tier])}
              unit="members"
              hint={tierRequirement(tier, loyalty)}
              icon={TIER_ICON[tier]}
              tone={tier === 'platinum' ? 'ink' : tier === 'gold' ? 'warning' : 'default'}
              onClick={() => navigate(`/customers/all?tier=${tier}`)}
            />
          ))}
          <StatCard
            label="Points outstanding"
            value={fmtNumber(data.points)}
            hint="Unredeemed across all members"
            icon={<Coins />}
            tone="info"
          />
          <StatCard
            label="Moved up in 30 days"
            value={fmtNumber(data.movedUp)}
            unit="members"
            hint="Reached a higher tier"
            icon={<TrendingUp />}
            tone="success"
          />
        </div>

        <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Tier ladder</CardTitle>
              <p className="text-sm text-muted">Tiers follow lifetime spend on sold orders, minus refunds.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-2">
                {LOYALTY_TIER_FLOW.map((tier, i) => (
                  <li
                    key={tier}
                    className="gap-3 rounded-2xl px-3 py-2.5 flex flex-wrap items-center bg-surface-2"
                  >
                    <span className="w-5 text-xs text-muted tabular-nums">{i + 1}</span>
                    <TierBadge tier={tier} />
                    <span className="min-w-0 text-sm flex-1 text-body">
                      {tier === 'member' ? 'From sign-up' : `From ${fmtIdr(loyalty.thresholds[tier])}`}
                    </span>
                    <span className="text-sm shrink-0 text-right">
                      <span className="font-semibold tabular-nums">{fmtNumber(data.byTier[tier])}</span>
                      <span className="ml-1.5 text-xs text-muted">
                        {total ? fmtPercent(data.byTier[tier] / total) : '0%'}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <div>
                <SegmentBar
                  segments={LOYALTY_TIER_FLOW.map((t) => ({
                    key: t,
                    value: data.byTier[t],
                    className: TIER_FILL[t],
                    label: LOYALTY_TIER_LABEL[t],
                  }))}
                />
                <ul className="mt-3 gap-x-4 gap-y-1.5 text-xs flex flex-wrap">
                  {LOYALTY_TIER_FLOW.map((t) => (
                    <li key={t} className="gap-1.5 flex items-center">
                      <span aria-hidden="true" className={cn('size-2.5 rounded-full', TIER_FILL[t])} />
                      <span className="text-body">{LOYALTY_TIER_LABEL[t]}</span>
                      <span className="font-semibold tabular-nums">{fmtNumber(data.byTier[t])}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Earning rule</CardTitle>
              <p className="text-sm text-muted">
                Points post when an order is paid. Cash on delivery posts when processing starts.
              </p>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                labelWidth="lg"
                items={[
                  {
                    label: 'Per Rp 10.000 spent',
                    value: pointsOff
                      ? 'Points are off for this brand'
                      : plural(loyalty.pointsPer10k, 'point'),
                  },
                  { label: 'Free shipping from', value: fmtIdr(loyalty.freeShippingMin) },
                  { label: 'Silver from', value: fmtIdr(loyalty.thresholds.silver) },
                  { label: 'Gold from', value: fmtIdr(loyalty.thresholds.gold) },
                  { label: 'Platinum from', value: fmtIdr(loyalty.thresholds.platinum) },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rewards catalogue</CardTitle>
              <p className="text-sm text-muted">
                What members can redeem, and how many hold enough points today.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {REWARDS.map((r, i) => (
                  <li
                    key={r.key}
                    className="gap-3 rounded-2xl px-3 py-2.5 flex flex-wrap items-center bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium block truncate">{r.name}</span>
                      <span className="block truncate text-[0.6875rem] text-muted">{r.detail}</span>
                    </span>
                    <span className="text-xs shrink-0 text-right">
                      <span className="text-sm font-semibold block tabular-nums">
                        {fmtNumber(r.points)} pts
                      </span>
                      <span className="block text-muted">
                        {plural(data.canRedeem[i] ?? 0, 'member')} can redeem
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top members by points</CardTitle>
              <p className="text-sm text-muted">
                The {TOP} biggest balances. Select a member to open their Customer 360.
              </p>
            </CardHeader>
            <CardContent>
              {data.top.length && data.top[0]!.points > 0 ? (
                <BarList
                  ariaLabel="Top members by points"
                  items={data.top.map((c, i) => ({
                    key: c.id,
                    label: c.name,
                    hint: LOYALTY_TIER_LABEL[c.tier],
                    value: c.points,
                    display: `${fmtNumber(c.points)} pts`,
                    emphasis: i === 0,
                    onClick: () => navigate(paths.customer(c.id)),
                  }))}
                />
              ) : (
                <EmptyState
                  compact
                  title="No points earned yet"
                  description="Balances appear once members pay for their first orders."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
