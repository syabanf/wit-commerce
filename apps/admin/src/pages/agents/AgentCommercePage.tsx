import { fmtAgo, fmtIdr, fmtIdrShort, fmtNumber, fmtPercent, fmtWhen, isSold, toMs } from '@rc/fixtures'
import { AGENT_KIND_LABEL, type AgentPolicy } from '@rc/types'
import {
  Badge,
  Banner,
  BarList,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  toast,
} from '@rc/ui'
import { Bot, HandCoins, Pencil, Scale, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ON_INK, OrderStatusBadge } from '../../components/badges'
import { OrderLink, paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { ChartCard } from '../analytics/ChartCard'
import { AgentPolicyDialog } from './AgentPolicyDialog'
import {
  AGENT_KINDS,
  type AgentFilter,
  type AgentOrder,
  FILTERS,
  dayStart,
  defaultPolicy,
  isAgentOrder,
  sessionsPerDay,
  trafficInsight,
} from './lib'

const DAYS = 30

export function AgentCommercePage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('integration.manage')
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [filter, setFilter] = useHistoryState<AgentFilter>('agentFilter', 'all')
  const [editing, setEditing] = useState(false)
  const table = useTableHistory()

  const policy = useMemo(
    () => s.state.agentPolicies.find((p) => p.tenantId === s.tenantId) ?? defaultPolicy(s.tenantId),
    [s.state.agentPolicies, s.tenantId],
  )

  const d = useMemo(() => {
    const from = dayStart(now, DAYS - 1)
    const recent = s.orders.filter((o) => toMs(o.createdAt) >= from)
    const agent = recent.filter(isAgentOrder)
    const net = (list: typeof recent) =>
      list.filter(isSold).reduce((sum, o) => sum + o.total - o.refundedAmount, 0)
    const negotiated = agent.filter((o) => o.agent.negotiated > 0)
    const negotiatedSum = negotiated.reduce((n, o) => n + o.agent.negotiated, 0)
    const negotiatedSubtotal = negotiated.reduce((n, o) => n + o.subtotal, 0)
    const revenue = net(agent)
    const allRevenue = net(recent)
    return {
      agent: agent.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)),
      revenue,
      share: allRevenue ? revenue / allRevenue : 0,
      negotiated: negotiated.length,
      avgNegotiated: negotiated.length ? negotiatedSum / negotiated.length : 0,
      avgNegotiatedPct: negotiatedSubtotal ? negotiatedSum / negotiatedSubtotal : 0,
      avgCompared: agent.length ? agent.reduce((n, o) => n + o.agent.compared, 0) / agent.length : 0,
      byKind: AGENT_KINDS.map((k) => {
        const list = agent.filter((o) => o.agent.kind === k)
        return { kind: k, orders: list.length, revenue: net(list) }
      }).sort((a, b) => b.orders - a.orders),
      sessions: sessionsPerDay(s.traffic, DAYS, now),
      insight: trafficInsight(s.traffic, now),
    }
  }, [s.orders, s.traffic, now])

  const test = FILTERS.find((f) => f.value === filter)?.test ?? (() => true)
  const rows = d.agent.filter(test)

  const columns: Column<AgentOrder>[] = [
    {
      id: 'order',
      header: 'Order',
      sortValue: (o) => o.code,
      cell: (o) => (
        <div className="min-w-0">
          <OrderLink orderId={o.id} />
          <p className="text-xs truncate text-muted">{AGENT_KIND_LABEL[o.agent.kind]}</p>
          <p className="mt-1 leading-4 md:hidden text-[0.6875rem] text-muted">{fmtWhen(o.createdAt, now)}</p>
        </div>
      ),
    },
    {
      id: 'placed',
      header: 'Placed',
      hideBelow: 'md',
      sortValue: (o) => toMs(o.createdAt),
      cell: (o) => <span className="whitespace-nowrap">{fmtWhen(o.createdAt, now)}</span>,
    },
    {
      id: 'intent',
      header: "Shopper's intent",
      hideBelow: 'lg',
      cell: (o) => (
        <p className="text-sm max-w-[22rem] truncate" title={o.agent.intent}>
          {o.agent.intent}
        </p>
      ),
    },
    {
      id: 'negotiated',
      header: 'Negotiated',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (o) => o.agent.negotiated,
      cell: (o) =>
        o.agent.negotiated ? (
          <span className="whitespace-nowrap tabular-nums">-{fmtIdr(o.agent.negotiated)}</span>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (o) => o.total,
      cell: (o) => <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdr(o.total)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'lg',
      sortValue: (o) => o.status,
      cell: (o) => <OrderStatusBadge status={o.status} />,
    },
  ]

  const saved = (p: AgentPolicy) =>
    toast('Agent policy saved', {
      tone: 'success',
      description: p.enabled
        ? `Agents on · ${p.negotiation ? `negotiation up to ${p.maxAutoDiscountPct}%` : 'no negotiation'} · the shopper approves every order`
        : 'Agents off · they get a polite refusal at checkout',
    })

  return (
    <>
      <PageHeader
        title="AI agents"
        description="Buying agents shop for your customers under a mandate. Set what they may do and see what they bought."
      />
      <div className="space-y-4">
        {!policy.enabled && (
          <Banner
            tone="warning"
            title="Agents are turned off"
            action={
              manage && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit policy
                </Button>
              )
            }
          >
            Buying agents get a polite refusal at checkout and are asked to send the shopper to the store
            instead.
          </Banner>
        )}

        <div className="gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
          <StatCard
            label="Agent orders"
            value={fmtNumber(d.agent.length)}
            hint={`Last ${DAYS} days`}
            icon={<Bot />}
            tone="ink"
            onClick={() => setFilter('all')}
          />
          <StatCard
            label="Agent revenue"
            value={fmtIdrShort(d.revenue)}
            hint={`${fmtPercent(d.share, 1)} of all revenue`}
            icon={<Wallet />}
            tone="info"
          />
          <StatCard
            label="Products compared"
            value={d.avgCompared.toFixed(1)}
            unit="per order"
            hint="Shown to the shopper before they chose"
            icon={<Scale />}
            tone="success"
          />
          <StatCard
            label="Average negotiated discount"
            value={fmtIdr(d.avgNegotiated)}
            hint={
              d.negotiated
                ? `${fmtPercent(d.avgNegotiatedPct, 1)} of the cart · ${fmtNumber(d.negotiated)} orders`
                : 'No agent negotiated'
            }
            icon={<HandCoins />}
            tone="default"
            onClick={() => setFilter('negotiated')}
          />
        </div>

        <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] grid grid-cols-1">
          <PolicyCard policy={policy} now={now} onEdit={manage ? () => setEditing(true) : undefined} />
          <ChartCard
            title="Sessions per day"
            method={d.insight}
            table={{
              columns: ['Day', 'Agent / human sessions'],
              rows: d.sessions.map((p) => [p.label, `${fmtNumber(p.agents)} / ${fmtNumber(p.humans)}`]),
            }}
          >
            <SessionsChart data={d.sessions} />
          </ChartCard>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Agent orders</CardTitle>
            <p className="text-sm text-muted">Placed by buying agents in the last {DAYS} days.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChipRow aria-label="Filter agent orders">
              {FILTERS.map((f) => (
                <Chip
                  key={f.value}
                  variant="filter"
                  active={filter === f.value}
                  count={d.agent.filter(f.test).length}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Chip>
              ))}
            </ChipRow>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(o) => o.id}
              onRowClick={(o) => navigate(paths.order(o.id))}
              resetPageKey={filter}
              pageSize={10}
              initialSort={{ id: 'placed', desc: true }}
              empty={
                <EmptyState
                  compact
                  title={d.agent.length ? 'No agent orders match' : 'No agent orders yet'}
                  description={
                    d.agent.length
                      ? 'Pick All to see every agent order.'
                      : 'Orders a buying agent places for a shopper appear here.'
                  }
                />
              }
              {...table}
            />
          </CardContent>
        </Card>

        <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Orders by agent kind</CardTitle>
              <p className="text-sm text-muted">Last {DAYS} days, with sold revenue.</p>
            </CardHeader>
            <CardContent>
              {d.agent.length ? (
                <BarList
                  ariaLabel={`Agent orders by kind, last ${DAYS} days`}
                  items={d.byKind.map((k) => ({
                    key: k.kind,
                    label: AGENT_KIND_LABEL[k.kind],
                    hint: fmtIdrShort(k.revenue),
                    value: k.orders,
                    display: fmtNumber(k.orders),
                  }))}
                />
              ) : (
                <EmptyState compact title="No agent orders" description="Nothing to rank yet." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>How agents bought</CardTitle>
              <p className="text-sm text-muted">What the agents did before they paid.</p>
            </CardHeader>
            <CardContent>
              <dl className="gap-3 sm:grid-cols-2 grid grid-cols-1">
                <Fact
                  label="Shopper approval"
                  value="Every order"
                  hint="The agent asks before it pays"
                />
                <Fact
                  label="Negotiated"
                  value={fmtPercent(d.agent.length ? d.negotiated / d.agent.length : 0)}
                  hint={`${fmtNumber(d.negotiated)} of ${fmtNumber(d.agent.length)} orders asked for a discount`}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <AgentPolicyDialog open={editing} onOpenChange={setEditing} policy={policy} onSaved={saved} />
    </>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl p-4 bg-surface-2">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted">{hint}</dd>
    </div>
  )
}

