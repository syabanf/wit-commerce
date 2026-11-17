import { plural } from '@rc/fixtures'
import type { Page } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  FilterChips,
  IconTile,
  NoMatch,
  PageHeader,
  TableFilters,
  countBy,
  matchesQuery,
  toast,
} from '@rc/ui'
import { Copy, FileCode } from 'lucide-react'
import { PageStatusBadge } from '../../components/badges'
import { CustomDomainCard } from './CustomDomainCard'
import { DisplayCurrenciesCard } from './DisplayCurrenciesCard'
import { ShopSettingsCard } from './ShopSettingsCard'
import { useHistoryState } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { DESCRIPTION_MAX, TITLE_MAX, primaryHost, seoFlags } from './lib'

const copy = (text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined)
  toast('Link copied', { tone: 'success', description: text })
}

type Health = 'attention' | 'passing'
const healthOf = (p: Page): Health => (seoFlags(p).length ? 'attention' : 'passing')
const HEALTH: { value: Health; label: string }[] = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'passing', label: 'Passing' },
]

export function DomainsPage() {
  const s = useScoped()
  const host = primaryHost(s.tenant)
  const live = s.pages.filter((p) => p.status === 'published' || p.status === 'scheduled')
  const flagged = live.filter((p) => seoFlags(p).length).length
  const [query, setQuery] = useHistoryState('seo.q', '')
  const [health, setHealth] = useHistoryState<Health | null>('seo.health', null)
  const searched = live.filter((p) => matchesQuery(query, p.title, p.slug, p.seo.title))
  const rows = health ? searched.filter((p) => healthOf(p) === health) : searched
  const activeCount = (query.trim() ? 1 : 0) + (health ? 1 : 0)
  const clear = () => {
    setQuery('')
    setHealth(null)
  }

  const length = (value: string, max: number) => {
    const n = value.trim().length
    return (
      <span className={n > max ? 'font-semibold text-warning tabular-nums' : 'tabular-nums'}>
        {n ? `${n} / ${max}` : 'None'}
      </span>
    )
  }

  const columns: Column<Page>[] = [
    {
      id: 'page',
      header: 'Page',
      sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{p.title}</p>
          <p className="truncate font-mono text-[0.6875rem] text-muted">{p.slug}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'lg',
      sortValue: (p) => p.status,
      cell: (p) => <PageStatusBadge status={p.status} />,
    },
    {
      id: 'title',
      header: 'Meta title',
      hideBelow: 'md',
      align: 'right',
      sortValue: (p) => p.seo.title.trim().length,
      cell: (p) => length(p.seo.title, TITLE_MAX),
    },
    {
      id: 'description',
      header: 'Description',
      hideBelow: 'md',
      align: 'right',
      sortValue: (p) => p.seo.description.trim().length,
      cell: (p) => length(p.seo.description, DESCRIPTION_MAX),
    },
    {
      id: 'flags',
      header: 'Checks',
      sortValue: (p) => seoFlags(p).length,
      cell: (p) => {
        const flags = seoFlags(p)
        return (
          <div className="gap-1.5 flex flex-wrap">
            {flags.length ? (
              flags.map((f) => (
                <Badge key={f.label} variant={f.tone}>
                  {f.label}
                </Badge>
              ))
            ) : (
              <Badge variant="success">Good</Badge>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Domains & SEO"
        description="Where shoppers reach your store, the currencies they can browse in, and how its pages show up in search."
      />
      <div className="space-y-4">
        <CustomDomainCard />

        <DisplayCurrenciesCard />

        <ShopSettingsCard />

        <Card>
          <CardHeader>
            <CardTitle>SEO health</CardTitle>
            <CardDescription>
              {plural(live.length, 'live or scheduled page')} ·{' '}
              {flagged ? `${flagged} need attention` : 'all pass the checks'}. Titles fit in {TITLE_MAX}{' '}
              characters and descriptions in {DESCRIPTION_MAX}.
            </CardDescription>
          </CardHeader>
          <TableFilters
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Page, address or meta title"
            searchLabel="Search live pages"
            shown={rows.length}
            total={live.length}
            activeCount={activeCount}
            onClear={clear}
            chips={
              <FilterChips
                options={HEALTH}
                value={health}
                onChange={setHealth}
                counts={countBy(searched, healthOf)}
                total={searched.length}
              />
            }
          />
          <CardContent>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(p) => p.id}
              initialSort={{ id: 'flags', desc: true }}
              pageSize={8}
              resetPageKey={`${query}|${health}`}
              empty={
                activeCount ? (
                  <NoMatch title="No live pages match" onClear={clear} />
                ) : (
                  <EmptyState
                    compact
                    title="No live pages yet"
                    description="Published and scheduled pages are checked here."
                  />
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crawler files</CardTitle>
            <CardDescription>
              Generated from your published pages. Search engines read them from the primary domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                file: 'sitemap.xml',
                hint: `Lists ${plural(s.pages.filter((p) => p.status === 'published').length, 'published page')}`,
              },
              { file: 'robots.txt', hint: 'Allows every page, blocks cart and checkout' },
            ].map((row) => {
              const url = `https://${host}/${row.file}`
              return (
                <div
                  key={row.file}
                  className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2"
                >
                  <IconTile size="sm" className="bg-card">
                    <FileCode />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate font-mono">{url}</p>
                    <p className="text-xs text-muted">{row.hint}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Copy ${row.file} link`}
                    onClick={() => copy(url)}
                  >
                    <Copy />
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
