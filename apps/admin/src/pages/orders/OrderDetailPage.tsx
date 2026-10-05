import {
  ORDER_ADVANCE_VERB,
  fmtDateTime,
  fmtIdr,
  fmtNumber,
  fmtWhen,
  metricsFor,
  nextOrderStatus,
  orderAdvanceBlocker,
  orderCancelBlocker,
  orderRefundBlocker,
  plural,
  unitCount,
} from '@rc/fixtures'
import type { Order, OrderStatus } from '@rc/types'
import {
  CANCEL_REASON_LABEL,
  CHANNEL_LABEL,
  COURIER_LABEL,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
} from '@rc/types'
import {
  ActionMenu,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  Kicker,
  Steps,
  type StepsProps,
  toast,
} from '@rc/ui'
import { ArrowRight, Ban, MoreHorizontal, NotebookPen, Printer, Undo2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ON_INK, OrderStatusBadge, PaymentBadge, TierBadge } from '../../components/badges'
import { CustomerLink, ProductLink, SellerChip, paths } from '../../components/links'
import { useNow, useScoped } from '../../state/scoped'
import { CancelOrderDialog, NoteDialog, RefundDialog, ShipDialog } from './dialogs'
import { HeroMetric } from '../../components/HeroMetric'

type Pending = 'ship' | 'cancel' | 'refund' | 'note' | null

function orderSteps(order: Order): StepsProps['steps'] {
  const flow = ORDER_STATUS_FLOW.filter((s) => !(s === 'paid' && order.paymentMethod === 'cod'))
  const closedEarly =
    order.status === 'cancelled' || order.status === 'refunded' || order.status === 'returned'
  const reachedAt = new Map<OrderStatus, string>()
  for (const e of order.events) if (e.status && !reachedAt.has(e.status)) reachedAt.set(e.status, e.at)
  const current = flow.indexOf(order.status)
  return flow.map((status, i) => {
    const at = reachedAt.get(status)
    const state = closedEarly
      ? at
        ? 'done'
        : 'skipped'
      : i < current
        ? 'done'
        : i === current
          ? 'current'
          : 'upcoming'
    return { key: status, label: ORDER_STATUS_LABEL[status], state, hint: at ? fmtWhen(at) : undefined }
  })
}