function PolicyCard({ policy, now, onEdit }: { policy: AgentPolicy; now: number; onEdit?: () => void }) {
  const s = useScoped()
  const payable = s.paymentTypes.filter((t) => t.enabled)
  const allowed = policy.paymentTypeIds.length
    ? payable.filter((t) => policy.paymentTypeIds.includes(t.id))
    : payable
  const rows = [
    {
      label: 'Negotiation',
      value: policy.negotiation ? `Up to ${policy.maxAutoDiscountPct}% on its own` : 'Off',
    },
    { label: 'Shopper approval', value: 'Every order, before payment' },
    {
      label: 'Payment types',
      value: policy.paymentTypeIds.length
        ? allowed.map((t) => t.name).join(', ') || 'None that is on'
        : 'Every payment type that is on',
    },
  ]
  return (
    <Card variant="ink" className="p-5 flex flex-col">
      <div className="gap-2 flex flex-wrap items-start justify-between">
        <div className="min-w-0">
          <p className="font-semibold tracking-wider text-[0.6875rem] text-on-ink-muted uppercase">
            Agent policy
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">
            {policy.enabled ? 'Accepting buying agents' : 'Agents turned off'}
          </h2>
          <p className="mt-0.5 text-xs text-on-ink-muted">
            {policy.updatedAt ? `Updated ${fmtAgo(policy.updatedAt, now)}` : 'Not saved yet'}
          </p>
        </div>
        {onEdit && (
          <Button variant="onInk" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
        )}
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="gap-1 sm:gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] grid grid-cols-1">
            <dt className="text-on-ink-muted">{r.label}</dt>
            <dd className="font-medium">{r.value}</dd>
          </div>
        ))}
        <div className="gap-1 sm:gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] grid grid-cols-1">
          <dt className="text-on-ink-muted">Accepted agents</dt>
          <dd className="gap-1.5 flex flex-wrap">
            {policy.kinds.length ? (
              policy.kinds.map((k) => (
                <Badge key={k} className={ON_INK}>
                  {AGENT_KIND_LABEL[k]}
                </Badge>
              ))
            ) : (
              <span className="font-medium">None</span>
            )}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

