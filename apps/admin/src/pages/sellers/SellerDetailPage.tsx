import {
  dailyRevenue,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  fmtWhen,
  plural,
  sellerPerformance,
  toMs,
} from '@rc/fixtures'
import { SELLER_KIND_LABEL, SELLER_STATUS_LABEL, type Order, type Seller } from '@rc/types'
import {
  ActionMenu,
  Badge,
  BarStrip,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  KeyValue,
  Kicker,
  LineChart,
  toast,
} from '@rc/ui'
import { Ban, Link2, MoreHorizontal, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { LeadStageBadge, ON_INK, OrderStatusBadge } from '../../components/badges'
import { CustomerLink, OrderLink, ProductLink, paths } from '../../components/links'
import { ProductsPicker } from '../../components/pickers'
import { useNow, useScoped } from '../../state/scoped'
import { HeroMetric } from '../../components/HeroMetric'
import { PersonalStoreCard } from './PersonalStoreCard'
import { dailyVisitors, storeUrl } from './lib'

const LIST = '/sales/sellers'
const LEADS_SHOWN = 6

export function SellerDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [suspending, setSuspending] = useState(false)
  const seller = s.sellers.find((x) => x.id === id)

  const orders = useMemo(() => s.orders.filter((o) => o.sellerId === id), [s.orders, id])
  const stats = useMemo(
    () =>
      seller ? sellerPerformance([seller], s.orders, s.traffic, s.leads, 30, now).get(seller.id) : undefined,
    [seller, s.orders, s.traffic, s.leads, now],
  )
  const visitors = useMemo(() => (id ? dailyVisitors(s.traffic, id, 30, now) : []), [s.traffic, id, now])
  const dailyOrders = useMemo(() => dailyRevenue(orders, 30, now), [orders, now])

  if (!seller || !stats) {
    return (
      <Card>
        <EmptyState
          title="Seller not found"
          description="They may have been removed or sell for another brand."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }

  const canManage = can('seller.manage')
  const url = storeUrl(s.tenant, seller)
  const leads = s.leads
    .filter((l) => l.sellerId === seller.id)
    .sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt))
  const assigned = s.customers.filter((c) => c.sellerId === seller.id).length
  const first = seller.name.split(' ')[0]

  const copyLink = () => {
    navigator.clipboard.writeText(`https://${url}`).then(
      () => toast('Store link copied', { tone: 'success', description: `https://${url}` }),
      () =>
        toast('Could not copy the link', { tone: 'danger', description: `Copy it by hand: https://${url}` }),
    )
  }

  const reactivate = () => {
    s.dispatch({ type: 'sellers/setStatus', id: seller.id, status: 'active' })
    toast('Seller reactivated', { tone: 'success', description: `${seller.name} · ${url} is live again.` })
  }

  const orderColumns: Column<Order>[] = [
    { id: 'order', header: 'Order', sortValue: (o) => o.code, cell: (o) => <OrderLink orderId={o.id} /> },
    {
      id: 'customer',
      header: 'Customer',
      hideBelow: 'md',
      sortValue: (o) => s.customerName(o.customerId),
      cell: (o) => <CustomerLink customerId={o.customerId} />,
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (o) => o.status,
      cell: (o) => <OrderStatusBadge status={o.status} />,
    },
    {
      id: 'date',
      header: 'Placed',
      hideBelow: 'lg',
      sortValue: (o) => toMs(o.createdAt),
      cell: (o) => <span className="whitespace-nowrap">{fmtWhen(o.createdAt, now)}</span>,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (o) => o.total,
      cell: (o) => <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdr(o.total)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={LIST} />
        <ActionMenu
          title={seller.code}
          trigger={
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          }
          items={[
            { key: 'copy', label: 'Copy store link', description: url, icon: <Link2 />, onSelect: copyLink },
            ...(canManage
              ? [
                  'separator' as const,
                  seller.status === 'suspended'
                    ? {
                        key: 'reactivate',
                        label: 'Reactivate',
                        description: 'Puts the store back online',
                        icon: <RotateCcw />,
                        onSelect: reactivate,
                      }
                    : {
                        key: 'suspend',
                        label: seller.status === 'invited' ? 'Suspend invite' : 'Suspend',
                        description: 'Takes the store offline and stops ref links counting',
                        icon: <Ban />,
                        destructive: true,
                        onSelect: () => setSuspending(true),
                      },
                ]
              : []),
          ]}
        />
      </div>

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {seller.code} · {SELLER_KIND_LABEL[seller.kind]}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{seller.name}</h1>
            <p className="mt-1 gap-x-2 text-sm flex flex-wrap items-center text-on-ink-muted">
              <a
                href={`https://${url}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold font-mono text-on-ink hover:text-accent"
              >
                {url}
              </a>
              <span>·</span>
              <span>{seller.city}</span>
            </p>
          </div>
          <Badge className={ON_INK}>{SELLER_STATUS_LABEL[seller.status]}</Badge>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-3 lg:grid-cols-5 grid grid-cols-2">
          <HeroMetric label="Visitors 30d" value={fmtNumber(stats.visitors)} />
          <HeroMetric label="Orders" value={fmtNumber(stats.orders)} unit="30 days" />
          <HeroMetric label="Revenue" value={fmtIdrShort(stats.revenue)} unit="30 days" />
          <HeroMetric label="Conversion" value={fmtPercent(stats.conversion, 1)} unit="of visitors" />
          <HeroMetric
            label="Commission"
            value={fmtIdrShort(stats.commission)}
            unit={`at ${fmtPercent(seller.commissionRate, 1)}`}
          />
        </div>
        {seller.status === 'suspended' && (
          <p className="mt-4 rounded-2xl px-3 py-2 text-sm bg-accent/20">
            Suspended. The store is offline and ?ref={seller.slug} links do not count.
          </p>
        )}
        {seller.status === 'invited' && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Invited. The store goes live once {first} finishes setting it up.
          </p>
        )}
      </Card>

      <PersonalStoreCard key={seller.id} seller={seller} />

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Store visitors per day</CardTitle>
            <CardDescription>Unique visitors to {url}, last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              ariaLabel="Store visitors per day, last 30 days"
              data={visitors.map((d) => ({ label: d.label, value: d.value }))}
              format={(v) => fmtNumber(v)}
              height={180}
              area
            />
            <div className="mt-5 gap-2 flex flex-wrap items-baseline justify-between">
              <Kicker>Orders per day</Kicker>
              <span className="text-xs text-muted">{plural(stats.orders, 'order')} in 30 days</span>
            </div>
            <BarStrip
              className="mt-2"
              ariaLabel="Attributed orders per day, last 30 days"
              data={dailyOrders.map((d) => ({ label: d.label, value: d.orders }))}
              format={(v) => plural(v, 'order')}
              height={56}
            />
          </CardContent>
        </Card>

        <FeaturedProductsCard key={seller.id} seller={seller} canManage={canManage} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attributed orders</CardTitle>
          <CardDescription>
            Orders from {url} or any link with ?ref={seller.slug}.
          </CardDescription>
        </CardHeader>
        <DataTable
          columns={orderColumns}
          rows={orders}
          getRowKey={(o) => o.id}
          onRowClick={(o) => navigate(paths.order(o.id))}
          initialSort={{ id: 'date', desc: true }}
          pageSize={8}
          empty={
            <EmptyState
              compact
              title="No orders yet"
              description={`Orders appear here when a customer buys through ${first}'s store or ref link.`}
            />
          }
        />
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card className="min-w-0">
          <CardHeader action={<span className="text-xs text-muted">{plural(leads.length, 'lead')}</span>}>
            <CardTitle>Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <EmptyState
                compact
                title="No leads yet"
                description="Talk to sales requests from the personal store land here."
              />
            ) : (
              <ul className="space-y-2">
                {leads.slice(0, LEADS_SHOWN).map((l) => (
                  <li key={l.id}>
                    <Link
                      to={paths.lead(l.id)}
                      className="gap-2 rounded-2xl p-3 flex flex-wrap items-center justify-between bg-surface-2 transition-colors hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold block truncate">{l.name}</span>
                        <span className="text-xs block truncate text-muted">
                          {l.company || 'Individual'} · {l.value ? fmtIdrShort(l.value) : 'No value yet'}
                        </span>
                      </span>
                      <LeadStageBadge stage={l.stage} />
                    </Link>
                  </li>
                ))}
                {leads.length > LEADS_SHOWN && (
                  <li className="text-[0.6875rem] text-muted">+{leads.length - LEADS_SHOWN} more</li>
                )}
              </ul>
            )}
            <div className="mt-4 gap-2 rounded-2xl p-3 flex flex-wrap items-center justify-between bg-surface-2">
              <span className="text-sm">
                <span className="font-semibold tabular-nums">{fmtNumber(assigned)}</span>{' '}
                <span className="text-muted">{assigned === 1 ? 'customer' : 'customers'} assigned</span>
              </span>
              <Link to="/customers/all" className="text-xs font-semibold hover:text-accent">
                Open customers
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="md"
              items={[
                { label: 'Headline', value: seller.headline || 'Not yet' },
                { label: 'Bio', value: seller.bio || 'Not yet' },
                { label: 'WhatsApp', value: seller.whatsapp },
                { label: 'Instagram', value: seller.instagram ?? 'None' },
                { label: 'City', value: seller.city },
                { label: 'Joined', value: fmtDate(seller.joinedAt) },
                {
                  label: 'Commission',
                  value: `${fmtPercent(seller.commissionRate, 1)} of attributed revenue`,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <ConfirmDialog
          open={suspending}
          onOpenChange={setSuspending}
          destructive
          title={`Suspend ${seller.name}?`}
          description={`${url} goes offline and ?ref=${seller.slug} links stop counting. Orders already placed keep their attribution and commission.`}
          confirmLabel="Suspend seller"
          onConfirm={() => {
            s.dispatch({ type: 'sellers/setStatus', id: seller.id, status: 'suspended' })
            toast('Seller suspended', { description: `${seller.name} · ${url} is offline.` })
            setSuspending(false)
          }}
        />
      )}
    </div>
  )
}

