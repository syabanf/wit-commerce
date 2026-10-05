import {
  type CustomerMetrics,
  DAY,
  fmtAgo,
  fmtIdr,
  fmtNumber,
  fmtPercent,
  metricsFor,
  repeatRate,
  toMs,
} from '@rc/fixtures'
import type { Customer, LifecycleStage, LoyaltyTier } from '@rc/types'
import { LIFECYCLE_STAGE_LABEL, LOYALTY_TIER_FLOW, LOYALTY_TIER_LABEL } from '@rc/types'
import {
  Avatar,
  Banner,
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
} from '@rc/ui'
import { Plus, Repeat, Search, TriangleAlert, UserPlus, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { LifecycleBadge, TierBadge } from '../../components/badges'
import { SellerChip, paths } from '../../components/links'
import { SellerPicker } from '../../components/pickers'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { CustomerDialog } from './CustomerDialog'

const STAGES = Object.keys(LIFECYCLE_STAGE_LABEL) as LifecycleStage[]
const TIER_OPTIONS = LOYALTY_TIER_FLOW.map((t) => ({ value: t, label: LOYALTY_TIER_LABEL[t] }))

/** Saved views other pages link to with ?view=. */
type View = 'all' | 'new' | 'repeat' | 'at-risk'

const VIEW_LABEL: Record<Exclude<View, 'all'>, string> = {
  new: 'Showing customers who joined in the last 30 days',
  repeat: 'Showing customers with two or more orders',
  'at-risk': 'Showing customers at risk or dormant',
}

type Row = { c: Customer; m: CustomerMetrics }

export function CustomersPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const creating = params.get('new') === '1' && can('customer.manage')
  const [query, setQuery] = useHistoryState('query', '')
  const [stage, setStage] = useHistoryState<LifecycleStage | null>('stage', null)
  const [tier, setTier] = useHistoryState<LoyaltyTier | ''>(
    'tier',
    () => (params.get('tier') as LoyaltyTier | null) ?? '',
  )
  const [sellerId, setSellerId] = useHistoryState<string | null>('seller', null)
  const table = useTableHistory()

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key)
        else p.set(key, value)
        p.delete('tier')
        return p
      },
      { replace: true },
    )
  const setView = (next: View) => setParam('view', next === 'all' ? null : next)

  const all = useMemo<Row[]>(
    () => s.customers.map((c) => ({ c, m: metricsFor(s.crm.metrics, c.id) })),
    [s.customers, s.crm],
  )

  const inView = useMemo(() => {
    const since = now - 30 * DAY
    const test: Record<View, (r: Row) => boolean> = {
      all: () => true,
      new: (r) => toMs(r.c.createdAt) >= since,
      repeat: (r) => r.m.orders >= 2,
      'at-risk': (r) => r.c.stage === 'at_risk' || r.c.stage === 'dormant',
    }
    return { test, rows: all.filter(test[view]) }
  }, [all, view, now])

  const stats = useMemo(
    () => ({
      newCount: all.filter(inView.test.new).length,
      atRisk: all.filter((r) => r.c.stage === 'at_risk').length,
      dormant: all.filter((r) => r.c.stage === 'dormant').length,
      repeat: repeatRate(s.orders),
    }),
    [all, inView, s.orders],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inView.rows.filter(({ c }) => {
      if (stage && c.stage !== stage) return false
      if (tier && c.tier !== tier) return false
      if (sellerId && c.sellerId !== sellerId) return false
      if (!q) return true
      return `${c.name} ${c.code} ${c.email} ${c.phone} ${c.city}`.toLowerCase().includes(q)
    })
  }, [inView, query, stage, tier, sellerId])

  const columns: Column<Row>[] = [
    {
      id: 'customer',
      header: 'Customer',
      sortValue: (r) => r.c.name,
      cell: ({ c }) => (
        <div className="min-w-0 gap-3 flex items-center">
          <Avatar name={c.name} color={c.color} size="sm" />
          <div className="min-w-0">
            <p className="font-medium truncate">{c.name}</p>
            <p className="truncate text-[0.6875rem] text-muted">
              <span className="font-mono">{c.code}</span>
              {c.phone && <span> · {c.phone}</span>}
            </p>
            <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
              <LifecycleBadge stage={c.stage} />
              <TierBadge tier={c.tier} />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'stage',
      header: 'Stage',
      hideBelow: 'sm',
      sortValue: (r) => STAGES.indexOf(r.c.stage),
      cell: ({ c }) => <LifecycleBadge stage={c.stage} />,
    },
    {
      id: 'tier',
      header: 'Tier',
      hideBelow: 'md',
      sortValue: (r) => LOYALTY_TIER_FLOW.indexOf(r.c.tier),
      cell: ({ c }) => <TierBadge tier={c.tier} />,
    },
    {
      id: 'orders',
      header: 'Orders',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.m.orders,
      cell: ({ m }) => <span className="tabular-nums">{fmtNumber(m.orders)}</span>,
    },
    {
      id: 'spend',
      header: 'Lifetime spend',
      align: 'right',
      sortValue: (r) => r.m.spend,
      cell: ({ m }) => (
        <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdr(m.spend)}</span>
      ),
    },
    {
      id: 'last',
      header: 'Last purchase',
      hideBelow: 'md',
      sortValue: (r) => r.m.lastAt,
      cell: ({ m }) =>
        m.lastAt === null ? (
          <span className="text-muted">-</span>
        ) : (
          <span className="whitespace-nowrap">{fmtAgo(m.lastAt, now)}</span>
        ),
    },
    {
      id: 'seller',
      header: 'Seller',
      hideBelow: 'xl',
      sortValue: (r) => s.sellerName(r.c.sellerId),
      cell: ({ c }) => <SellerChip sellerId={c.sellerId} />,
    },
    {
      id: 'city',
      header: 'City',
      hideBelow: 'lg',
      sortValue: (r) => r.c.city,
      cell: ({ c }) => c.city || <span className="text-muted">-</span>,
    },
  ]

  const filtered = view !== 'all' || !!stage || !!tier || !!sellerId || !!query.trim()
  const clearFilters = () => {
    setQuery('')
    setStage(null)
    setTier('')
    setSellerId(null)
    setView('all')
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who registered, bought or talked to the brand, with their lifecycle stage, tier and lifetime spend."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search customers"
              leftIcon={<Search />}
              placeholder="Search name, code, email or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {can('customer.manage') && (
              <Button onClick={() => setParam('new', '1')}>
                <Plus />
                New customer
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        {view !== 'all' && (
          <Banner
            tone="info"
            title={VIEW_LABEL[view]}
            action={
              <Button variant="outline" size="sm" onClick={() => setView('all')}>
                Show all customers
              </Button>
            }
          />
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Customers"
            value={fmtNumber(all.length)}
            hint="All registered profiles"
            icon={<Users />}
            tone="ink"
            onClick={() => setView('all')}
          />
          <StatCard
            label="New in 30 days"
            value={fmtNumber(stats.newCount)}
            hint="Joined since the start of the window"
            icon={<UserPlus />}
            tone="info"
            onClick={() => setView('new')}
          />
          <StatCard
            label="Repeat purchase rate"
            value={fmtPercent(stats.repeat)}
            hint="Buyers with two or more orders"
            icon={<Repeat />}
            tone="success"
            onClick={() => setView('repeat')}
          />
          <StatCard
            label="At risk and dormant"
            value={fmtNumber(stats.atRisk + stats.dormant)}
            hint={`${fmtNumber(stats.atRisk)} at risk · ${fmtNumber(stats.dormant)} dormant`}
            icon={<TriangleAlert />}
            tone={stats.atRisk + stats.dormant ? 'warning' : 'default'}
            onClick={() => setView('at-risk')}
          />
        </div>
        <div className="gap-2 flex flex-wrap items-center">
          <ChipRow className="max-w-full">
            <Chip variant="filter" active={!stage} count={inView.rows.length} onClick={() => setStage(null)}>
              All
            </Chip>
            {STAGES.map((st) => {
              const count = inView.rows.filter((r) => r.c.stage === st).length
              if (!count && stage !== st) return null
              return (
                <Chip
                  key={st}
                  variant="filter"
                  active={stage === st}
                  count={count}
                  onClick={() => setStage(stage === st ? null : st)}
                >
                  {LIFECYCLE_STAGE_LABEL[st]}
                </Chip>
              )
            })}
          </ChipRow>
          <NativeSelect
            variant="inline"
            aria-label="Filter by tier"
            placeholder="Any tier"
            options={TIER_OPTIONS}
            value={tier}
            onChange={(e) => setTier(e.target.value as LoyaltyTier | '')}
          />
          <SellerPicker
            variant="inline"
            aria-label="Filter by seller"
            placeholder="Any seller"
            clearable
            activeOnly={false}
            value={sellerId}
            onChange={setSellerId}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.c.id}
          onRowClick={(r) => navigate(paths.customer(r.c.id))}
          resetPageKey={`${query}|${stage}|${tier}|${sellerId}|${view}`}
          initialSort={{ id: 'spend', desc: true }}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No customers match"
                description="Clear the search and filters to see every customer."
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No customers yet"
                description="Customers appear here when they register, check out or are added by the team."
              />
            )
          }
          {...table}
        />
      </div>
      <CustomerDialog
        open={creating}
        onOpenChange={(open) => !open && setParam('new', null)}
        editing={null}
      />
    </>
  )
}
