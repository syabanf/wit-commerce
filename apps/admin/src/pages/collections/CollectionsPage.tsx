import { collectionProducts, plural } from '@rc/fixtures'
import { COLLECTION_MODE_LABEL, type Collection } from '@rc/types'
import {
  Badge,
  Button,
  Chip,
  ChipRow,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  toast,
} from '@rc/ui'
import { Library, Package, Pencil, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { CollectionDialog } from './CollectionDialog'
import { ruleSummary } from './lib'

type Filter = 'manual' | 'smart' | 'featured' | null

interface Row {
  collection: Collection
  rules: string
  products: number
}

export function CollectionsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('product.manage')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [filter, setFilter] = useHistoryState<Filter>('filter', null)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1' && manage)
  const [removing, setRemoving] = useState<Collection | null>(null)
  const table = useTableHistory()

  const all = useMemo<Row[]>(
    () =>
      s.collections.map((collection) => ({
        collection,
        rules: ruleSummary(collection, s.categoryName),
        products: collectionProducts(collection, s.products, s.categories).length,
      })),
    [s],
  )

  const stats = useMemo(() => {
    const covered = new Set(
      s.collections.flatMap((c) => collectionProducts(c, s.products, s.categories).map((p) => p.id)),
    )
    return {
      smart: s.collections.filter((c) => c.mode === 'smart').length,
      featured: s.collections.filter((c) => c.featured).length,
      covered: s.products.filter((p) => p.status === 'active' && covered.has(p.id)).length,
      active: s.products.filter((p) => p.status === 'active').length,
    }
  }, [s.collections, s.products, s.categories])

  const terms = query.trim().toLowerCase()
  const searched = all.filter(
    (r) =>
      !terms ||
      `${r.collection.name} ${r.collection.slug} ${r.collection.description} ${r.rules}`
        .toLowerCase()
        .includes(terms),
  )
  const matchFilter = (r: Row) =>
    !filter || (filter === 'featured' ? r.collection.featured : r.collection.mode === filter)
  const rows = searched.filter(matchFilter)

  const openDialog = (collection: Collection | null) => {
    setEditing(collection)
    setDialogOpen(true)
  }
  const closeDialog = (open: boolean) => {
    setDialogOpen(open)
    if (!open && params.has('new')) setParams((p) => (p.delete('new'), p), { replace: true })
  }
  const toggleFilter = (next: Filter) => setFilter(filter === next ? null : next)

  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: 'Collection',
      sortValue: (r) => r.collection.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{r.collection.name}</p>
          <p className="text-xs truncate font-mono text-muted">/{r.collection.slug}</p>
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
            <Badge variant={r.collection.mode === 'smart' ? 'info' : 'default'}>
              {COLLECTION_MODE_LABEL[r.collection.mode]}
            </Badge>
            {r.collection.featured && <Badge variant="ink">Featured</Badge>}
          </div>
          <p className="mt-1 leading-4 md:hidden text-[11px] text-muted">
            {plural(r.products, 'product')} · {r.rules}
          </p>
        </div>
      ),
    },
    {
      id: 'mode',
      header: 'Mode',
      hideBelow: 'sm',
      sortValue: (r) => r.collection.mode,
      cell: (r) => (
        <Badge variant={r.collection.mode === 'smart' ? 'info' : 'default'}>
          {COLLECTION_MODE_LABEL[r.collection.mode]}
        </Badge>
      ),
    },
    {
      id: 'rules',
      header: 'Products come from',
      hideBelow: 'lg',
      cell: (r) => <span className="text-sm text-muted">{r.rules}</span>,
    },
    {
      id: 'products',
      header: 'Products',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.products,
      cell: (r) => <span className="tabular-nums">{r.products}</span>,
    },
    {
      id: 'featured',
      header: 'Storefront',
      hideBelow: 'sm',
      sortValue: (r) => (r.collection.featured ? 0 : 1),
      cell: (r) =>
        r.collection.featured ? (
          <Badge variant="ink">Featured</Badge>
        ) : (
          <span className="text-sm text-muted">Not featured</span>
        ),
    },
    ...(manage
      ? [
          {
            id: '_actions',
            header: '',
            width: '5.5rem',
            cell: (r: Row) => (
              <div className="gap-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${r.collection.name}`}
                  onClick={() => openDialog(r.collection)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-accent"
                  aria-label={`Remove ${r.collection.name}`}
                  onClick={() => setRemoving(r.collection)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          } satisfies Column<Row>,
        ]
      : []),
  ]

  const filtered = !!filter || !!terms
  const clear = () => {
    setQuery('')
    setFilter(null)
  }

  return (
    <>
      <PageHeader
        title="Collections"
        description="Groups of products shoppers browse together, picked by hand or filled from category and tag rules."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search collections"
              leftIcon={<Search />}
              placeholder="Search collections"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {manage && (
              <Button onClick={() => openDialog(null)}>
                <Plus />
                New collection
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Collections"
            value={s.collections.length}
            hint={plural(s.collections.length - stats.smart, 'manual collection')}
            icon={<Library />}
            tone="ink"
            onClick={clear}
          />
          <StatCard
            label="Smart"
            value={stats.smart}
            hint="Fill themselves from rules"
            icon={<Sparkles />}
            tone="info"
            onClick={() => toggleFilter('smart')}
          />
          <StatCard
            label="Featured on the storefront"
            value={stats.featured}
            hint={stats.featured ? 'Tiles on the homepage' : 'None on the homepage'}
            icon={<Star />}
            tone={stats.featured ? 'success' : 'warning'}
            onClick={() => toggleFilter('featured')}
          />
          <StatCard
            label="Products in at least one collection"
            value={stats.covered}
            unit={`of ${stats.active}`}
            hint="Active products"
            icon={<Package />}
            tone="default"
          />
        </div>
        <ChipRow className="max-w-full" role="group" aria-label="Filter collections">
          <Chip variant="filter" active={!filter} count={searched.length} onClick={() => setFilter(null)}>
            All
          </Chip>
          {(['manual', 'smart'] as const).map((m) => (
            <Chip
              key={m}
              variant="filter"
              active={filter === m}
              count={searched.filter((r) => r.collection.mode === m).length}
              onClick={() => toggleFilter(m)}
            >
              {COLLECTION_MODE_LABEL[m]}
            </Chip>
          ))}
          <Chip
            variant="filter"
            active={filter === 'featured'}
            count={searched.filter((r) => r.collection.featured).length}
            onClick={() => toggleFilter('featured')}
          >
            Featured
          </Chip>
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.collection.id}
          onRowClick={manage ? (r) => openDialog(r.collection) : undefined}
          initialSort={{ id: 'name' }}
          pageSize={0}
          resetPageKey={`${query}|${filter}`}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No collections match"
                description="Clear the search and filters to see every collection."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No collections yet"
                description="Group products for a season, an occasion or a storefront tile."
              />
            )
          }
          {...table}
        />
      </div>

      <CollectionDialog
        open={dialogOpen}
        onOpenChange={closeDialog}
        editing={editing}
        onSaved={(c) =>
          toast(editing ? 'Collection saved' : 'Collection created', {
            tone: 'success',
            description: `${c.name} · ${plural(collectionProducts(c, s.products, s.categories).length, 'product')}`,
          })
        }
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={`Remove ${removing?.name}?`}
        description="It leaves the storefront and its link stops working. The products stay in the catalog."
        confirmLabel="Remove collection"
        onConfirm={() => {
          if (!removing) return
          s.dispatch({ type: 'collections/remove', id: removing.id })
          toast('Collection removed', { description: removing.name })
          setRemoving(null)
        }}
      />
    </>
  )
}
