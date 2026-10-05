import { DAY, fmtAgo, fmtIdrShort, fmtNumber, fmtPercent, toMs } from '@rc/fixtures'
import type { Lead } from '@rc/types'
import { LEAD_STAGE_LABEL } from '@rc/types'
import { Avatar, Button, Card, Chip, EmptyState, Input, PageHeader, StatCard, cn } from '@rc/ui'
import { Clock, Plus, Search, Sparkles, Target, Trophy, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { SellerPicker } from '../../components/pickers'
import { useHistoryState } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { LeadDialog } from './LeadDialog'
import { BOARD_STAGES, STALE_DAYS, isOpen, sellerIdsOf, staleDays } from './lib'

export function LeadsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1' && can('lead.manage')
  const mySellerIds = useMemo(() => sellerIdsOf(s.sellers, s.user.id), [s.sellers, s.user.id])
  const [mine, setMine] = useHistoryState('mine', false)
  const [sellerId, setSellerId] = useHistoryState<string | null>('seller', null)
  const [query, setQuery] = useHistoryState('query', '')

  const setNew = (open: boolean) =>
    setParams(
      (p) => {
        if (open) p.set('new', '1')
        else p.delete('new')
        return p
      },
      { replace: true },
    )

  const stats = useMemo(() => {
    const open = s.leads.filter(isOpen)
    const since = now - 30 * DAY
    const won30 = s.leads.filter((l) => l.stage === 'won' && toMs(l.updatedAt) >= since)
    const won = s.leads.filter((l) => l.stage === 'won').length
    const lost = s.leads.filter((l) => l.stage === 'lost').length
    return {
      openValue: open.reduce((n, l) => n + l.value, 0),
      openCount: open.length,
      newCount: s.leads.filter((l) => l.stage === 'new').length,
      won30Value: won30.reduce((n, l) => n + l.value, 0),
      won30Count: won30.length,
      winRate: won + lost ? won / (won + lost) : null,
      closed: won + lost,
    }
  }, [s.leads, now])

  const columns = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = s.leads.filter((l) => {
      if (mine && (!l.sellerId || !mySellerIds.includes(l.sellerId))) return false
      if (sellerId && l.sellerId !== sellerId) return false
      return !q || `${l.code} ${l.name} ${l.company} ${l.phone}`.toLowerCase().includes(q)
    })
    return BOARD_STAGES.map((stage) => {
      const leads = visible
        .filter((l) => l.stage === stage)
        .sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt))
      return { stage, leads, value: leads.reduce((n, l) => n + l.value, 0) }
    })
  }, [s.leads, mine, mySellerIds, sellerId, query])

  const filtered = mine || !!sellerId || !!query.trim()
  const shown = columns.reduce((n, c) => n + c.leads.length, 0)

  return (
    <>
      <PageHeader
        title="Leads"
        description="Deals from Talk to sales, personal stores, WhatsApp, events and referrals, from first contact to won or lost."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search leads"
              leftIcon={<Search />}
              placeholder="Search code, name or company"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {can('lead.manage') && (
              <Button onClick={() => setNew(true)}>
                <Plus />
                New lead
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Open pipeline"
            value={fmtIdrShort(stats.openValue)}
            hint={`${fmtNumber(stats.openCount)} open leads`}
            icon={<Wallet />}
            tone="ink"
          />
          <StatCard
            label="New leads"
            value={fmtNumber(stats.newCount)}
            hint="Waiting for a first call"
            icon={<Sparkles />}
            tone={stats.newCount ? 'accent' : 'default'}
          />
          <StatCard
            label="Won in 30 days"
            value={fmtIdrShort(stats.won30Value)}
            hint={`${fmtNumber(stats.won30Count)} deals closed`}
            icon={<Trophy />}
            tone="success"
          />
          <StatCard
            label="Win rate"
            value={stats.winRate === null ? '-' : fmtPercent(stats.winRate)}
            hint={stats.closed ? `Of ${fmtNumber(stats.closed)} closed leads` : 'No closed leads yet'}
            icon={<Target />}
            tone="info"
          />
        </div>

        <div className="gap-2 flex flex-wrap items-center">
          {mySellerIds.length > 0 && (
            <Chip variant="filter" active={mine} onClick={() => setMine(!mine)}>
              Mine
            </Chip>
          )}
          <SellerPicker
            variant="inline"
            aria-label="Filter by seller"
            placeholder="Any seller"
            clearable
            activeOnly={false}
            value={sellerId}
            onChange={setSellerId}
          />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMine(false)
                setSellerId(null)
                setQuery('')
              }}
            >
              Clear filters
            </Button>
          )}
          <p className="text-xs ml-auto text-muted">
            {fmtNumber(shown)} of {fmtNumber(s.leads.length)} leads · stale after {STALE_DAYS} days without an
            update
          </p>
        </div>

        {s.leads.length === 0 ? (
          <Card>
            <EmptyState
              title="No leads yet"
              description="Leads arrive from the Talk to sales form, personal stores and WhatsApp, or the team adds them here."
            />
          </Card>
        ) : (
          <div
            className="gap-4 pb-2 no-scrollbar flex overflow-x-auto"
            role="list"
            aria-label="Lead pipeline"
          >
            {columns.map((col) => (
              <Card
                key={col.stage}
                role="listitem"
                className={cn(
                  'w-72 min-w-72 p-3 flex shrink-0 flex-col',
                  col.stage === 'lost' && 'opacity-80',
                )}
              >
                <div className="mb-3 gap-2 px-1 flex items-start justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{LEAD_STAGE_LABEL[col.stage]}</h2>
                    <p className="text-xs text-muted tabular-nums">{fmtIdrShort(col.value)}</p>
                  </div>
                  <span className="px-2 py-0.5 font-bold shrink-0 rounded-full bg-surface text-[0.6875rem] tabular-nums">
                    {col.leads.length}
                  </span>
                </div>
                <div className="gap-2 flex flex-col">
                  {col.leads.length ? (
                    col.leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        now={now}
                        onOpen={() => navigate(paths.lead(lead.id))}
                      />
                    ))
                  ) : (
                    <p className="rounded-2xl px-3 py-6 text-xs bg-surface-2 text-center text-muted">
                      {filtered ? 'No leads match' : 'No leads here'}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <LeadDialog open={creating} onOpenChange={(open) => !open && setNew(false)} editing={null} />
    </>
  )
}

function LeadCard({ lead, now, onOpen }: { lead: Lead; now: number; onOpen: () => void }) {
  const s = useScoped()
  const seller = lead.sellerId ? s.maps.seller.get(lead.sellerId) : undefined
  const stale = staleDays(lead, now)
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${lead.code} ${lead.company || lead.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
      className="rounded-2xl p-3 cursor-pointer bg-surface-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
    >
      <div className="gap-2 flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{lead.company || lead.name}</p>
          <p className="truncate text-[0.6875rem] text-muted">
            <span className="font-mono">{lead.code}</span>
            {lead.company && <span> · {lead.name}</span>}
          </p>
        </div>
        <span className="text-sm font-bold shrink-0 tabular-nums">
          {lead.value ? fmtIdrShort(lead.value) : '-'}
        </span>
      </div>
      {lead.productId && (
        <p className="mt-1.5 text-xs truncate text-body/80">{s.productName(lead.productId)}</p>
      )}
      <div className="mt-2.5 gap-2 flex items-center justify-between text-[0.6875rem]">
        <span className="min-w-0 gap-1.5 flex items-center text-muted">
          {seller ? <Avatar name={seller.name} color={seller.color} size="xs" /> : null}
          <span className="truncate">{seller?.name ?? 'Unassigned'}</span>
        </span>
        <span
          className={cn(
            'gap-1 flex shrink-0 items-center',
            stale ? 'font-semibold text-warning' : 'text-muted',
          )}
        >
          {stale && <Clock aria-hidden="true" className="size-3" />}
          {stale ? `Stale ${stale}d` : fmtAgo(lead.updatedAt, now)}
        </span>
      </div>
    </div>
  )
}
