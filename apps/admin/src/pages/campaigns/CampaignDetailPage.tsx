import {
  audienceSize,
  campaignLaunchBlocker,
  describePromotion,
  fmtDate,
  fmtDateShort,
  fmtIdr,
  fmtNumber,
  fmtPercent,
  fmtWhen,
  newId,
  nextCode,
  nowMs,
  plural,
  toIso,
  toMs,
} from '@rc/fixtures'
import {
  CAMPAIGN_STATUS_LABEL,
  FUNNEL_FLOW,
  FUNNEL_STEP_LABEL,
  MESSAGE_CHANNEL_LABEL,
  type Campaign,
  type Order,
} from '@rc/types'
import {
  ActionMenu,
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
  Kicker,
  ProgressBar,
  Steps,
  cn,
  toast,
} from '@rc/ui'
import { Copy, MoreHorizontal, Pause, Pencil, Play, Rocket } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ON_INK, OrderStatusBadge } from '../../components/badges'
import { CustomerLink, OrderLink, paths } from '../../components/links'
import { useNow, useScoped } from '../../state/scoped'
import { CampaignDialog } from './CampaignDialog'
import { HeroMetric } from '../../components/HeroMetric'
import { campaignSteps, clickToPurchase, emptyFunnel, fmtRoi, roi, ruleLines } from './lib'

const LIST = '/marketing/campaigns'

