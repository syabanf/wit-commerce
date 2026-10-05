import {
  type CustomerMetrics,
  favouriteCategory,
  fmtDate,
  fmtIdr,
  fmtNumber,
  inSegment,
  plural,
  toMs,
} from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { CHANNEL_LABEL } from '@rc/types'
import { Badge, Button, Card, CardContent, CardHeader, KeyValue, Kicker } from '@rc/ui'
import { Plus } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link } from 'react-router'
import { TicketStatusBadge, TierBadge } from '../../components/badges'
import { SellerChip, paths } from '../../components/links'
import { useScoped } from '../../state/scoped'

function SideCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader action={action}>
        <Kicker className="font-bold text-[13px] tracking-[0.4px] text-foreground">{title}</Kicker>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const rowClass =
  'flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface'

export function IdentityCard({ customer }: { customer: Customer }) {
  const s = useScoped()
  return (
    <SideCard title="Identity">
      <KeyValue
        bare
        labelWidth="sm"
        items={[
          {
            label: 'Email',
            value: customer.email ? (
              <a href={`mailto:${customer.email}`} className="hover:text-accent">
                {customer.email}
              </a>
            ) : (
              'None'
            ),
          },
          { label: 'Phone', value: customer.phone || 'None' },
          { label: 'City', value: customer.city || 'None' },
          {
            label: 'Birthday',
            value: customer.birthday ? fmtDate(`${customer.birthday}T12:00:00+07:00`) : 'None',
          },
          { label: 'Source', value: CHANNEL_LABEL[customer.source] },
          {
            label: 'Tags',
            value: customer.tags.length ? (
              <span className="gap-1.5 flex flex-wrap">
                {customer.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </span>
            ) : (
              'None'
            ),
          },
          {
            label: 'Interests',
            value: customer.interests.length
              ? customer.interests.map((id) => s.categoryName(id)).join(', ')
              : 'None',
          },
          {
            label: 'Seller',
            value: customer.sellerId ? <SellerChip sellerId={customer.sellerId} /> : 'Unassigned',
          },
        ]}
      />
    </SideCard>
  )
}

export function SegmentsCard({ customer }: { customer: Customer }) {
  const s = useScoped()
  const segments = useMemo(
    () => s.segments.filter((seg) => inSegment(seg, customer, s.crm)),
    [s.segments, s.crm, customer],
  )
  return (
    <SideCard title="Segments">
      {segments.length ? (
        <ul className="space-y-2">
          {segments.map((seg) => (
            <li key={seg.id}>
              <Link to={paths.segment(seg.id)} className={rowClass}>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium block truncate">{seg.name}</span>
                  <span className="block truncate text-[11px] text-muted">{seg.description}</span>
                </span>
                <Badge variant={seg.builtIn ? 'muted' : 'outline'}>
                  {seg.builtIn ? 'Built-in' : 'Custom'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Not in any segment yet. Segments update as the customer buys.</p>
      )}
    </SideCard>
  )
}

export function LoyaltyCard({ customer, onAddPoints }: { customer: Customer; onAddPoints?: () => void }) {
  const { tenant } = useScoped()
  return (
    <SideCard
      title="Loyalty"
      action={
        onAddPoints && (
          <Button variant="outline" size="sm" onClick={onAddPoints}>
            <Plus />
            Add points
          </Button>
        )
      }
    >
      <KeyValue
        bare
        labelWidth="sm"
        items={[
          { label: 'Tier', value: <TierBadge tier={customer.tier} /> },
          {
            label: 'Points',
            value: <span className="font-semibold tabular-nums">{fmtNumber(customer.points)}</span>,
          },
          {
            label: 'Earning',
            value: tenant.loyalty.pointsPer10k
              ? `${plural(tenant.loyalty.pointsPer10k, 'point')} per Rp 10.000 spent`
              : 'Points are off for this brand',
          },
        ]}
      />
    </SideCard>
  )
}

export function TicketsCard({ customer }: { customer: Customer }) {
  const { tickets } = useScoped()
  const own = useMemo(
    () =>
      tickets
        .filter((t) => t.customerId === customer.id)
        .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)),
    [tickets, customer.id],
  )
  return (
    <SideCard title="Support tickets">
      {own.length ? (
        <ul className="space-y-2">
          {own.map((t) => (
            <li key={t.id}>
              <Link to={paths.ticket(t.id)} className={rowClass}>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium block truncate">{t.subject}</span>
                  <span className="block truncate text-[11px] text-muted">
                    <span className="font-mono">{t.code}</span> · {fmtDate(t.createdAt)}
                  </span>
                </span>
                <TicketStatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No tickets. Questions and complaints from this customer show here.
        </p>
      )}
    </SideCard>
  )
}

/** Up to three active products from the customer's favourite category that they never bought. */
export function RecommendedCard({ customer, metrics }: { customer: Customer; metrics: CustomerMetrics }) {
  const s = useScoped()
  const favourite = favouriteCategory(metrics)
  const picks = useMemo(() => {
    if (!favourite) return []
    const bought = new Set(
      s.orders.filter((o) => o.customerId === customer.id).flatMap((o) => o.lines.map((l) => l.productId)),
    )
    return s.products
      .filter((p) => p.status === 'active' && p.categoryId === favourite && !bought.has(p.id))
      .sort((a, b) => b.views30d - a.views30d)
      .slice(0, 3)
  }, [s.orders, s.products, customer.id, favourite])

  return (
    <SideCard title="Recommended for them">
      {picks.length ? (
        <>
          <p className="mb-3 text-xs text-muted">
            From {s.categoryName(favourite)}, the category they buy most.
          </p>
          <ul className="space-y-2">
            {picks.map((p) => (
              <li key={p.id}>
                <Link to={paths.product(p.id)} className={rowClass}>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium block truncate">{p.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{p.code}</span>
                  </span>
                  <span className="text-sm font-semibold shrink-0 tabular-nums">
                    {p.assisted ? 'Talk to sales' : fmtIdr(p.price)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">
          {favourite
            ? 'They already own every active product in their favourite category.'
            : 'Recommendations appear after the first purchase.'}
        </p>
      )}
    </SideCard>
  )
}