function FeaturedProductsCard({ seller, canManage }: { seller: Seller; canManage: boolean }) {
  const { dispatch } = useScoped()
  const [picked, setPicked] = useState(seller.featuredProductIds)
  const dirty =
    picked.length !== seller.featuredProductIds.length ||
    picked.some((x, i) => x !== seller.featuredProductIds[i])

  const save = () => {
    dispatch({ type: 'sellers/save', seller: { ...seller, featuredProductIds: picked } })
    toast('Featured products saved', {
      tone: 'success',
      description: `${seller.name}'s store now features ${plural(picked.length, 'product')}.`,
    })
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Featured products</CardTitle>
        <CardDescription>
          Shown in the featured section of the personal store, whatever the template.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage && (
          <div className="mb-4 space-y-2">
            <ProductsPicker aria-label="Featured products" values={picked} onChange={setPicked} />
            {dirty && (
              <div className="gap-2 flex flex-wrap items-center justify-end">
                <Button variant="ghost" size="sm" onClick={() => setPicked(seller.featuredProductIds)}>
                  Reset
                </Button>
                <Button size="sm" onClick={save}>
                  Save featured products
                </Button>
              </div>
            )}
          </div>
        )}
        {seller.featuredProductIds.length === 0 ? (
          <EmptyState
            compact
            title="No featured products"
            description={
              canManage
                ? 'Pick products above to feature them on the store.'
                : 'The seller has not featured any products yet.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {seller.featuredProductIds.map((pid) => (
              <li key={pid} className="rounded-2xl p-3 bg-surface-2">
                <ProductLink productId={pid} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