export function CampaignDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [editing, setEditing] = useState(false)
  const campaign = s.campaigns.find((c) => c.id === id)
  const segmentId = campaign?.segmentId ?? null
  const size = useMemo(
    () => audienceSize(s.state, s.tenantId, segmentId, nowMs()),
    [s.state, s.tenantId, segmentId],
  )
  const orders = useMemo(() => s.orders.filter((o) => o.campaignId === id), [s.orders, id])

  if (!campaign) {
    return (
      <Card>
        <EmptyState
          title="Campaign not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }

  const canManage = can('campaign.manage')
  const blocker = campaignLaunchBlocker(campaign, size)
  const launchable = campaign.status === 'draft' || campaign.status === 'paused'
  const launchLabel =
    campaign.status === 'paused' ? 'Resume' : toMs(campaign.startAt) > now ? 'Schedule' : 'Launch'
  const segment = campaign.segmentId ? s.maps.segment.get(campaign.segmentId) : undefined
  const promotion = campaign.promotionId ? s.maps.promotion.get(campaign.promotionId) : undefined
  const page = campaign.pageId ? s.maps.page.get(campaign.pageId) : undefined
  const { funnel } = campaign

  const launch = () => {
    s.dispatch({ type: 'campaigns/launch', id: campaign.id })
    const scheduled = toMs(campaign.startAt) > nowMs()
    toast(
      scheduled
        ? 'Campaign scheduled'
        : campaign.status === 'paused'
          ? 'Campaign resumed'
          : 'Campaign launched',
      {
        tone: 'success',
        description: `${campaign.name} · ${scheduled ? `starts ${fmtDate(campaign.startAt)}` : `sending to ${plural(size, 'customer')}`}`,
      },
    )
  }

  const pause = () => {
    s.dispatch({ type: 'campaigns/pause', id: campaign.id })
    toast('Campaign paused', { description: `${campaign.name} · no messages go out until you resume it.` })
  }

  const duplicate = () => {
    const start = Math.max(toMs(campaign.startAt), nowMs())
    const copy: Campaign = {
      ...campaign,
      id: newId('cmp'),
      code: nextCode(
        s.campaigns.map((c) => c.code),
        'CMP-',
        3,
      ),
      name: `${campaign.name} (copy)`,
      status: 'draft',
      startAt: toIso(start),
      endAt: toIso(start + (toMs(campaign.endAt) - toMs(campaign.startAt))),
      funnel: emptyFunnel(),
      revenue: 0,
      createdBy: s.user.id,
    }
    s.dispatch({ type: 'campaigns/save', campaign: copy })
    toast('Campaign duplicated', {
      tone: 'success',
      description: `${copy.code} · ${copy.name} saved as a draft.`,
    })
    navigate(paths.campaign(copy.id))
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
        {canManage && (
          <div className="gap-2 flex flex-wrap items-center">
            {campaign.status !== 'completed' && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
            )}
            {launchable && (
              <Button onClick={launch} disabled={!!blocker} title={blocker ?? undefined}>
                {campaign.status === 'paused' ? <Play /> : <Rocket />}
                {launchLabel}
              </Button>
            )}
            {campaign.status === 'running' && (
              <Button onClick={pause}>
                <Pause />
                Pause
              </Button>
            )}
            <ActionMenu
              title={campaign.code}
              trigger={
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              }
              items={[
                {
                  key: 'duplicate',
                  label: 'Duplicate',
                  description: 'A new draft with the same audience, offer and channels',
                  icon: <Copy />,
                  onSelect: duplicate,
                },
              ]}
            />
          </div>
        )}
      </div>

      {canManage && launchable && blocker && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot {launchLabel.toLowerCase()} yet:</span> {blocker}
        </Card>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {campaign.code} · {fmtDateShort(campaign.startAt)} → {fmtDate(campaign.endAt)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{campaign.name}</h1>
            {campaign.goal && <p className="mt-1 max-w-2xl text-sm text-on-ink-muted">{campaign.goal}</p>}
          </div>
          <Badge className={ON_INK} dot={campaign.status === 'running'}>
            {CAMPAIGN_STATUS_LABEL[campaign.status]}
          </Badge>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-3 lg:grid-cols-5 grid grid-cols-2">
          <HeroMetric label="Revenue" value={fmtIdr(campaign.revenue)} />
          <HeroMetric label="ROI" value={fmtRoi(roi(campaign))} unit="of budget" />
          <HeroMetric label="Purchases" value={fmtNumber(funnel.purchased)} />
          <HeroMetric
            label="Click to purchase"
            value={fmtPercent(clickToPurchase(funnel))}
            unit={`of ${fmtNumber(funnel.clicked)} clicks`}
          />
          <HeroMetric label="Budget" value={campaign.budget ? fmtIdr(campaign.budget) : 'None'} />
        </div>
        {campaign.status === 'paused' && (
          <p className="mt-4 rounded-2xl px-3 py-2 text-sm bg-warning/20">
            Paused. No messages go out until you resume the campaign.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <Steps steps={campaignSteps(campaign, now)} />
      </Card>

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>
              Each step counts the customers who reached it. The percentage compares with the step before.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 rounded-2xl p-4 bg-surface-2">
              <Kicker>Campaign revenue attribution</Kicker>
              <p className="mt-1 font-extrabold leading-tight tracking-tight text-[28px] tabular-nums">
                {fmtIdr(campaign.revenue)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {plural(funnel.purchased, 'purchase')}
                {funnel.purchased > 0 && ` · ${fmtIdr(campaign.revenue / funnel.purchased)} per purchase`}
              </p>
            </div>
            {funnel.sent === 0 ? (
              <EmptyState
                compact
                title="Nothing sent yet"
                description="The funnel fills in once the campaign starts sending."
              />
            ) : (
              <ol className="space-y-3">
                {FUNNEL_FLOW.map((step, i) => {
                  const count = funnel[step]
                  const prev = i > 0 ? funnel[FUNNEL_FLOW[i - 1]!] : null
                  const last = step === 'purchased'
                  return (
                    <li key={step}>
                      <div className="mb-1 gap-2 text-sm flex items-baseline justify-between">
                        <span
                          className={cn('min-w-0 truncate', last ? 'font-semibold text-accent' : 'text-body')}
                        >
                          {FUNNEL_STEP_LABEL[step]}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-semibold">{fmtNumber(count)}</span>
                          {prev !== null && (
                            <span className="ml-2 w-12 text-xs inline-block text-right text-muted">
                              {prev ? fmtPercent(count / prev) : '0%'}
                            </span>
                          )}
                        </span>
                      </div>
                      <ProgressBar
                        value={count / funnel.sent}
                        tone={last ? 'accent' : 'ink'}
                        size="md"
                        aria-label={`${FUNNEL_STEP_LABEL[step]}: ${count} of ${funnel.sent} sent`}
                      />
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 grid grid-cols-1 content-start">
          <SideCard
            title="Audience"
            action={
              segment && (
                <Link to={paths.segment(segment.id)} className="text-xs font-semibold hover:text-accent">
                  Open segment
                </Link>
              )
            }
          >
            {segment ? (
              <>
                <Link to={paths.segment(segment.id)} className="font-semibold hover:text-accent">
                  {segment.name}
                </Link>
                <p className="mt-0.5 text-sm text-muted">{plural(size, 'customer')} today</p>
                <div className="mt-3 rounded-2xl px-3 py-2 text-sm bg-surface-2">
                  <p className="text-xs text-muted">Matches {segment.match === 'all' ? 'all' : 'any'} of:</p>
                  <ul className="mt-1 space-y-0.5">
                    {ruleLines(segment, s.categoryName).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">No audience yet. Edit the campaign to choose a segment.</p>
            )}
          </SideCard>
          <SideCard title="Offer">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Promotion</dt>
                <dd>
                  {promotion ? (
                    <Link to={paths.promotion(promotion.id)} className="hover:text-accent">
                      <span className="text-xs font-semibold font-mono">{promotion.code}</span> ·{' '}
                      {describePromotion(
                        promotion,
                        (id) => s.maps.paymentType.get(id)?.name ?? 'another payment type',
                      )}
                    </Link>
                  ) : (
                    'None'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Landing page</dt>
                <dd>
                  {page ? (
                    <Link to={paths.page(page.id)} className="hover:text-accent">
                      {page.title} <span className="text-xs font-mono text-muted">/{page.slug}</span>
                    </Link>
                  ) : (
                    'None'
                  )}
                </dd>
              </div>
            </dl>
          </SideCard>
          <SideCard title="Channels">
            {campaign.channels.length ? (
              <div className="gap-1.5 flex flex-wrap">
                {campaign.channels.map((ch) => (
                  <Badge key={ch} variant="outline">
                    {MESSAGE_CHANNEL_LABEL[ch]}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">None yet. Launch needs at least one channel.</p>
            )}
            <p className="mt-3 text-xs text-muted">Created by {s.userName(campaign.createdBy)}</p>
          </SideCard>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attributed orders</CardTitle>
          <CardDescription>Orders placed from a link in this campaign, or with its voucher.</CardDescription>
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
              description="Orders appear here when a customer buys through this campaign."
            />
          }
        />
      </Card>

      {canManage && (
        <CampaignDialog
          open={editing}
          onOpenChange={setEditing}
          editing={campaign}
          onSaved={(c) => toast('Campaign saved', { tone: 'success', description: `${c.code} · ${c.name}` })}
        />
      )}
    </div>
  )
}

function SideCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader action={action}>
        <Kicker className="font-bold text-[13px] tracking-[0.4px] text-foreground">{title}</Kicker>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
