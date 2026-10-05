import { fmtNumber, fmtPercent, segmentMembers } from '@rc/fixtures'
import type { Segment } from '@rc/types'
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
  ProgressBar,
  StatCard,
} from '@rc/ui'
import { Filter, Plus, Search, ShoppingCart, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { ruleSummary } from './lib'

type Kind = 'builtIn' | 'custom'
type Row = { seg: Segment; members: number; share: number; campaigns: number; summary: string }

export function SegmentsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useHistoryState('query', '')
  const [kind, setKind] = useHistoryState<Kind | null>('kind', null)
  const table = useTableHistory()

  const { all, stats } = useMemo(() => {
    const total = s.customers.length
    const inCustom = new Set<string>()
    const all: Row[] = s.segments.map((seg) => {
      const members = segmentMembers(seg, s.customers, s.crm)
      if (!seg.builtIn) for (const c of members) inCustom.add(c.id)
      return {
        seg,
        members: members.length,
        share: total ? members.length / total : 0,
        campaigns: s.campaigns.filter((c) => c.segmentId === seg.id).length,
        summary: ruleSummary(seg, s.categoryName),
      }
    })
    const cart = all.find(
      (r) =>
        r.seg.builtIn && r.seg.rules.some((rule) => rule.field === 'abandoned_cart' && rule.value === 'yes'),
    )
    return {
      all,
      stats: {
        total,
        builtIn: all.filter((r) => r.seg.builtIn).length,
        inCustom: inCustom.size,
        cart,
        cartCount: cart ? cart.members : s.crm.abandoned.size,
      },
    }
  }, [s.segments, s.customers, s.crm, s.campaigns, s.categoryName])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((r) => {
      if (kind === 'builtIn' && !r.seg.builtIn) return false
      if (kind === 'custom' && r.seg.builtIn) return false
      return !q || `${r.seg.name} ${r.seg.description} ${r.summary}`.toLowerCase().includes(q)
    })
  }, [all, query, kind])

  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: 'Segment',
      sortValue: (r) => r.seg.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{r.seg.name}</p>
          <p className="truncate text-[11px] text-muted">{r.seg.description || r.summary}</p>
          <p className="mt-1 text-xs lg:hidden text-body/80">{r.summary}</p>
        </div>
      ),
    },
    {
      id: 'kind',
      header: 'Type',
      hideBelow: 'sm',
      sortValue: (r) => (r.seg.builtIn ? 0 : 1),
      cell: (r) => (
        <Badge variant={r.seg.builtIn ? 'muted' : 'outline'}>{r.seg.builtIn ? 'Built-in' : 'Custom'}</Badge>
      ),
    },
    {
      id: 'rules',
      header: 'Rules',
      hideBelow: 'lg',
      cell: (r) => <span className="text-sm text-body/80">{r.summary}</span>,
    },
    {
      id: 'members',
      header: 'Members',
      align: 'right',
      sortValue: (r) => r.members,
      cell: (r) => <span className="font-semibold tabular-nums">{fmtNumber(r.members)}</span>,
    },
    {
      id: 'share',
      header: 'Share',
      hideBelow: 'md',
      sortValue: (r) => r.share,
      width: '140px',
      cell: (r) => (
        <div className="gap-2 flex items-center">
          <ProgressBar value={r.share} aria-label={`${r.seg.name} share of customers`} className="w-16" />
          <span className="text-xs text-muted tabular-nums">{fmtPercent(r.share)}</span>
        </div>
      ),
    },
    {
      id: 'campaigns',
      header: 'Campaigns',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.campaigns,
      cell: (r) =>
        r.campaigns ? (
          <span className="tabular-nums">{fmtNumber(r.campaigns)}</span>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Segments"
        description="Groups of customers defined by rules on orders, spend, recency, tier and interests. Campaigns, promotions and automations target them."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search segments"
              leftIcon={<Search />}
              placeholder="Search segments or rules"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {can('segment.manage') && (
              <Button onClick={() => navigate(paths.newSegment)}>
                <Plus />
                New segment
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-3 grid grid-cols-2">
          <StatCard
            label="Segments"
            value={fmtNumber(all.length)}
            hint={`${fmtNumber(stats.builtIn)} built-in · ${fmtNumber(all.length - stats.builtIn)} custom`}
            icon={<Filter />}
            tone="ink"
            onClick={() => setKind(null)}
          />
          <StatCard
            label="In a custom segment"
            value={fmtNumber(stats.inCustom)}
            unit={`of ${fmtNumber(stats.total)}`}
            hint="Customers matched by at least one custom segment"
            icon={<Users />}
            tone="info"
            onClick={() => setKind('custom')}
          />
          <StatCard
            label="Cart abandoners now"
            value={fmtNumber(stats.cartCount)}
            hint="Abandoned checkout in the last 7 days, no purchase since"
            icon={<ShoppingCart />}
            tone={stats.cartCount ? 'warning' : 'default'}
            className="xl:col-span-1 col-span-2"
            onClick={stats.cart ? () => navigate(paths.segment(stats.cart!.seg.id)) : undefined}
          />
        </div>
        <ChipRow className="max-w-full">
          <Chip variant="filter" active={!kind} count={all.length} onClick={() => setKind(null)}>
            All
          </Chip>
          <Chip
            variant="filter"
            active={kind === 'builtIn'}
            count={stats.builtIn}
            onClick={() => setKind(kind === 'builtIn' ? null : 'builtIn')}
          >
            Built-in
          </Chip>
          <Chip
            variant="filter"
            active={kind === 'custom'}
            count={all.length - stats.builtIn}
            onClick={() => setKind(kind === 'custom' ? null : 'custom')}
          >
            Custom
          </Chip>
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.seg.id}
          onRowClick={(r) => navigate(paths.segment(r.seg.id))}
          resetPageKey={`${query}|${kind}`}
          initialSort={{ id: 'members', desc: true }}
          empty={
            query.trim() || kind ? (
              <EmptyState
                compact
                title="No segments match"
                description="Clear the search and filters to see every segment."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setKind(null)
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No segments yet"
                description="Build one from rules on orders, spend, recency and interests. Built-in segments arrive with the brand."
              />
            )
          }
          {...table}
        />
      </div>
    </>
  )
}
