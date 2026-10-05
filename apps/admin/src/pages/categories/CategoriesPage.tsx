import { attributesFor, categoryRemoveBlocker, plural } from '@rc/fixtures'
import type { Category } from '@rc/types'
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  toast,
} from '@rc/ui'
import { FolderOpen, FolderTree, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { CategoryDialog } from './CategoryDialog'

interface Row {
  category: Category
  /** "Shoes / Road running shoes", for sorting parents above their children. */
  path: string
  products: number
  attributes: number
}

export function CategoriesPage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('product.manage')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [editing, setEditing] = useState<Category | null>(null)
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1')
  const [removing, setRemoving] = useState<Category | null>(null)
  const table = useTableHistory()

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    return s.categories
      .map((category) => ({
        category,
        path: category.parentId ? `${s.categoryName(category.parentId)} / ${category.name}` : category.name,
        products: s.products.filter((p) => p.categoryId === category.id).length,
        attributes: attributesFor(category.id, s.attributes, s.categories).length,
      }))
      .filter((r) => !q || `${r.path} ${r.category.description}`.toLowerCase().includes(q))
  }, [s, query])

  const stats = useMemo(
    () => ({
      top: s.categories.filter((c) => !c.parentId).length,
      sub: s.categories.filter((c) => c.parentId).length,
      empty: s.categories.filter(
        (c) =>
          !s.products.some((p) => p.categoryId === c.id) && !s.categories.some((x) => x.parentId === c.id),
      ).length,
    }),
    [s.categories, s.products],
  )

  const openDialog = (category: Category | null) => {
    setEditing(category)
    setDialogOpen(true)
  }
  const closeDialog = (open: boolean) => {
    setDialogOpen(open)
    if (!open && params.has('new')) setParams((p) => (p.delete('new'), p), { replace: true })
  }

  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: 'Category',
      sortValue: (r) => r.path,
      cell: (r) => (
        <div className={r.category.parentId ? 'min-w-0 pl-6' : 'min-w-0'}>
          <p className="text-sm font-semibold truncate">{r.category.name}</p>
          <p className="text-xs truncate text-muted">
            {r.category.parentId ? `In ${s.categoryName(r.category.parentId)}` : 'Top level'}
          </p>
          <p className="mt-1 leading-4 md:hidden text-[11px] text-muted">
            {plural(r.products, 'product')} · {plural(r.attributes, 'attribute')}
          </p>
        </div>
      ),
    },
    {
      id: 'description',
      header: 'Description',
      hideBelow: 'lg',
      cell: (r) => <span className="text-sm text-muted">{r.category.description || 'None'}</span>,
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
      id: 'attributes',
      header: 'Attributes',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.attributes,
      cell: (r) => <span className="tabular-nums">{r.attributes}</span>,
    },
    ...(manage
      ? [
          {
            id: '_actions',
            header: '',
            width: '5.5rem',
            cell: (r: Row) => {
              const blocked = categoryRemoveBlocker(r.category, s.products, s.categories)
              return (
                <div className="gap-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${r.category.name}`}
                    onClick={() => openDialog(r.category)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-accent"
                    aria-label={`Remove ${r.category.name}`}
                    title={blocked ?? undefined}
                    disabled={!!blocked}
                    onClick={() => setRemoving(r.category)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )
            },
          } satisfies Column<Row>,
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Categories"
        description="The tree shoppers browse and the scope your attributes, promotions and segments use. One level of sub-categories under each category."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search categories"
              leftIcon={<Search />}
              placeholder="Search categories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {manage && (
              <Button onClick={() => openDialog(null)}>
                <Plus />
                New category
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Top-level categories"
            value={stats.top}
            hint="Shown in the storefront menu"
            icon={<FolderTree />}
            tone="ink"
          />
          <StatCard
            label="Sub-categories"
            value={stats.sub}
            hint="One level under a parent"
            icon={<FolderOpen />}
            tone="info"
          />
          <StatCard
            label="Attributes defined"
            value={s.attributes.length}
            hint="Set per category or for all"
            icon={<SlidersHorizontal />}
            tone="default"
          />
          <StatCard
            label="Empty categories"
            value={stats.empty}
            hint={stats.empty ? 'No products and no sub-categories' : 'Every category is in use'}
            icon={<FolderOpen />}
            tone={stats.empty ? 'warning' : 'success'}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.category.id}
          onRowClick={manage ? (r) => openDialog(r.category) : undefined}
          initialSort={{ id: 'name' }}
          pageSize={0}
          resetPageKey={query}
          empty={
            query.trim() ? (
              <EmptyState
                compact
                title="No categories match"
                description="Clear the search to see every category."
                action={
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No categories yet"
                description="Products need a category before they go live."
              />
            )
          }
          {...table}
        />
      </div>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={closeDialog}
        editing={editing}
        onSaved={(c) =>
          toast(editing ? 'Category saved' : 'Category created', { tone: 'success', description: c.name })
        }
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={`Remove ${removing?.name}?`}
        description="Attributes scoped to it stop applying here. No product uses it, so nothing else changes."
        confirmLabel="Remove category"
        onConfirm={() => {
          if (!removing) return
          s.dispatch({ type: 'categories/remove', id: removing.id })
          toast('Category removed', { description: removing.name })
          setRemoving(null)
        }}
      />
    </>
  )
}
