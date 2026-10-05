import { attributesFor, fmtPercent, plural } from '@rc/fixtures'
import type { AttributeDef, AttributeType } from '@rc/types'
import { ATTRIBUTE_TYPE_LABEL } from '@rc/types'
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
  ProgressBar,
  StatCard,
  toast,
} from '@rc/ui'
import {
  Filter,
  ListChecks,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { type Scoped, useScoped } from '../../state/scoped'
import { AttributeDialog } from './AttributeDialog'

interface Row {
  def: AttributeDef
  /** Products the attribute applies to, and how many carry a value. */
  applies: number
  filled: number
}

const TYPES = Object.keys(ATTRIBUTE_TYPE_LABEL) as AttributeType[]

function coverage(s: Scoped, def: AttributeDef) {
  const products = s.products.filter(
    (p) => p.status !== 'archived' && attributesFor(p.categoryId, [def], s.categories).length > 0,
  )
  return { applies: products.length, filled: products.filter((p) => p.attributes[def.id]?.trim()).length }
}

export function AttributesPage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('product.manage')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [type, setType] = useHistoryState<AttributeType | null>('type', null)
  const [editing, setEditing] = useState<AttributeDef | null>(null)
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1')
  const [removing, setRemoving] = useState<Row | null>(null)
  const table = useTableHistory()

  const all = useMemo<Row[]>(() => s.attributes.map((def) => ({ def, ...coverage(s, def) })), [s])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (r) =>
        (!type || r.def.type === type) &&
        (!q || `${r.def.name} ${r.def.code} ${r.def.options.join(' ')}`.toLowerCase().includes(q)),
    )
  }, [all, query, type])
  const gaps = all.filter((r) => r.def.required && r.filled < r.applies)

  const openDialog = (def: AttributeDef | null) => {
    setEditing(def)
    setDialogOpen(true)
  }
  const closeDialog = (open: boolean) => {
    setDialogOpen(open)
    if (!open && params.has('new')) setParams((p) => (p.delete('new'), p), { replace: true })
  }
  const scope = (def: AttributeDef) =>
    def.categoryIds.length ? def.categoryIds.map((id) => s.categoryName(id)).join(', ') : 'All products'

  const columns: Column<Row>[] = [
    {
      id: 'name',
      header: 'Attribute',
      sortValue: (r) => r.def.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{r.def.name}</p>
          <p className="truncate font-mono text-[11px] text-muted">{r.def.code}</p>
          <p className="mt-1 leading-4 md:hidden text-[11px] text-muted">
            {ATTRIBUTE_TYPE_LABEL[r.def.type]} · {scope(r.def)}
          </p>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      hideBelow: 'md',
      sortValue: (r) => r.def.type,
      cell: (r) => (
        <div>
          <p className="text-sm">
            {ATTRIBUTE_TYPE_LABEL[r.def.type]}
            {r.def.unit && <span className="text-muted"> · {r.def.unit}</span>}
          </p>
          {r.def.type === 'select' && (
            <p className="mt-0.5 max-w-56 truncate text-[11px] text-muted" title={r.def.options.join(', ')}>
              {r.def.options.join(', ')}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'scope',
      header: 'Applies to',
      hideBelow: 'lg',
      sortValue: (r) => scope(r.def),
      cell: (r) => <span className="text-sm">{scope(r.def)}</span>,
    },
    {
      id: 'flags',
      header: 'Rules',
      hideBelow: 'sm',
      cell: (r) => (
        <div className="gap-1.5 flex flex-wrap">
          {r.def.required && <Badge variant="ink">Required</Badge>}
          {r.def.filterable && <Badge variant="info">Filter</Badge>}
          {!r.def.required && !r.def.filterable && <span className="text-muted">–</span>}
        </div>
      ),
    },
    {
      id: 'coverage',
      header: 'Filled in',
      width: '10rem',
      hideBelow: 'md',
      sortValue: (r) => (r.applies ? r.filled / r.applies : 1),
      cell: (r) => {
        const gap = r.def.required && r.filled < r.applies
        return (
          <div>
            <ProgressBar
              value={r.applies ? r.filled / r.applies : 1}
              tone={gap ? 'warning' : 'ink'}
              aria-label={`${r.filled} of ${r.applies} products filled`}
            />
            <p className="mt-1 text-[11px] text-muted tabular-nums">
              {r.filled} of {plural(r.applies, 'product')}
            </p>
          </div>
        )
      },
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
                  aria-label={`Edit ${r.def.name}`}
                  onClick={() => openDialog(r.def)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-accent"
                  aria-label={`Remove ${r.def.name}`}
                  onClick={() => setRemoving(r)}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          } satisfies Column<Row>,
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Attributes"
        description="Product properties you define once, such as drop, weight or skin type. Products fill them in, and filterable ones become storefront filters."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search attributes"
              leftIcon={<Search />}
              placeholder="Search name, code or option"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {manage && (
              <Button onClick={() => openDialog(null)}>
                <Plus />
                New attribute
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Attributes"
            value={all.length}
            hint={`${all.filter((r) => r.def.categoryIds.length === 0).length} apply to every product`}
            icon={<SlidersHorizontal />}
            tone="ink"
          />
          <StatCard
            label="Storefront filters"
            value={all.filter((r) => r.def.filterable).length}
            hint="Shoppers can narrow results by them"
            icon={<Filter />}
            tone="info"
          />
          <StatCard
            label="Required"
            value={all.filter((r) => r.def.required).length}
            hint="Must be filled before a product goes live"
            icon={<ListChecks />}
            tone="default"
          />
          <StatCard
            label="Required values missing"
            value={gaps.reduce((n, r) => n + r.applies - r.filled, 0)}
            hint={gaps.length ? `Across ${plural(gaps.length, 'attribute')}` : 'Every product is complete'}
            icon={<TriangleAlert />}
            tone={gaps.length ? 'warning' : 'success'}
          />
        </div>
        <ChipRow className="max-w-full">
          <Chip variant="filter" active={!type} count={all.length} onClick={() => setType(null)}>
            All
          </Chip>
          {TYPES.map((t) => (
            <Chip
              key={t}
              variant="filter"
              active={type === t}
              count={all.filter((r) => r.def.type === t).length}
              onClick={() => setType(type === t ? null : t)}
            >
              {ATTRIBUTE_TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.def.id}
          onRowClick={manage ? (r) => openDialog(r.def) : undefined}
          initialSort={{ id: 'name' }}
          pageSize={0}
          resetPageKey={`${query}|${type}`}
          empty={
            query.trim() || type ? (
              <EmptyState
                compact
                title="No attributes match"
                description="Clear the search and type filter to see every attribute."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setType(null)
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No attributes yet"
                description="Add one to describe products the same way across the catalog."
              />
            )
          }
          {...table}
        />
      </div>

      <AttributeDialog
        open={dialogOpen}
        onOpenChange={closeDialog}
        editing={editing}
        onSaved={(def) =>
          toast(editing ? 'Attribute saved' : 'Attribute created', {
            tone: 'success',
            description: `${def.name} · ${ATTRIBUTE_TYPE_LABEL[def.type]}`,
          })
        }
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={`Remove ${removing?.def.name}?`}
        description={
          removing?.filled
            ? `${plural(removing.filled, 'product')} lose their ${removing.def.name.toLowerCase()} value, and the storefront filter disappears.`
            : 'No product has a value for it yet, so nothing else changes.'
        }
        confirmLabel="Remove attribute"
        onConfirm={() => {
          if (!removing) return
          s.dispatch({ type: 'attributes/remove', id: removing.def.id })
          toast('Attribute removed', {
            description: `${removing.def.name} · ${fmtPercent(removing.applies ? removing.filled / removing.applies : 0)} of products had a value`,
          })
          setRemoving(null)
        }}
      />
    </>
  )
}
