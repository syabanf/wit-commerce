import {
  attributesFor,
  collectionProducts,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fmtNumber,
  fmtPercent,
  margin,
  plural,
  productActivateBlocker,
  productPerformance,
  stockState,
  sumStock,
} from '@rc/fixtures'
import type { Product } from '@rc/types'
import { PRODUCT_STATUS_LABEL, PRODUCT_TYPE_LABEL } from '@rc/types'
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ColumnChart,
  ConfirmDialog,
  EmptyState,
  KeyValue,
  Kicker,
  PageHeader,
  cn,
  toast,
} from '@rc/ui'
import { Archive, ArrowRight, MoreHorizontal, Pencil, Star, Undo2 } from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ON_INK, StockBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/scoped'
import { AttributesCard, ModifiersCard } from './CatalogCards'
import { ProductDialog } from './ProductDialog'
import { dailyUnits, optionAxes } from './lib'
import { HeroMetric } from '../../components/HeroMetric'

const LIST = '/commerce/products'

export function ProductDetailPage() {
  const { id } = useParams()
  if (id === 'new') return <NewProduct />
  return <ProductRecord key={id} id={id ?? ''} />
}

/** The create route: an empty shell under the product dialog. Saving opens the new product in place of this route. */
function NewProduct() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const saved = useRef(false)

  if (!can('product.manage')) {
    return (
      <Card>
        <EmptyState
          title="You cannot create products"
          description="Ask an owner or an operations manager to add it to the catalog."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }

  const leave = () => {
    if (saved.current) return
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(LIST, { replace: true })
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={LIST} />
      <PageHeader
        title="New product"
        description="Name it, price it and add its variants. It starts as a draft until you activate it."
      />
      <ProductDialog
        open
        editing={null}
        onOpenChange={(open) => !open && leave()}
        onSaved={(product) => {
          saved.current = true
          navigate(paths.product(product.id), { replace: true })
        }}
      />
    </div>
  )
}

type Pending = 'edit' | 'archive' | null

