import { fmtAgo, fmtDate, fmtIdr, metricsFor, plural, toMs } from '@rc/fixtures'
import { CUSTOMER_EVENT_LABEL, LIFECYCLE_STAGE_LABEL, LOYALTY_TIER_LABEL } from '@rc/types'
import { Badge, Button, Card, EmptyState, Kicker } from '@rc/ui'
import { NotebookPen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { OrderStatusText } from '../../components/badges'
import { Section } from '../../components/Section'
import { StickyBar } from '../../components/StickyBar'
import { DetailHeader } from '../../layouts/DetailHeader'
import { paths } from '../../lib/paths'
import { useNow, useSellerScope } from '../../state/scope'
import { NoteSheet, RecommendSheet } from './CustomerSheets'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { customers, metrics, customerOrders, customerEvents, user } = useSellerScope()
  const now = useNow()
  const [sheet, setSheet] = useState<'recommend' | 'note' | null>(null)
  const customer = customers.find((c) => c.id === id)

  if (!customer) {
    return (
      <div className="space-y-5">
        <DetailHeader title="Customer not found" fallback={paths.customers} />
        <Card>
          <EmptyState
            title="This customer is not assigned to you"
            description="Customers of other sellers stay with them. Ask your admin to reassign the customer if they buy from you now."
            action={
              <Button asChild variant="outline" className="h-11">
                <Link to={paths.customers}>My customers</Link>
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const m = metricsFor(metrics, customer.id)
  const orders = customerOrders.filter((o) => o.customerId === customer.id)
  const events = customerEvents.filter((e) => e.customerId === customer.id && toMs(e.at) <= now).slice(0, 8)

  return (
    <div className="space-y-5">
      <DetailHeader
        title={customer.name}
        subtitle={`${customer.code} · ${customer.city}`}
        fallback={paths.customers}
      />

      <Card variant="ink" className="p-6">
        <div className="gap-3 flex items-start justify-between">
          <p className="min-w-0 text-xs truncate font-mono text-on-ink-muted">{customer.code}</p>
          <Badge className="bg-white/10 text-white">{LIFECYCLE_STAGE_LABEL[customer.stage]}</Badge>
        </div>
        <Kicker className="mt-4 text-on-ink-muted">Lifetime value</Kicker>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{fmtIdr(m.spend)}</p>
        <dl className="mt-5 gap-3 text-sm grid grid-cols-3">
          <div>
            <dt className="text-xs text-on-ink-muted">Orders</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{m.orders}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-ink-muted">Last purchase</dt>
            <dd className="mt-0.5 font-semibold">{m.lastAt === null ? 'Not yet' : fmtAgo(m.lastAt, now)}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-ink-muted">Tier</dt>
            <dd className="mt-0.5 font-semibold">
              {LOYALTY_TIER_LABEL[customer.tier]} · {customer.points}
              <span className="text-xs font-normal text-on-ink-muted"> pts</span>
            </dd>
          </div>
        </dl>
      </Card>

      <Section title="Last orders" count={orders.length}>
        {orders.length ? (
          <ul className="px-4 divide-y divide-border rounded-[24px] bg-card shadow-card">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="min-h-14 gap-3 py-3 flex items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate font-mono">{o.code}</p>
                  <p className="text-xs truncate text-muted">
                    {fmtDate(o.createdAt)} ·{' '}
                    {plural(
                      o.lines.reduce((n, l) => n + l.qty, 0),
                      'item',
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums">{fmtIdr(o.total)}</p>
                  <OrderStatusText status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <EmptyState
              compact
              title="No orders yet"
              description="Recommend a product to send the first link with your ref."
            />
          </Card>
        )}
      </Section>

      <Section title="Recent activity">
        {events.length ? (
          <ul className="px-4 divide-y divide-border rounded-[24px] bg-card shadow-card">
            {events.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <p className="gap-3 flex items-baseline justify-between">
                  <span className="font-semibold">{CUSTOMER_EVENT_LABEL[e.kind]}</span>
                  <span className="text-xs shrink-0 text-muted">{fmtAgo(e.at, now)}</span>
                </p>
                <p className="mt-0.5 text-xs break-words text-muted">
                  {e.label}
                  {e.kind === 'note' && e.by === user.id ? ' · you' : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <EmptyState
              compact
              title="No activity yet"
              description="Views, carts, orders and your notes show up here."
            />
          </Card>
        )}
      </Section>

      <StickyBar>
        <Button variant="outline" size="lg" className="h-14 px-5 shrink-0" onClick={() => setSheet('note')}>
          <NotebookPen />
          Add note
        </Button>
        <Button size="lg" className="h-14 min-w-0 flex-1" onClick={() => setSheet('recommend')}>
          <Sparkles />
          <span className="truncate">Recommend a product</span>
        </Button>
      </StickyBar>

      <RecommendSheet
        customer={customer}
        open={sheet === 'recommend'}
        onOpenChange={(open) => setSheet(open ? 'recommend' : null)}
      />
      <NoteSheet
        customer={customer}
        open={sheet === 'note'}
        onOpenChange={(open) => setSheet(open ? 'note' : null)}
      />
    </div>
  )
}
