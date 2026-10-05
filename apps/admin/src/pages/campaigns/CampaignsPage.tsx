import {
  DAY,
  fmtDate,
  fmtDateShort,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  isSold,
  plural,
  segmentMembers,
  toMs,
} from '@rc/fixtures'
import { CAMPAIGN_STATUS_LABEL, MESSAGE_CHANNEL_LABEL, type Campaign, type CampaignStatus } from '@rc/types'
import {
  Badge,
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  cn,
  toast,
} from '@rc/ui'
import { CalendarClock, MousePointerClick, Plus, Rocket, Search, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { CampaignStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { CampaignDialog } from './CampaignDialog'
import { clickToPurchase, fmtRoi, roi } from './lib'

const STATUSES = Object.keys(CAMPAIGN_STATUS_LABEL) as CampaignStatus[]
const MAX_CHANNELS = 2

export function CampaignsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [status, setStatus] = useHistoryState<CampaignStatus | null>('status', null)
  const table = useTableHistory()
  const creating = params.get('new') === '1' && can('campaign.manage')
  const setCreating = (open: boolean) =>
    setParams(
      (p) => {
        if (open) p.set('new', '1')
        else p.delete('new')
        return p
      },
      { replace: true },
    )

  const audience = useMemo(
    () => new Map(s.segments.map((seg) => [seg.id, segmentMembers(seg, s.customers, s.crm).length])),
    [s.segments, s.customers, s.crm],
  )

  const stats = useMemo(() => {
    const from = now - 30 * DAY
    const revenue30 = s.orders.reduce(
      (sum, o) =>
        o.campaignId && isSold(o) && toMs(o.createdAt) >= from ? sum + o.total - o.refundedAmount : sum,
      0,
    )
    const launched = s.campaigns.filter((c) => c.status !== 'draft')
    const clicked = launched.reduce((n, c) => n + c.funnel.clicked, 0)
    const purchased = launched.reduce((n, c) => n + c.funnel.purchased, 0)
    const count = (st: CampaignStatus) => s.campaigns.filter((c) => c.status === st).length
    return {
      running: count('running'),
      scheduled: count('scheduled'),
      revenue30,
      conversion: clicked ? purchased / clicked : 0,
      purchased,
      nextStart: s.campaigns
        .filter((c) => c.status === 'scheduled')
        .sort((a, b) => toMs(a.startAt) - toMs(b.startAt))[0],
    }
  }, [s.orders, s.campaigns, now])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.campaigns.filter((c) => {
      if (status && c.status !== status) return false
      if (!q) return true
      return `${c.code} ${c.name} ${c.goal} ${s.segmentName(c.segmentId)}`.toLowerCase().includes(q)
    })
  }, [s, query, status])

  const columns: Column<Campaign>[] = [
    {
      id: 'name',
      header: 'Campaign',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{c.name}</p>
          <p className="font-mono text-[11px] text-muted">{c.code}</p>
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
            <CampaignStatusBadge status={c.status} />
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (c) => STATUSES.indexOf(c.status),
      cell: (c) => <CampaignStatusBadge status={c.status} />,
    },
    {
      id: 'channels',
      header: 'Channels',
      hideBelow: 'xl',
      cell: (c) =>
        c.channels.length ? (
          <div className="gap-1 flex flex-wrap">
            {c.channels.slice(0, MAX_CHANNELS).map((ch) => (
              <Badge key={ch} variant="outline">
                {MESSAGE_CHANNEL_LABEL[ch]}
              </Badge>
            ))}
            {c.channels.length > MAX_CHANNELS && (
              <Badge variant="muted">+{c.channels.length - MAX_CHANNELS}</Badge>
            )}
          </div>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    {
      id: 'audience',
      header: 'Audience',
      hideBelow: 'lg',
      sortValue: (c) => (c.segmentId ? (audience.get(c.segmentId) ?? 0) : -1),
      cell: (c) =>
        c.segmentId ? (
          <div className="min-w-0">
            <p className="truncate">{s.segmentName(c.segmentId)}</p>
            <p className="text-[11px] text-muted">{plural(audience.get(c.segmentId) ?? 0, 'customer')}</p>
          </div>
        ) : (
          <span className="text-muted">No audience</span>
        ),
    },
    {
      id: 'window',
      header: 'Window',
      hideBelow: 'md',
      sortValue: (c) => toMs(c.startAt),
      cell: (c) => (
        <span className="whitespace-nowrap">
          {fmtDateShort(c.startAt)} → {fmtDate(c.endAt)}
        </span>
      ),
    },
    {
      id: 'sent',
      header: 'Sent',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (c) => c.funnel.sent,
      cell: (c) => <span className="tabular-nums">{fmtNumber(c.funnel.sent)}</span>,
    },
    {
      id: 'purchased',
      header: 'Purchased',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (c) => c.funnel.purchased,
      cell: (c) => (
        <div className="whitespace-nowrap tabular-nums">
          <p>{fmtNumber(c.funnel.purchased)}</p>
          <p className="text-[11px] text-muted">{fmtPercent(clickToPurchase(c.funnel))} of clicks</p>
        </div>
      ),
    },
    {
      id: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortValue: (c) => c.revenue,
      cell: (c) => (
        <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdrShort(c.revenue)}</span>
      ),
    },
    {
      id: 'roi',
      header: 'ROI',
      align: 'right',
      hideBelow: 'md',
      sortValue: (c) => roi(c),
      cell: (c) => {
        const value = roi(c)
        const weak = value !== null && value < 1 && c.status !== 'draft'
        return (
          <span
            className={cn(
              'font-semibold whitespace-nowrap tabular-nums',
              weak && 'text-warning',
              value === null && 'font-normal text-muted',
            )}
          >
            {fmtRoi(value)}
          </span>
        )
      },
    },
  ]

  const filtered = !!status || !!query.trim()
  const clear = () => {
    setQuery('')
    setStatus(null)
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Plan, launch and measure campaigns from message sent to purchase, with the revenue each one brought in."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search campaigns"
              leftIcon={<Search />}
              placeholder="Search name, code or segment"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {can('campaign.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New campaign
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Running"
            value={stats.running}
            hint="Sending now"
            icon={<Rocket />}
            tone="info"
            onClick={() => setStatus('running')}
          />
          <StatCard
            label="Revenue attributed in 30 days"
            value={fmtIdrShort(stats.revenue30)}
            hint="Sold orders linked to a campaign"
            icon={<Wallet />}
            tone="ink"
            onClick={clear}
          />
          <StatCard
            label="Average click-to-purchase"
            value={fmtPercent(stats.conversion)}
            hint={`${plural(stats.purchased, 'purchase')} across launched campaigns`}
            icon={<MousePointerClick />}
            tone={stats.conversion >= 0.1 ? 'success' : 'warning'}
            onClick={clear}
          />
          <StatCard
            label="Scheduled"
            value={stats.scheduled}
            hint={stats.nextStart ? `Next starts ${fmtDateShort(stats.nextStart.startAt)}` : 'Nothing queued'}
            icon={<CalendarClock />}
            tone="default"
            onClick={() => setStatus('scheduled')}
          />
        </div>
        <ChipRow className="max-w-full">
          <Chip variant="filter" active={!status} count={s.campaigns.length} onClick={() => setStatus(null)}>
            All
          </Chip>
          {STATUSES.map((st) => {
            const count = s.campaigns.filter((c) => c.status === st).length
            if (!count && status !== st) return null
            return (
              <Chip
                key={st}
                variant="filter"
                active={status === st}
                count={count}
                onClick={() => setStatus(status === st ? null : st)}
              >
                {CAMPAIGN_STATUS_LABEL[st]}
              </Chip>
            )
          })}
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(c) => c.id}
          onRowClick={(c) => navigate(paths.campaign(c.id))}
          resetPageKey={`${query}|${status}`}
          initialSort={{ id: 'window', desc: true }}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No campaigns match"
                description="Clear the search and filters to see every campaign."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No campaigns yet"
                description="Create a campaign to message a segment and track what it sells."
              />
            )
          }
          {...table}
        />
      </div>

      <CampaignDialog
        open={creating}
        onOpenChange={setCreating}
        editing={null}
        onSaved={(campaign) => {
          toast('Campaign created', {
            tone: 'success',
            description: `${campaign.code} · ${campaign.name} saved as a draft.`,
          })
          navigate(paths.campaign(campaign.id), { replace: true })
        }}
      />
    </>
  )
}