function ProductRecord({ id }: { id: string }) {
  const s = useScoped()
  const { can } = useAuth()
  const now = useNow(60_000)
  const [pending, setPending] = useState<Pending>(null)
  const product = s.products.find((p) => p.id === id)

  const perf = useMemo(
    () => (product ? productPerformance([product], s.orders, 30, now).get(product.id) : undefined),
    [product, s.orders, now],
  )
  const daily = useMemo(
    () => (product ? dailyUnits(product.id, s.orders, 30, now) : []),
    [product, s.orders, now],
  )

  if (!product) {
    return (
      <Card>
        <EmptyState
          title="Product not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }

  const manage = can('product.manage')
  const canActivate = product.status === 'draft' || product.status === 'scheduled'
  const blocker = productActivateBlocker(
    product,
    attributesFor(product.categoryId, s.attributes, s.categories),
  )
  const levels = s.stock.filter((l) => l.productId === product.id)
  const state = stockState(product, sumStock(levels))
  const collections = s.collections.filter((c) =>
    collectionProducts(c, s.products, s.categories).some((p) => p.id === product.id),
  )
  const axes = optionAxes(product)
  const unitsSold = daily.reduce((sum, d) => sum + d.value, 0)
  const marginRatio = product.price > 0 ? margin(product.price, product.cost) : null

  const activate = () => {
    s.dispatch({ type: 'products/setStatus', id: product.id, status: 'active' })
    toast(`${product.code} activated`, {
      tone: 'success',
      description: `${product.name} is on sale on every channel.`,
    })
  }

  const restore = () => {
    s.dispatch({ type: 'products/setStatus', id: product.id, status: 'draft' })
    toast(`${product.code} restored to draft`, {
      description: `${product.name} stays off sale until you activate it.`,
    })
  }

  const menu = [
    product.status === 'archived'
      ? {
          key: 'restore',
          label: 'Restore to draft',
          description: 'Brings it back for editing, still off sale',
          icon: <Undo2 />,
          onSelect: restore,
        }
      : {
          key: 'archive',
          label: 'Archive',
          description: 'Takes it off every channel. Orders and stock stay.',
          icon: <Archive />,
          destructive: true,
          onSelect: () => setPending('archive'),
        },
  ]

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={LIST} />
        {manage && (
          <div className="gap-2 flex flex-wrap items-center">
            {canActivate && (
              <Button onClick={activate} disabled={!!blocker} title={blocker ?? undefined}>
                Activate
                <ArrowRight />
              </Button>
            )}
            <Button variant="outline" onClick={() => setPending('edit')}>
              <Pencil />
              Edit
            </Button>
            <ActionMenu
              title={product.code}
              trigger={
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              }
              items={menu}
            />
          </div>
        )}
      </div>

      {manage && canActivate && blocker && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot activate yet:</span> {blocker}
        </Card>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {product.code} · {s.categoryName(product.categoryId)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{product.name}</h1>
            <p className="mt-1 gap-x-2 text-sm flex flex-wrap items-center text-on-ink-muted">
              <span>{plural(product.variants.length, 'variant')}</span>
              {product.assisted && (
                <>
                  <span>·</span>
                  <span>Sold through Talk to sales</span>
                </>
              )}
              {product.status === 'scheduled' && product.publishAt && (
                <>
                  <span>·</span>
                  <span>Goes on sale {fmtDateTime(product.publishAt)}</span>
                </>
              )}
            </p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <Badge className={ON_INK}>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
            <Badge className={ON_INK}>{PRODUCT_TYPE_LABEL[product.type]}</Badge>
          </div>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-3 xl:grid-cols-6 grid grid-cols-2">
          <HeroMetric
            label="Price"
            value={product.assisted && !product.price ? 'Quote' : fmtIdr(product.price)}
          />
          <HeroMetric label="Margin" value={marginRatio === null ? 'None' : fmtPercent(marginRatio, 1)} />
          <HeroMetric label="Units sold" value={fmtNumber(perf?.units ?? 0)} unit="30 days" />
          <HeroMetric label="Revenue" value={fmtIdr(perf?.revenue ?? 0)} unit="30 days" />
          <HeroMetric label="Views" value={fmtNumber(perf?.views ?? 0)} unit="30 days" />
          <HeroMetric
            label="Conversion"
            value={fmtPercent(perf?.conversion ?? 0, 1)}
            unit="views to orders"
          />
        </div>
        {product.status === 'archived' && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Archived. It is off every channel until you restore and activate it.
          </p>
        )}
      </Card>

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              action={
                state !== 'untracked' && (
                  <Link
                    to={`/commerce/inventory?q=${encodeURIComponent(product.code)}`}
                    className="text-xs font-semibold hover:text-accent"
                  >
                    Open inventory
                  </Link>
                )
              }
            >
              <CardTitle>Variants</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {plural(product.variants.length, 'variant')}
                {axes && ` · ${axes}`}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {state === 'untracked'
                  ? `${PRODUCT_TYPE_LABEL[product.type]} products do not track stock.`
                  : 'Stock summed over every warehouse. Available is on hand less units reserved for open orders.'}
              </p>
            </CardHeader>
            <CardContent>
              <VariantTable product={product} tracked={state !== 'untracked'} />
              {state !== 'untracked' && (
                <div className="mt-3 gap-2 text-xs flex flex-wrap items-center text-muted">
                  <StockBadge state={state} />
                  <span>across {plural(new Set(levels.map((l) => l.warehouseId)).size, 'warehouse')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Units sold per day</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                Last 30 days, paid and fulfilled orders on every channel.
              </p>
            </CardHeader>
            <CardContent>
              {unitsSold ? (
                <>
                  <ColumnChart
                    ariaLabel={`Units of ${product.name} sold per day, last 30 days`}
                    data={daily.map((d, i) => ({
                      label: d.label,
                      value: d.value,
                      highlight: i === daily.length - 1,
                    }))}
                    format={(v) => fmtNumber(v)}
                    height={200}
                  />
                  <p className="mt-3 text-xs text-muted">
                    Today is highlighted. {plural(unitsSold, 'unit')} in the window.
                  </p>
                </>
              ) : (
                <EmptyState
                  compact
                  title="No units sold in the last 30 days"
                  description="Sales from every channel show here once an order is paid."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                labelWidth="md"
                items={[
                  { label: 'Description', value: product.description || 'None' },
                  { label: 'Best for', value: product.bestFor || 'None' },
                  {
                    label: 'Tags',
                    value: product.tags.length ? (
                      <span className="gap-1.5 flex flex-wrap">
                        {product.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </span>
                    ) : (
                      'None'
                    ),
                  },
                  { label: 'Created', value: fmtDate(product.createdAt) },
                ]}
              />
            </CardContent>
          </Card>

          <AttributesCard product={product} />
        </div>

        <div className="min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 grid grid-cols-1 content-start">
          <ModifiersCard product={product} />
          <SideCard title="Pricing">
            <KeyValue
              bare
              labelWidth="sm"
              items={[
                {
                  label: 'Regular',
                  value: product.assisted
                    ? product.price
                      ? `From ${fmtIdr(product.price)}, quoted`
                      : 'Talk to sales'
                    : fmtIdr(product.price),
                },
                {
                  label: 'Compare-at',
                  value: product.compareAt ? (
                    <span className="text-muted line-through">{fmtIdr(product.compareAt)}</span>
                  ) : (
                    'None'
                  ),
                },
                { label: 'Member', value: product.memberPrice ? fmtIdr(product.memberPrice) : 'None' },
                { label: 'Cost', value: product.cost ? fmtIdr(product.cost) : 'None' },
                {
                  label: 'Margin',
                  value:
                    marginRatio === null
                      ? 'None'
                      : `${fmtPercent(marginRatio, 1)} · ${fmtIdr(product.price - product.cost)} a unit`,
                },
              ]}
            />
          </SideCard>
          <SideCard title="Reviews">
            {product.reviewCount ? (
              <div className="gap-3 flex items-center">
                <Star className="size-5 shrink-0 fill-current" aria-hidden="true" />
                <p className="gap-1.5 flex items-end leading-none">
                  <span className="text-3xl font-bold tracking-tight tabular-nums">
                    {product.rating.toFixed(1)}
                  </span>
                  <span className="pb-0.5 text-sm text-muted">
                    out of 5 · {plural(product.reviewCount, 'review')}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">No reviews yet. Customers can review it after delivery.</p>
            )}
          </SideCard>
          <SideCard title="Collections">
            {collections.length ? (
              <div className="space-y-2">
                {collections.map((c) => (
                  <div key={c.id} className="rounded-2xl p-3 bg-surface-2">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {c.mode === 'smart' ? 'Smart' : plural(c.productIds.length, 'product')}
                      {c.description && ` · ${c.description}`}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Not in any collection yet.</p>
            )}
          </SideCard>
        </div>
      </div>

      <ProductDialog
        open={pending === 'edit'}
        onOpenChange={(o) => !o && setPending(null)}
        editing={product}
        onSaved={() => undefined}
      />
      <ConfirmDialog
        open={pending === 'archive'}
        onOpenChange={(o) => !o && setPending(null)}
        destructive
        title={`Archive ${product.code}?`}
        description="It leaves the storefront, personal stores and marketplaces. Past orders and stock records stay as they are."
        confirmLabel="Archive product"
        cancelLabel="Keep on sale"
        onConfirm={() => {
          s.dispatch({ type: 'products/setStatus', id: product.id, status: 'archived' })
          toast(`${product.code} archived`, { description: `${product.name} is off every channel.` })
          setPending(null)
        }}
      />
    </div>
  )
}

const TH = 'h-9 px-2 text-left text-xs font-semibold uppercase tracking-wide text-muted first:pl-0 last:pr-0'
const TD = 'px-2 py-2.5 align-middle first:pl-0 last:pr-0'

type Totals = { onHand: number; reserved: number; available: number; safety: number }

function VariantTable({ product, tracked }: { product: Product; tracked: boolean }) {
  const { stock } = useScoped()
  const totals = useMemo(() => {
    const byVariant = new Map<string, Totals>()
    for (const l of stock) {
      if (l.productId !== product.id) continue
      const t = byVariant.get(l.variantId) ?? { onHand: 0, reserved: 0, available: 0, safety: 0 }
      byVariant.set(l.variantId, {
        onHand: t.onHand + l.onHand,
        reserved: t.reserved + l.reserved,
        available: t.available + l.onHand - l.reserved,
        safety: t.safety + l.safety,
      })
    }
    return byVariant
  }, [stock, product.id])

  // Two or more options: a heading per value of the option with the fewest values (Colour over Size),
  // then a column per remaining option.
  const first = [...product.options].sort((a, b) => a.values.length - b.values.length)[0]
  const rest = product.options.filter((o) => o !== first)
  const grouped = !!first && rest.length > 0
  const columns = grouped ? rest : product.options
  const groups = grouped
    ? first.values
        .map((value) => ({
          value,
          variants: product.variants.filter((v) => v.optionValues[first.name] === value),
        }))
        .filter((g) => g.variants.length)
    : [{ value: null, variants: product.variants }]
  const span = Math.max(1, columns.length) + 2 + (tracked ? 3 : 0)

  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full">
        <caption className="sr-only">Variants of {product.name}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.length ? (
              columns.map((o) => (
                <th key={o.name} className={TH}>
                  {o.name}
                </th>
              ))
            ) : (
              <th className={TH}>Variant</th>
            )}
            <th className={cn(TH, 'sm:table-cell hidden')}>SKU</th>
            <th className={cn(TH, 'text-right')}>Price</th>
            {tracked && (
              <>
                <th className={cn(TH, 'lg:table-cell hidden text-right')}>On hand</th>
                <th className={cn(TH, 'lg:table-cell hidden text-right')}>Reserved</th>
                <th className={cn(TH, 'text-right')}>Available</th>
              </>
            )}
          </tr>
        </thead>
        {groups.map((g) => {
          const available = g.variants.reduce((n, v) => n + (totals.get(v.id)?.available ?? 0), 0)
          return (
            <tbody key={g.value ?? 'all'}>
              {grouped && first && (
                <tr className="border-b border-border">
                  <th scope="rowgroup" colSpan={span} className="pt-4 pb-2 text-left">
                    <span className="text-sm font-semibold">
                      {first.name} {g.value}
                    </span>
                    <span className="ml-2 text-xs font-normal text-muted tabular-nums">
                      {plural(g.variants.length, 'variant')}
                      {tracked && ` · ${fmtNumber(available)} available`}
                    </span>
                  </th>
                </tr>
              )}
              {g.variants.map((v) => {
                const t = totals.get(v.id)
                return (
                  <tr key={v.id} className="border-b border-border">
                    {columns.length ? (
                      columns.map((o, i) => (
                        <td key={o.name} className={cn(TD, i === 0 && 'font-medium')}>
                          {v.optionValues[o.name] ?? <span className="text-muted">–</span>}
                          {i === 0 && (
                            <p className="sm:hidden font-normal font-mono text-[11px] text-muted">{v.sku}</p>
                          )}
                        </td>
                      ))
                    ) : (
                      <td className={cn(TD, 'font-medium')}>
                        {v.name}
                        <p className="sm:hidden font-normal font-mono text-[11px] text-muted">{v.sku}</p>
                      </td>
                    )}
                    <td className={cn(TD, 'text-xs sm:table-cell hidden font-mono whitespace-nowrap')}>
                      {v.sku}
                    </td>
                    <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>
                      {product.assisted && !v.price ? 'Quote' : fmtIdr(v.price)}
                    </td>
                    {tracked &&
                      (t ? (
                        <>
                          <td className={cn(TD, 'lg:table-cell hidden text-right tabular-nums')}>
                            {fmtNumber(t.onHand)}
                          </td>
                          <td className={cn(TD, 'lg:table-cell hidden text-right tabular-nums')}>
                            {fmtNumber(t.reserved)}
                          </td>
                          <td
                            className={cn(
                              TD,
                              'text-right tabular-nums',
                              t.available <= 0
                                ? 'font-semibold text-accent'
                                : t.available <= t.safety && 'font-semibold text-warning',
                            )}
                          >
                            {fmtNumber(t.available)}
                          </td>
                        </>
                      ) : (
                        <td className={cn(TD, 'text-xs text-right text-muted')} colSpan={3}>
                          No stock received yet
                        </td>
                      ))}
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <Kicker className="font-bold text-[13px] tracking-[0.4px] text-foreground">{title}</Kicker>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