export function OrderDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const now = useNow(60_000)
  const [pending, setPending] = useState<Pending>(null)
  const order = s.orders.find((o) => o.id === id)

  if (!order) {
    return (
      <Card>
        <EmptyState
          title="Order not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback="/commerce/orders" />}
        />
      </Card>
    )
  }

  const customer = s.maps.customer.get(order.customerId)
  const metrics = metricsFor(s.crm.metrics, order.customerId)
  const next = nextOrderStatus(order)
  const advanceBlock = orderAdvanceBlocker(order, s.stock)
  const cancelBlock = orderCancelBlocker(order)
  const refundBlock = orderRefundBlocker(order)
  const campaign = order.campaignId ? s.maps.campaign.get(order.campaignId) : undefined
  const warehouse = s.maps.warehouse.get(order.warehouseId)
  const closed =
    order.status === 'cancelled' ||
    order.status === 'refunded' ||
    order.status === 'returned' ||
    order.status === 'completed'

  const advance = () => {
    if (!next) return
    if (next === 'shipped') return setPending('ship')
    s.dispatch({ type: 'orders/advance', id: order.id })
    toast(`${order.code} ${ORDER_STATUS_LABEL[next].toLowerCase()}`, {
      tone: 'success',
      description:
        next === 'paid'
          ? `${fmtIdr(order.total)} recorded. Points go to ${customer?.name ?? 'the customer'}.`
          : `${s.customerName(order.customerId)} · ${plural(unitCount(order.lines), 'item')}`,
    })
  }

  const menu = [
    {
      key: 'note',
      label: 'Add internal note',
      description: 'Visible to your team only',
      icon: <NotebookPen />,
      onSelect: () => setPending('note'),
    },
    { key: 'print', label: 'Print packing slip', icon: <Printer />, onSelect: () => window.print() },
    ...(can('order.refund') && !closed
      ? [
          {
            key: 'refund',
            label: 'Refund',
            description: refundBlock ?? 'Full or partial, back to the original method',
            icon: <Undo2 />,
            disabled: !!refundBlock,
            onSelect: () => setPending('refund'),
          },
        ]
      : []),
    ...(can('order.fulfil') && !closed
      ? [
          'separator' as const,
          {
            key: 'cancel',
            label: 'Cancel order',
            description: cancelBlock ?? 'Releases reserved stock',
            icon: <Ban />,
            destructive: true,
            disabled: !!cancelBlock,
            onSelect: () => setPending('cancel'),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <p className="mb-4 text-xs hidden text-muted print:block">
        Packing slip · {s.tenant.name} · printed {fmtDateTime(now)}
      </p>
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback="/commerce/orders" />
        <div className="gap-2 flex flex-wrap items-center print:hidden">
          {can('order.fulfil') && next && (
            <Button onClick={advance} disabled={!!advanceBlock} title={advanceBlock ?? undefined}>
              {ORDER_ADVANCE_VERB[next]}
              <ArrowRight />
            </Button>
          )}
          <ActionMenu
            title={order.code}
            trigger={
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            }
            items={menu}
          />
        </div>
      </div>

      {can('order.fulfil') && next && advanceBlock && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot {ORDER_ADVANCE_VERB[next]?.toLowerCase()} yet:</span>{' '}
          {advanceBlock}
        </Card>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {order.code} · {fmtDateTime(order.createdAt)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{s.customerName(order.customerId)}</h1>
            <p className="mt-1 gap-x-2 text-sm flex flex-wrap items-center text-on-ink-muted">
              <span>{CHANNEL_LABEL[order.channel]}</span>
              <span>·</span>
              <span>{order.city}</span>
              {order.sellerId && (
                <>
                  <span>·</span>
                  <span>via {s.sellerName(order.sellerId)}</span>
                </>
              )}
            </p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <OrderStatusBadge status={order.status} className={ON_INK} />
            <PaymentBadge status={order.paymentStatus} className={ON_INK} />
          </div>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
          <HeroMetric label="Total" value={fmtIdr(order.total)} />
          <HeroMetric
            label="Items"
            value={fmtNumber(unitCount(order.lines))}
            unit={order.lines.length === 1 ? 'line' : `${order.lines.length} lines`}
          />
          <HeroMetric label="Points" value={fmtNumber(order.pointsEarned)} unit="earned" />
          <HeroMetric label="Customer orders" value={fmtNumber(metrics.orders)} unit="to date" />
        </div>
        {order.cancelReason && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Cancelled: {CANCEL_REASON_LABEL[order.cancelReason]}.
          </p>
        )}
        {order.refundedAmount > 0 && order.status !== 'cancelled' && (
          <p className="mt-4 rounded-2xl px-3 py-2 text-sm bg-accent/20">
            {fmtIdr(order.refundedAmount)} refunded to the customer.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <Steps steps={orderSteps(order)} />
      </Card>

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {order.lines.map((l) => {
                  const variant = s.maps.variant.get(l.variantId)
                  return (
                    <div key={l.variantId} className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <ProductLink productId={l.productId} />
                        <p className="mt-0.5 text-xs truncate text-muted">
                          {variant?.name} · <span className="font-mono">{variant?.sku}</span>
                        </p>
                      </div>
                      <p className="text-sm shrink-0 text-right tabular-nums">
                        <span className="text-muted">{l.qty} × </span>
                        {fmtIdr(l.price)}
                        <span className="font-semibold block">{fmtIdr(l.qty * l.price)}</span>
                      </p>
                    </div>
                  )
                })}
              </div>
              <dl className="mt-3 space-y-1.5 rounded-2xl px-4 py-3 text-sm bg-surface-2">
                <Row label="Subtotal" value={fmtIdr(order.subtotal)} />
                {order.discount > 0 && (
                  <Row
                    label={`Discount${order.voucherCode ? ` · ${order.voucherCode}` : ''}`}
                    value={`-${fmtIdr(order.discount)}`}
                  />
                )}
                <Row label="Shipping" value={order.shipping ? fmtIdr(order.shipping) : 'Free'} />
                <div className="gap-2 pt-2 flex items-center justify-between border-t border-border">
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-base font-bold tabular-nums">{fmtIdr(order.total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {order.events.map((e) => (
                <div key={e.id} className="gap-3 rounded-2xl px-3 py-2 flex items-start hover:bg-surface-2">
                  <span className="w-28 pt-0.5 text-xs shrink-0 text-muted tabular-nums">
                    {fmtWhen(e.at, now)}
                  </span>
                  <span className="min-w-0">
                    <span className="text-sm block">{e.note}</span>
                    <span className="block text-[0.6875rem] text-muted">{s.userName(e.by)}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 grid grid-cols-1 content-start">
          <SideCard
            title="Customer"
            action={
              customer && (
                <Link to={paths.customer(customer.id)} className="text-xs font-semibold hover:text-accent">
                  Customer 360
                </Link>
              )
            }
          >
            <KeyValue
              bare
              labelWidth="sm"
              items={[
                { label: 'Name', value: <CustomerLink customerId={order.customerId} showAvatar={false} /> },
                { label: 'Tier', value: customer ? <TierBadge tier={customer.tier} /> : 'None' },
                { label: 'Phone', value: customer?.phone ?? 'None' },
                { label: 'Lifetime', value: `${plural(metrics.orders, 'order')} · ${fmtIdr(metrics.spend)}` },
              ]}
            />
          </SideCard>
          <SideCard title="Fulfilment">
            <KeyValue
              bare
              labelWidth="sm"
              items={[
                { label: 'Warehouse', value: warehouse ? `${warehouse.name} · ${warehouse.city}` : 'None' },
                { label: 'Courier', value: COURIER_LABEL[order.courier] },
                {
                  label: 'Tracking',
                  value: order.trackingNo ? (
                    <span className="text-xs font-mono">{order.trackingNo}</span>
                  ) : (
                    'Not yet'
                  ),
                },
                { label: 'Ship to', value: order.city },
              ]}
            />
          </SideCard>
          <SideCard title="Payment">
            <KeyValue
              bare
              labelWidth="sm"
              items={[
                { label: 'Method', value: PAYMENT_METHOD_LABEL[order.paymentMethod] },
                { label: 'Status', value: <PaymentBadge status={order.paymentStatus} /> },
                {
                  label: 'Voucher',
                  value: order.voucherCode ? (
                    <span className="text-xs font-mono">{order.voucherCode}</span>
                  ) : (
                    'None'
                  ),
                },
                { label: 'Refunded', value: order.refundedAmount ? fmtIdr(order.refundedAmount) : 'None' },
              ]}
            />
          </SideCard>
          <SideCard title="Attribution">
            <KeyValue
              bare
              labelWidth="sm"
              items={[
                { label: 'Channel', value: CHANNEL_LABEL[order.channel] },
                { label: 'Seller', value: <SellerChip sellerId={order.sellerId} /> },
                {
                  label: 'Campaign',
                  value: campaign ? (
                    <Link to={paths.campaign(campaign.id)} className="hover:text-accent">
                      {campaign.name}
                    </Link>
                  ) : (
                    'None'
                  ),
                },
              ]}
            />
          </SideCard>
        </div>
      </div>

      <ShipDialog order={order} open={pending === 'ship'} onOpenChange={(o) => !o && setPending(null)} />
      <CancelOrderDialog
        order={order}
        open={pending === 'cancel'}
        onOpenChange={(o) => !o && setPending(null)}
      />
      <RefundDialog order={order} open={pending === 'refund'} onOpenChange={(o) => !o && setPending(null)} />
      <NoteDialog order={order} open={pending === 'note'} onOpenChange={(o) => !o && setPending(null)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="gap-2 flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function SideCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader action={action}>
        <Kicker className="font-bold text-[0.8125rem] tracking-[0.4px] text-foreground">{title}</Kicker>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
