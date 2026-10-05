import { plural } from '@rc/fixtures'
import type { Template, TemplateScope } from '@rc/types'
import { TEMPLATE_SCOPE_LABEL } from '@rc/types'
import { Badge, Button, Card, Chip, ChipRow, EmptyState, Input, PageHeader, StatCard } from '@rc/ui'
import { LayoutTemplate, Megaphone, Search, Store, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHistoryState } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { SCOPE_VARIANT, TemplateDialog } from './TemplateDialog'
import { TemplateThumb } from './TemplateThumb'

const SCOPES = Object.keys(TEMPLATE_SCOPE_LABEL) as TemplateScope[]

export function TemplatesPage() {
  const s = useScoped()
  const [query, setQuery] = useHistoryState('query', '')
  const [scope, setScope] = useHistoryState<TemplateScope | null>('scope', null)
  const [open, setOpen] = useState<Template | null>(null)

  const count = (sc: TemplateScope) => s.templates.filter((t) => t.scope === sc).length
  const toggle = (sc: TemplateScope) => setScope(scope === sc ? null : sc)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.templates.filter(
      (t) =>
        (!scope || t.scope === scope) &&
        (!q || `${t.name} ${t.bestFor} ${t.description}`.toLowerCase().includes(q)),
    )
  }, [s.templates, query, scope])

  const usage = useMemo(() => {
    const map = new Map<string, { pages: number; sellers: number; allowed: number }>()
    for (const t of s.templates) {
      map.set(t.id, {
        pages: s.pages.filter((p) => p.templateId === t.id && !p.sellerId).length,
        sellers: s.sellers.filter((x) => x.templateId === t.id).length,
        allowed: s.sellers.filter((x) => x.allowedTemplateIds.includes(t.id)).length,
      })
    }
    return map
  }, [s.templates, s.pages, s.sellers])

  return (
    <>
      <PageHeader
        title="Templates"
        description="Layouts your pages and sellers' stores are built from. Each one reads the brand guideline, so every page stays on brand."
        actions={
          <Input
            variant="pill"
            type="search"
            aria-label="Search templates"
            leftIcon={<Search />}
            placeholder="Search name or best for"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 sm:w-72 sm:flex-none flex-1"
          />
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Templates"
            value={s.templates.length}
            hint="Library and your own"
            icon={<LayoutTemplate />}
            tone="ink"
            onClick={() => setScope(null)}
          />
          <StatCard
            label="Store"
            value={count('store')}
            hint="Homepage, about, FAQ, collections"
            icon={<Store />}
            onClick={() => toggle('store')}
          />
          <StatCard
            label="Campaign"
            value={count('campaign')}
            hint="Launches and promotions"
            icon={<Megaphone />}
            tone="info"
            onClick={() => toggle('campaign')}
          />
          <StatCard
            label="Personal seller"
            value={count('personal')}
            hint="Stores for sales and resellers"
            icon={<UserRound />}
            onClick={() => toggle('personal')}
          />
        </div>
        <ChipRow className="max-w-full" role="group" aria-label="Filter by scope">
          <Chip variant="filter" active={!scope} count={s.templates.length} onClick={() => setScope(null)}>
            All
          </Chip>
          {SCOPES.map((sc) => (
            <Chip
              key={sc}
              variant="filter"
              active={scope === sc}
              count={count(sc)}
              onClick={() => toggle(sc)}
            >
              {TEMPLATE_SCOPE_LABEL[sc]}
            </Chip>
          ))}
        </ChipRow>
        {rows.length ? (
          <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
            {rows.map((t) => {
              const use = usage.get(t.id) ?? { pages: 0, sellers: 0, allowed: 0 }
              const required = t.sections.filter((x) => x.rule === 'required').length
              const locked = t.sections.filter((x) => x.rule === 'locked').length
              return (
                <Card key={t.id} className="p-5 relative flex flex-col transition-colors hover:bg-surface-2">
                  <TemplateThumb template={t} />
                  <div className="mt-4 gap-2 flex items-start justify-between">
                    <button
                      type="button"
                      onClick={() => setOpen(t)}
                      className="min-w-0 text-base font-semibold after:inset-0 text-left after:absolute after:rounded-card hover:text-accent focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
                    >
                      {t.name}
                    </button>
                    <Badge variant={SCOPE_VARIANT[t.scope]}>{TEMPLATE_SCOPE_LABEL[t.scope]}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Best for <span className="font-semibold text-body">{t.bestFor}</span>
                  </p>
                  <p className="mt-2 text-sm text-body">{t.description}</p>
                  <p className="mt-3 text-xs text-muted">
                    {plural(t.sections.length, 'section')} · {required} required · {locked} locked
                  </p>
                  <p className="pt-3 text-xs font-semibold mt-auto">
                    {t.scope === 'personal'
                      ? `${plural(use.sellers, 'seller')} using · ${use.allowed} allowed`
                      : use.pages
                        ? `Used by ${plural(use.pages, 'page')}`
                        : 'Not used yet'}
                  </p>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <EmptyState
              compact
              title="No templates match"
              description="Clear the search and filters to see the whole library."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setScope(null)
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </Card>
        )}
      </div>
      <TemplateDialog template={open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  )
}
