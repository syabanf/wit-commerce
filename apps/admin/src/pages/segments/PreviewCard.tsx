import { fmtIdr, fmtNumber, fmtPercent, metricsFor, plural } from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { LOYALTY_TIER_FLOW, LOYALTY_TIER_LABEL } from '@rc/types'
import { Card, CardContent, CardHeader, CardTitle, Donut, EmptyState, cn } from '@rc/ui'
import { CustomerLink } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { TIER_COLOR, TIER_FILL } from '../loyalty/lib'

const SAMPLE = 8

/** Who the rules match right now: count, share, tier mix and the first members. */
export function PreviewCard({ members, total }: { members: Customer[]; total: number }) {
  const { crm } = useScoped()
  const byTier = LOYALTY_TIER_FLOW.map((tier) => ({
    key: tier,
    label: LOYALTY_TIER_LABEL[tier],
    value: members.filter((c) => c.tier === tier).length,
    color: TIER_COLOR[tier],
  }))
  const share = total ? members.length / total : 0
  const sample = members.slice(0, SAMPLE)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live preview</CardTitle>
        <p className="text-sm text-muted">Updates as you edit the rules.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="gap-5 flex flex-wrap items-center">
          <Donut
            segments={byTier}
            size={132}
            thickness={14}
            centerValue={fmtNumber(members.length)}
            centerLabel="members"
            ariaLabel="Members by loyalty tier"
          />
          <div className="min-w-0 space-y-3 flex-1">
            <p className="text-sm">
              <span className="text-2xl font-bold tabular-nums">{fmtPercent(share)}</span>
              <span className="ml-1.5 text-muted">of {fmtNumber(total)} customers</span>
            </p>
            <ul className="space-y-1.5 text-xs">
              {byTier.map((t) => (
                <li key={t.key} className="gap-2 flex items-center">
                  <span
                    aria-hidden="true"
                    className={cn('size-2.5 shrink-0 rounded-full', TIER_FILL[t.key])}
                  />
                  <span className="flex-1 text-body">{t.label}</span>
                  <span className="font-semibold tabular-nums">{fmtNumber(t.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {sample.length ? (
          <div>
            <p className="mb-2 font-semibold tracking-wider text-[0.6875rem] text-muted uppercase">
              {members.length > SAMPLE ? `First ${SAMPLE} of ${fmtNumber(members.length)}` : 'Members'}
            </p>
            <ul className="space-y-1.5">
              {sample.map((c) => {
                const m = metricsFor(crm.metrics, c.id)
                return (
                  <li key={c.id} className="gap-3 rounded-2xl px-3 py-2 flex items-center bg-surface-2">
                    <CustomerLink customerId={c.id} className="min-w-0 flex-1" />
                    <span className="text-xs shrink-0 text-right tabular-nums">
                      <span className="font-semibold block">{fmtIdr(m.spend)}</span>
                      <span className="block text-muted">{plural(m.orders, 'order')}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <EmptyState
            compact
            title="No customers match"
            description="Loosen a rule or switch to Match any to widen the audience."
          />
        )}
      </CardContent>
    </Card>
  )
}
