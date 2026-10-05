import { fmtAgo, fmtNumber, toMs } from '@rc/fixtures'
import type { Page, PageKind } from '@rc/types'
import { PAGE_KIND_LABEL } from '@rc/types'
import {
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from '@rc/ui'
import { CalendarClock, FilePen, Globe, Plus, Search, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { PageStatusBadge } from '../../components/badges'
import { SellerChip, paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { NewPageDialog } from './NewPageDialog'

type View = 'all' | 'published' | 'draft' | 'scheduled' | 'personal'

const VIEW_TEST: Record<View, (p: Page) => boolean> = {
  all: () => true,
  published: (p) => p.status === 'published',
  draft: (p) => p.status === 'draft',
  scheduled: (p) => p.status === 'scheduled',
  personal: (p) => !!p.sellerId,
}

const KINDS = Object.keys(PAGE_KIND_LABEL) as PageKind[]

export function PagesPage() {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [view, setView] = useHistoryState<View>('view', 'all')
  const [kind, setKind] = useHistoryState<PageKind | null>('kind', null)
  const table = useTableHistory()
  const canEdit = can('store.manage')
  const creating = canEdit && params.get('new') === '1'

  const closeCreate = () =>
    setParams(
      (p) => {
        p.delete('new')
        p.delete('template')
        return p
      },
      { replace: true },
    )

  const counts = useMemo(() => {
    const count = (v: View) => s.pages.filter(VIEW_TEST[v]).length
    return {
      published: count('published'),
      draft: count('draft'),
      scheduled: count('scheduled'),
      personal: count('personal'),
    }
  }, [s.pages])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.pages.filter((p) => {
      if (!VIEW_TEST[view](p)) return false
      if (kind && p.kind !== kind) return false
      if (!q) return true
      return `${p.title} ${p.slug} ${s.sellerName(p.sellerId)}`.toLowerCase().includes(q)
    })
  }, [s, query, view, kind])

  const toggleView = (next: View) => setView(view === next ? 'all' : next)

  const columns: Column<Page>[] = [
    {
      id: 'page',
      header: 'Page',
      sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{p.title}</p>
          <p className="truncate font-mono text-[11px] text-muted">{p.slug}</p>
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
            <PageStatusBadge status={p.status} />
          </div>
        </div>
      ),
    },
    {
      id: 'kind',
      header: 'Kind',
      hideBelow: 'md',
      sortValue: (p) => PAGE_KIND_LABEL[p.kind],
      cell: (p) => (
        <div className="min-w-0 space-y-1">
          <p className="text-sm">{PAGE_KIND_LABEL[p.kind]}</p>
          {p.sellerId && <SellerChip sellerId={p.sellerId} />}
        </div>
      ),
    },
    {
      id: 'template',
      header: 'Template',
      hideBelow: 'xl',
      sortValue: (p) => s.maps.template.get(p.templateId)?.name ?? '',
      cell: (p) => (
        <span className="text-sm text-body">
          {s.maps.template.get(p.templateId)?.name ?? 'Removed template'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (p) => p.status,
      cell: (p) => (
        <div className="space-y-1">
          <PageStatusBadge status={p.status} />
          {p.status === 'scheduled' && p.scheduledAt && (
            <p className="text-[11px] text-muted">Goes live {fmtAgo(p.scheduledAt, now)}</p>
          )}
        </div>
      ),
    },
    {
      id: 'updated',
      header: 'Updated',
      hideBelow: 'lg',
      sortValue: (p) => toMs(p.updatedAt),
      cell: (p) => (
        <div className="whitespace-nowrap">
          <p className="text-sm">{fmtAgo(p.updatedAt, now)}</p>
          <p className="text-[11px] text-muted">by {s.userName(p.updatedBy)}</p>
        </div>
      ),
    },
    {
      id: 'views',
      header: 'Views 30d',
      align: 'right',
      sortValue: (p) => p.views30d,
      cell: (p) => <span className="font-semibold tabular-nums">{fmtNumber(p.views30d)}</span>,
    },
  ]

  const filtered = view !== 'all' || !!kind || !!query.trim()
  const clear = () => {
    setQuery('')
    setView('all')
    setKind(null)
  }

  return (
    <>
      <PageHeader
        title="Pages"
        description="Every storefront page, campaign landing page and seller's personal store, built from templates and your brand tokens."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search pages"
              leftIcon={<Search />}
              placeholder="Search title, slug or seller"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {canEdit && (
              <Button
                onClick={() =>
                  setParams(
                    (p) => {
                      p.set('new', '1')
                      return p
                    },
                    { replace: true },
                  )
                }
              >
                <Plus />
                New page
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Published"
            value={counts.published}
            hint="Live on the storefront"
            icon={<Globe />}
            tone="ink"
            onClick={() => toggleView('published')}
          />
          <StatCard
            label="Drafts"
            value={counts.draft}
            hint="Not visible to shoppers"
            icon={<FilePen />}
            tone={counts.draft ? 'warning' : 'default'}
            onClick={() => toggleView('draft')}
          />
          <StatCard
            label="Scheduled"
            value={counts.scheduled}
            hint="Publish on a set time"
            icon={<CalendarClock />}
            tone="info"
            onClick={() => toggleView('scheduled')}
          />
          <StatCard
            label="Personal stores"
            value={counts.personal}
            unit={`of ${s.sellers.length} sellers`}
            hint="Seller pages on tenant templates"
            icon={<UserRound />}
            onClick={() => toggleView('personal')}
          />
        </div>
        <ChipRow className="max-w-full" role="group" aria-label="Filter by kind">
          <Chip
            variant="filter"
            active={!kind}
            count={s.pages.filter(VIEW_TEST[view]).length}
            onClick={() => setKind(null)}
          >
            All
          </Chip>
          {KINDS.map((k) => {
            const count = s.pages.filter((p) => VIEW_TEST[view](p) && p.kind === k).length
            if (!count && kind !== k) return null
            return (
              <Chip
                key={k}
                variant="filter"
                active={kind === k}
                count={count}
                onClick={() => setKind(kind === k ? null : k)}
              >
                {PAGE_KIND_LABEL[k]}
              </Chip>
            )
          })}
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate(paths.page(p.id))}
          resetPageKey={`${query}|${view}|${kind}`}
          initialSort={{ id: 'updated', desc: true }}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No pages match"
                description="Clear the search and filters to see every page."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No pages yet"
                description="Create a page from a template. Personal stores appear here once sellers set up their page."
              />
            )
          }
          {...table}
        />
      </div>
      <NewPageDialog
        open={creating}
        onOpenChange={(o) => !o && closeCreate()}
        templateId={params.get('template')}
      />
    </>
  )
}
