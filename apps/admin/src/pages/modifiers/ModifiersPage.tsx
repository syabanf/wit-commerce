import { plural } from '@rc/fixtures'
import type { ModifierGroup } from '@rc/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, StatCard, toast } from '@rc/ui'
import { CircleDollarSign, ListPlus, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { useHistoryState } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { ModifierDialog } from './ModifierDialog'
import { priceDelta, selectionRule } from './lib'

export function ModifiersPage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('product.manage')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [editing, setEditing] = useState<ModifierGroup | null>(null)
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1')
  const [removing, setRemoving] = useState<ModifierGroup | null>(null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.modifiers.filter(
      (g) => !q || `${g.name} ${g.options.map((o) => o.name).join(' ')}`.toLowerCase().includes(q),
    )
  }, [s.modifiers, query])
  const covered = new Set(s.modifiers.flatMap((g) => g.productIds)).size
  const paid = s.modifiers.filter((g) => g.options.some((o) => o.priceDelta > 0)).length

  const openDialog = (g: ModifierGroup | null) => {
    setEditing(g)
    setDialogOpen(true)
  }
  const closeDialog = (open: boolean) => {
    setDialogOpen(open)
    if (!open && params.has('new')) setParams((p) => (p.delete('new'), p), { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Modifiers"
        description="Add-on choices shoppers pick with a product at checkout, such as gift wrap, spare laces or installation. Each choice can add to the price."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search modifiers"
              leftIcon={<Search />}
              placeholder="Search groups or options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {manage && (
              <Button onClick={() => openDialog(null)}>
                <Plus />
                New modifier group
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Modifier groups"
            value={s.modifiers.length}
            hint={`${s.modifiers.reduce((n, g) => n + g.options.length, 0)} options in total`}
            icon={<ListPlus />}
            tone="ink"
          />
          <StatCard
            label="Required at checkout"
            value={s.modifiers.filter((g) => g.required).length}
            hint="Shoppers must pick before paying"
            icon={<ListPlus />}
            tone="info"
          />
          <StatCard
            label="Paid add-ons"
            value={paid}
            hint="Groups with at least one priced option"
            icon={<CircleDollarSign />}
            tone="default"
          />
          <StatCard
            label="Products with modifiers"
            value={covered}
            unit={`of ${s.products.length}`}
            hint="Shown on the product page"
            icon={<Package />}
            tone="default"
          />
        </div>

        {groups.length === 0 ? (
          <Card>
            {query.trim() ? (
              <EmptyState
                title="No modifier groups match"
                description="Clear the search to see every group."
                action={
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No modifiers yet"
                description="Create a group, list its choices and attach it to products."
              />
            )}
          </Card>
        ) : (
          <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
            {groups.map((g) => (
              <Card key={g.id} className="p-5 flex flex-col">
                <div className="gap-2 flex items-start justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold truncate">{g.name}</h2>
                    <div className="mt-1.5 gap-1.5 flex flex-wrap">
                      <Badge variant={g.required ? 'ink' : 'default'}>{selectionRule(g)}</Badge>
                    </div>
                  </div>
                  {manage && (
                    <div className="gap-1 flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${g.name}`}
                        onClick={() => openDialog(g)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-accent"
                        aria-label={`Remove ${g.name}`}
                        onClick={() => setRemoving(g)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                <ul className="mt-4 rounded-2xl px-4 divide-y divide-border bg-surface-2">
                  {g.options.map((o) => (
                    <li key={o.id} className="gap-3 py-2.5 text-sm flex items-center justify-between">
                      <span className="min-w-0 truncate">{o.name}</span>
                      <span
                        className={
                          o.priceDelta ? 'font-semibold shrink-0 tabular-nums' : 'shrink-0 text-muted'
                        }
                      >
                        {priceDelta(o.priceDelta)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="pt-4 mt-auto">
                  <p className="text-xs font-semibold text-muted">
                    On {plural(g.productIds.length, 'product')}
                  </p>
                  <div className="mt-2 gap-1.5 flex flex-wrap">
                    {g.productIds.slice(0, 3).map((id) => (
                      <Link
                        key={id}
                        to={paths.product(id)}
                        className="h-7 px-2.5 text-xs font-medium inline-flex max-w-full items-center rounded-full bg-surface-2 transition-colors hover:bg-surface hover:text-accent"
                      >
                        <span className="truncate">{s.productName(id)}</span>
                      </Link>
                    ))}
                    {g.productIds.length > 3 && (
                      <span className="self-center text-[11px] text-muted">
                        +{g.productIds.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ModifierDialog
        open={dialogOpen}
        onOpenChange={closeDialog}
        editing={editing}
        onSaved={(g) =>
          toast(editing ? 'Modifier group saved' : 'Modifier group created', {
            tone: 'success',
            description: `${g.name} · ${plural(g.options.length, 'option')} on ${plural(g.productIds.length, 'product')}`,
          })
        }
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={`Remove ${removing?.name}?`}
        description={`${plural(removing?.productIds.length ?? 0, 'product')} stop offering these choices at checkout. Past orders keep what the shopper picked.`}
        confirmLabel="Remove group"
        onConfirm={() => {
          if (!removing) return
          s.dispatch({ type: 'modifiers/remove', id: removing.id })
          toast('Modifier group removed', { description: removing.name })
          setRemoving(null)
        }}
      />
    </>
  )
}
