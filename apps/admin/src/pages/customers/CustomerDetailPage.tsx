import {
  type CustomerMetrics,
  fmtAgo,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  metricsFor,
  nextTierGap,
  tierFor,
  toMs,
} from '@rc/fixtures'
import type { Customer, Order } from '@rc/types'
import { CHANNEL_LABEL, LIFECYCLE_FLOW, LIFECYCLE_STAGE_LABEL, LOYALTY_TIER_LABEL } from '@rc/types'
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  Steps,
  type StepsProps,
  toast,
} from '@rc/ui'
import { Coins, Copy, MessageSquarePlus, MoreHorizontal, Pencil } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ON_INK, OrderStatusBadge } from '../../components/badges'
import { OrderLink, paths } from '../../components/links'
import { useNow, useScoped } from '../../state/scoped'
import { tierMinimum } from '../loyalty/lib'
import { AddPointsDialog } from './AddPointsDialog'
import { CustomerDialog } from './CustomerDialog'
import { IdentityCard, LoyaltyCard, RecommendedCard, SegmentsCard, TicketsCard } from './CustomerSideCards'
import { TimelineCard } from './TimelineCard'
import { HeroMetric } from '../../components/HeroMetric'

type Pending = 'edit' | 'points' | null

function lifecycleSteps(customer: Customer, m: CustomerMetrics): StepsProps['steps'] {
  const index = LIFECYCLE_FLOW.indexOf(customer.stage)
  // At risk and dormant sit outside the flow: show how far the customer got.
  const reached =
    index >= 0
      ? index
      : LIFECYCLE_FLOW.indexOf(m.orders >= 2 ? 'repeat_buyer' : m.orders === 1 ? 'first_buyer' : 'registered')
  return LIFECYCLE_FLOW.map((stage, i) => ({
    key: stage,
    label: LIFECYCLE_STAGE_LABEL[stage],
    state:
      index < 0
        ? i <= reached
          ? 'done'
          : 'upcoming'
        : i < index
          ? 'done'
          : i === index
            ? 'current'
            : 'upcoming',
    hint:
      stage === 'registered'
        ? fmtDate(customer.createdAt)
        : stage === 'first_buyer' && m.firstAt !== null
          ? fmtDate(m.firstAt)
          : undefined,
  }))
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [pending, setPending] = useState<Pending>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const customer = s.customers.find((c) => c.id === id)
  const orders = useMemo(
    () => s.orders.filter((o) => o.customerId === id).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)),
    [s.orders, id],
  )

  if (!customer) {
    return (
      <Card>
        <EmptyState
          title="Customer not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback="/customers/all" />}
        />
      </Card>
    )
  }

  const m = metricsFor(s.crm.metrics, customer.id)
  const manage = can('customer.manage')
  const gap = nextTierGap(m.spend, s.tenant.loyalty)
  const spendTier = tierFor(m.spend, s.tenant.loyalty)
  const tierFloor = tierMinimum(spendTier, s.tenant.loyalty)
  const progress = gap ? (m.spend - tierFloor) / (gap.gap + m.spend - tierFloor) : 1

  const focusComposer = () => {
    const el = composerRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  const copyEmail = () => {
    navigator.clipboard
      .writeText(customer.email)
      .then(() => toast('Email copied', { description: customer.email }))
      .catch(() =>
        toast('Could not copy the email', {
          tone: 'danger',
          description: 'Select the address in the Identity card and copy it by hand.',
        }),
      )
  }

  const columns: Column<Order>[] = [
    { id: 'order', header: 'Order', sortValue: (o) => o.code, cell: (o) => <OrderLink orderId={o.id} /> },
    {
      id: 'placed',
      header: 'Placed',
      hideBelow: 'sm',
      sortValue: (o) => toMs(o.createdAt),
      cell: (o) => <span className="whitespace-nowrap">{fmtDate(o.createdAt)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (o) => o.status,
      cell: (o) => <OrderStatusBadge status={o.status} />,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (o) => o.total,
      cell: (o) => <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdr(o.total)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback="/customers/all" />
        <div className="gap-2 flex flex-wrap items-center">
          {manage && (
            <Button onClick={focusComposer}>
              <MessageSquarePlus />
              Add note
            </Button>
          )}
          {manage && (
            <Button variant="outline" onClick={() => setPending('edit')}>
              <Pencil />
              Edit
            </Button>
          )}
          <ActionMenu
            title={customer.code}
            trigger={
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            }
            items={[
              ...(manage
                ? [
                    {
                      key: 'points',
                      label: 'Add points',
                      description: 'Goodwill, corrections or manual rewards',
                      icon: <Coins />,
                      onSelect: () => setPending('points'),
                    },
                  ]
                : []),
              {
                key: 'email',
                label: 'Copy email',
                description: customer.email || 'No email on file',
                icon: <Copy />,
                disabled: !customer.email,
                onSelect: copyEmail,
              },
            ]}
          />
        </div>
      </div>

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {customer.code} · {CHANNEL_LABEL[customer.source]}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{customer.name}</h1>
            <p className="mt-1 gap-x-2 text-sm flex flex-wrap items-center text-on-ink-muted">
              {customer.city && <span>{customer.city}</span>}
              {customer.city && <span>·</span>}
              <span>Customer since {fmtDate(customer.createdAt)}</span>
            </p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <Badge className={ON_INK}>{LIFECYCLE_STAGE_LABEL[customer.stage]}</Badge>
            <Badge className={ON_INK}>{LOYALTY_TIER_LABEL[customer.tier]}</Badge>
          </div>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-3 lg:grid-cols-5 grid grid-cols-2">
          <HeroMetric label="Lifetime value" value={fmtIdrShort(m.spend)} />
          <HeroMetric label="Orders" value={fmtNumber(m.orders)} unit="sold" />
          <HeroMetric label="AOV" value={m.orders ? fmtIdrShort(m.aov) : '-'} />
          <HeroMetric label="Last purchase" value={m.lastAt === null ? 'Never' : fmtAgo(m.lastAt, now)} />
          <HeroMetric label="Points" value={fmtNumber(customer.points)} unit="balance" />
        </div>
        <div className="mt-4">
          <div className="mb-1.5 gap-2 text-xs flex flex-wrap items-center justify-between text-on-ink-muted">
            <span>{LOYALTY_TIER_LABEL[spendTier]} by spend</span>
            <span>
              {gap ? `${fmtIdrShort(gap.gap)} to ${LOYALTY_TIER_LABEL[gap.tier]}` : 'Top tier reached'}
            </span>
          </div>
          <div
            className="h-1.5 bg-white/15 overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Progress to the next tier"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="bg-white h-full rounded-full"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
        {customer.stage === 'at_risk' && (
          <p className="mt-3 rounded-2xl px-3 py-2 text-sm bg-accent/20">
            At risk:{' '}
            {m.daysSinceLast === null
              ? 'no purchase yet'
              : `no purchase for ${fmtNumber(m.daysSinceLast)} days`}
            . A win-back message or a seller call keeps them from going dormant.
          </p>
        )}
        {customer.stage === 'dormant' && (
          <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Dormant:{' '}
            {m.daysSinceLast === null ? 'never bought' : `last bought ${fmtNumber(m.daysSinceLast)} days ago`}
            . They stay out of regular campaigns until they buy again.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <Steps steps={lifecycleSteps(customer, m)} />
      </Card>

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
        <div className="min-w-0 space-y-4">
          <TimelineCard customer={customer} now={now} canNote={manage} composerRef={composerRef} />
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
              <p className="text-sm text-muted">
                {orders.length
                  ? `${fmtNumber(orders.length)} placed · ${fmtIdr(m.spend)} sold`
                  : 'No orders yet.'}
              </p>
            </CardHeader>
            {orders.length > 0 && (
              <DataTable
                className="px-1 pb-3"
                columns={columns}
                rows={orders}
                pageSize={8}
                getRowKey={(o) => o.id}
                onRowClick={(o) => navigate(paths.order(o.id))}
                initialSort={{ id: 'placed', desc: true }}
              />
            )}
          </Card>
        </div>
        <div className="min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 grid grid-cols-1 content-start">
          <IdentityCard customer={customer} />
          <SegmentsCard customer={customer} />
          <LoyaltyCard customer={customer} onAddPoints={manage ? () => setPending('points') : undefined} />
          <TicketsCard customer={customer} />
          <RecommendedCard customer={customer} metrics={m} />
        </div>
      </div>

      <CustomerDialog
        open={pending === 'edit'}
        onOpenChange={(o) => !o && setPending(null)}
        editing={customer}
      />
      <AddPointsDialog
        customer={customer}
        open={pending === 'points'}
        onOpenChange={(o) => !o && setPending(null)}
      />
    </div>
  )
}
