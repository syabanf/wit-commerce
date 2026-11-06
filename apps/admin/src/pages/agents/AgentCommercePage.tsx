import type { OrderRow } from '@rc/api'
import { dayKey, fmtAgo, fmtIdr, fmtIdrShort, fmtNumber, fmtPercent, fmtWhen, toMs } from '@rc/fixtures'
import { AGENT_KIND_LABEL, type AgentPolicy, SOLD_ORDER_STATUSES } from '@rc/types'
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
  type Column,
  DataTable,
  EmptyState,
  NoMatch,
  PageHeader,
  StatCard,
  TableFilters,
  matchesQuery,
  toast,
} from '@rc/ui'
import { Bot, HandCoins, Pencil, Scale, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ON_INK, OrderStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { HTTP } from '../../lib/api'
import { toRow } from '../../state/orderRow'
import { useNow, useScoped } from '../../state/scoped'
import { useOrderQuery } from '../../state/useOrderQuery'
import { ChartCard } from '../analytics/ChartCard'
import { AgentPolicyDialog } from './AgentPolicyDialog'
import {
  AGENT_KINDS,
  type AgentFilter,
  FILTERS,
  dayStart,
  defaultPolicy,
  sessionsPerDay,
  trafficInsight,
} from './lib'

const DAYS = 30

type AgentRow = OrderRow & { agentInfo: NonNullable<OrderRow['agentInfo']> }
const isAgentRow = (o: OrderRow): o is AgentRow => !!o.agentInfo
const isSold = (o: OrderRow) => SOLD_ORDER_STATUSES.includes(o.status)
const passes = (filter: AgentFilter, o: AgentRow) => filter !== 'negotiated' || o.agentInfo.negotiated > 0

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

  const from = dayStart(now, DAYS - 1)
  // With the API the state holds only open orders, so the window's agent orders come from the read
  // model. At most 500 come back, more than a brand's agents place in a month today.
  const remote = useOrderQuery(
    {
      tenantId: s.tenantId,
      agent: true,
      since: new Date(from).toISOString(),
      sort: 'placed',
      desc: true,
      pageSize: 500,
    },
    s.orders,
  )

  const d = useMemo(() => {
    const rows = HTTP
      ? (remote.page?.rows ?? [])
      : s.orders
          .filter((o) => o.agent && toMs(o.createdAt) >= from)
          .map((o) => toRow(o, s.customerName(o.customerId)))
          // Newest first; orders placed the same second by id, as the API orders them.
          .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const agent = rows.filter(isAgentRow)
    const net = (list: AgentRow[]) =>
      list.filter(isSold).reduce((sum, o) => sum + o.total - o.refundedAmount, 0)
    const negotiated = agent.filter((o) => o.agentInfo.negotiated > 0)
    const negotiatedSum = negotiated.reduce((n, o) => n + o.agentInfo.negotiated, 0)
    const negotiatedSubtotal = negotiated.reduce((n, o) => n + o.subtotal, 0)
    const revenue = net(agent)
    // Every sold order in the window, net of refunds, from the sales read model.
    const first = dayKey(from)
    const allRevenue = s.facts.salesDays.reduce((sum, x) => (x.day >= first ? sum + x.revenue : sum), 0)
    return {
      agent,
      revenue,
      share: allRevenue ? revenue / allRevenue : 0,
      negotiated: negotiated.length,
      avgNegotiated: negotiated.length ? negotiatedSum / negotiated.length : 0,
      avgNegotiatedPct: negotiatedSubtotal ? negotiatedSum / negotiatedSubtotal : 0,
      avgCompared: agent.length ? agent.reduce((n, o) => n + o.agentInfo.compared, 0) / agent.length : 0,
      byKind: AGENT_KINDS.map((k) => {
        const list = agent.filter((o) => o.agentInfo.kind === k)
        return { kind: k, orders: list.length, revenue: net(list) }
      }).sort((a, b) => b.orders - a.orders),
      sessions: sessionsPerDay(s.traffic, DAYS, now),
      insight: trafficInsight(s.traffic, now),
    }
  }, [s, remote.page, from, now])

  const [query, setQuery] = useHistoryState('agentQuery', '')
  const searched = d.agent.filter((o) =>
    matchesQuery(query, o.code, o.customerName, o.agentInfo.intent, AGENT_KIND_LABEL[o.agentInfo.kind]),
  )
  const rows = searched.filter((o) => passes(filter, o))
  const activeCount = (query.trim() ? 1 : 0) + (filter === 'all' ? 0 : 1)
  const clear = () => {
    setQuery('')
    setFilter('all')
  }

  const columns: Column<AgentRow>[] = [
    {
      id: 'order',
      header: 'Order',
      sortValue: (o) => o.code,
      cell: (o) => (
        <div className="min-w-0">
          {/* From the row, since a closed order is no longer in the state with the API. */}
          <Link
            to={paths.order(o.id)}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium font-mono text-foreground hover:text-accent hover:underline"
          >
            {o.code}
          </Link>
          <p className="text-xs truncate text-muted">{AGENT_KIND_LABEL[o.agentInfo.kind]}</p>
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
        <p className="text-sm max-w-[22rem] truncate" title={o.agentInfo.intent}>
          {o.agentInfo.intent}
        </p>
      ),
    },
    {
      id: 'negotiated',
      header: 'Negotiated',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (o) => o.agentInfo.negotiated,
      cell: (o) =>
        o.agentInfo.negotiated ? (
          <span className="whitespace-nowrap tabular-nums">-{fmtIdr(o.agentInfo.negotiated)}</span>
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
          <TableFilters
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Order, customer or intent"
            searchLabel="Search agent orders"
            shown={rows.length}
            total={d.agent.length}
            activeCount={activeCount}
            onClear={clear}
            chips={FILTERS.map((f) => (
              <Chip
                key={f.value}
                active={filter === f.value}
                count={searched.filter((o) => passes(f.value, o)).length}
                onClick={() => setFilter(filter === f.value ? 'all' : f.value)}
              >
                {f.label}
              </Chip>
            ))}
          />
          <CardContent>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(o) => o.id}
              onRowClick={(o) => navigate(paths.order(o.id))}
              resetPageKey={`${query}|${filter}`}
              pageSize={10}
              initialSort={{ id: 'placed', desc: true }}
              empty={
                activeCount ? (
                  <NoMatch title="No agent orders match" onClear={clear} />
                ) : (
                  <EmptyState
                    compact
                    title="No agent orders yet"
                    description="Orders a buying agent places for a shopper appear here."
                  />
                )
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
                <Fact label="Shopper approval" value="Every order" hint="The agent asks before it pays" />
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
