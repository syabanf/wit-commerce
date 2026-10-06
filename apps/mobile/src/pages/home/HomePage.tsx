import { fmtAgo, fmtIdr, fmtIdrShort, fmtNumber, sellerPerformance, toMs } from '@rc/fixtures'
import type { Order } from '@rc/types'
import { Button, Card, EmptyState, cn } from '@rc/ui'
import { ArrowRight, Receipt, Share2, Store, Target } from 'lucide-react'
import { Link, type To } from 'react-router'
import { OrderStatusText } from '../../components/badges'
import { LeadRailCard } from '../../components/LeadCards'
import { Section, sectionLinkClass } from '../../components/Section'
import { ScreenHeader } from '../../layouts/ScreenHeader'
import { paths } from '../../lib/paths'
import { firstName, fmtRate, greeting, isOpenLead, monthToDateDays, shareLink } from '../../lib/seller'
import { useNow, useSellerScope } from '../../state/scope'

const TILE_TONE = {
  ink: 'bg-ink text-on-ink',
  accent: 'bg-accent-strong text-white shadow-glow',
  card: 'bg-card',
} as const

function StatTile({
  tone,
  to,
  value,
  label,
}: {
  tone: keyof typeof TILE_TONE
  to: To
  value: string
  label: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'px-4 py-5 rounded-[24px] shadow-card transition-transform focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]',
        TILE_TONE[tone],
      )}
    >
      <span className="font-bold block truncate text-[28px] leading-none tabular-nums">{value}</span>
      <span className="mt-2 text-xs font-medium leading-tight block">{label}</span>
    </Link>
  )
}

export function HomePage() {
  const { user, seller, tenant, leads, orders, traffic, storeUrl, storeHref, maps } = useSellerScope()
  const now = useNow()
  const perf = (days: number) =>
    sellerPerformance([seller], orders, traffic, leads, days, now).get(seller.id)!
  const week = perf(7)
  const month = perf(30)
  const thisMonth = perf(monthToDateDays(now))
  const openLeads = leads.filter(isOpenLead)
  const followUp = [...openLeads].sort((a, b) => toMs(a.updatedAt) - toMs(b.updatedAt))
  const template = maps.template.get(seller.templateId)

  return (
    <div className="space-y-6">
      <ScreenHeader context={`${greeting(now)} · ${tenant.name}`} title={`Hi, ${firstName(user.name)}`} />

      <div className="gap-3 grid grid-cols-3">
        <StatTile
          tone="ink"
          to={paths.store}
          value={fmtNumber(week.visitors)}
          label="Store visitors in 7 days"
        />
        <StatTile tone="accent" to={paths.leads()} value={fmtNumber(openLeads.length)} label="Open leads" />
        <StatTile
          tone="card"
          to={{ hash: 'recent-sales' }}
          value={fmtIdrShort(month.revenue).replace(/^Rp\s/, '')}
          label="Rupiah sold in 30 days"
        />
      </div>

      <Button
        size="lg"
        className="h-14 w-full"
        onClick={() => shareLink(storeHref, `${seller.name} · ${tenant.name}`)}
      >
        <Share2 />
        Share my store
      </Button>

      <Link
        to={paths.store}
        className="gap-3 p-5 flex items-center rounded-[24px] bg-info-soft transition-transform focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]"
      >
        <span className="size-11 flex shrink-0 items-center justify-center rounded-full bg-card text-info">
          <Store aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold block">Your store</span>
          <span className="text-xs block truncate text-body/70">
            {storeUrl} · {template?.name ?? 'No template'}
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-info" />
      </Link>

      <Section
        title="Leads to follow up"
        count={openLeads.length}
        action={
          openLeads.length > 0 ? (
            <Link to={paths.leads()} className={sectionLinkClass}>
              All leads
            </Link>
          ) : undefined
        }
      >
        {followUp.length ? (
          <div className="-mx-5 scroll-px-5 gap-3 px-5 pb-1 no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
            {followUp.map((lead) => (
              <LeadRailCard key={lead.id} lead={lead} now={now} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              compact
              icon={<Target />}
              title="No open leads"
              description="Leads from your store and WhatsApp land here. Log the ones you meet in person too."
              action={
                <Button asChild variant="outline" className="h-11">
                  <Link to={`${paths.leads()}?new=1`}>New lead</Link>
                </Button>
              }
            />
          </Card>
        )}
      </Section>

      <Section id="recent-sales" title="Recent sales" count={orders.length}>
        <div className="gap-3 p-4 flex items-center justify-between rounded-[24px] bg-card shadow-card">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">Commission this month</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">{fmtIdr(thisMonth.commission)}</p>
          </div>
          <p className="text-xs shrink-0 text-right text-muted">
            {fmtRate(seller.commissionRate)} of
            <span className="font-semibold block text-body tabular-nums">{fmtIdr(thisMonth.revenue)}</span>
          </p>
        </div>
        {orders.length ? (
          <ul className="px-4 divide-y divide-border rounded-[24px] bg-card shadow-card">
            {orders.slice(0, 5).map((order) => (
              <SaleRow key={order.id} order={order} now={now} />
            ))}
          </ul>
        ) : (
          <Card>
            <EmptyState
              compact
              icon={<Receipt />}
              title="No attributed sales yet"
              description="Orders placed through your store or a link with your ref count here and earn commission."
            />
          </Card>
        )}
      </Section>
    </div>
  )
}

function SaleRow({ order, now }: { order: Order; now: number }) {
  const { customerName, isMine } = useSellerScope()
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{customerName(order.customerId)}</p>
        <p className="text-xs truncate text-muted">
          <span className="font-mono">{order.code}</span> · {fmtAgo(order.createdAt, now)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums">{fmtIdr(order.total)}</p>
        <OrderStatusText status={order.status} />
      </div>
    </>
  )
  return (
    <li>
      {isMine(order.customerId) ? (
        <Link
          to={paths.customer(order.customerId)}
          className="-mx-2 min-h-14 gap-3 rounded-2xl px-2 py-3 flex items-center focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        <div className="min-h-14 gap-3 py-3 flex items-center">{body}</div>
      )}
    </li>
  )
}