/** Stacked columns: agent sessions in accent at the base, human sessions above in muted grey. */
function SessionsChart({ data }: { data: { key: string; label: string; agents: number; humans: number }[] }) {
  const max = Math.max(0, ...data.map((p) => p.agents + p.humans))
  if (!max) return <p className="py-16 text-sm text-center text-muted">No sessions recorded</p>
  const ticks = [0, Math.floor((data.length - 1) / 2), data.length - 1]
  return (
    <div>
      <div className="mb-3 gap-4 text-xs flex flex-wrap text-muted">
        <span className="gap-1.5 inline-flex items-center">
          <span className="size-2.5 rounded-sm bg-accent" /> Agent sessions
        </span>
        <span className="gap-1.5 inline-flex items-center">
          <span className="size-2.5 rounded-sm bg-chart-muted" /> Human sessions
        </span>
      </div>
      <div
        role="img"
        aria-label={`Agent and human sessions per day, last ${data.length} days`}
        className="h-48 flex items-end gap-[2px]"
      >
        {data.map((p) => (
          <div
            key={p.key}
            title={`${p.label}: ${fmtNumber(p.agents)} agent, ${fmtNumber(p.humans)} human`}
            className="min-w-0 flex h-full flex-1 flex-col justify-end"
          >
            <div className="rounded-t-sm bg-chart-muted" style={{ height: `${(p.humans / max) * 100}%` }} />
            <div className="mt-[1px] bg-accent" style={{ height: `${(p.agents / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.6875rem] text-muted">
        {ticks.map((i) => (
          <span key={i}>{data[i]?.label}</span>
        ))}
      </div>
    </div>
  )
}
