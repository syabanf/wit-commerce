import {
  fmtDateTime,
  fmtIdr,
  fmtNumber,
  fmtWhen,
  isOpenReturn,
  returnCancelBlocker,
  returnRefundBlocker,
  returnRefundCap,
} from '@rc/fixtures'
import type { OrderReturn, ReturnStatus } from '@rc/types'
import { RETURN_REASON_LABEL, RETURN_STATUS_FLOW, RETURN_STATUS_LABEL } from '@rc/types'
import {
  ActionMenu,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Steps,
  type StepsProps,
  toast,
} from '@rc/ui'
import { ArrowRight, Ban, MoreHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { HeroMetric } from '../../components/HeroMetric'
import { ON_INK, ReturnStatusBadge } from '../../components/badges'
import { CustomerLink, OrderLink, ProductLink, paths } from '../../components/links'
import { HTTP, api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'
import { useFullOrder } from '../../state/useFullOrder'
import { ReceiveReturnDialog, RefundReturnDialog, RejectReturnDialog } from './dialogs'

type Pending = 'reject' | 'receive' | 'refund' | null

/** The return from the state, or read by id when the state no longer lists it (closed, with the API). */
function useReturn(id: string | undefined) {
  const s = useScoped()
  const listed = s.returns.find((r) => r.id === id)
  const [read, setRead] = useState<{ id: string; ret: OrderReturn | null } | null>(null)
  useEffect(() => {
    if (!HTTP || !id || listed) return
    let cancelled = false
    api.returns
      .get(id, s.tenant.id)
      .then((ret) => !cancelled && setRead({ id, ret }))
      .catch(() => !cancelled && setRead({ id, ret: null }))
    return () => {
      cancelled = true
    }
  }, [id, listed, s.tenant.id])
  if (listed) return { ret: listed, loading: false }
  const mine = read?.id === id ? read : null
  return { ret: mine?.ret ?? undefined, loading: HTTP && !mine }
}

function returnSteps(ret: OrderReturn): StepsProps['steps'] {
  const reachedAt = new Map<ReturnStatus, string>()
  for (const e of ret.events) if (e.status && !reachedAt.has(e.status)) reachedAt.set(e.status, e.at)
  const ended = ret.status === 'rejected' || ret.status === 'cancelled'
  const current = RETURN_STATUS_FLOW.indexOf(ret.status)
  const steps: StepsProps['steps'] = RETURN_STATUS_FLOW.map((status, i) => {
    const at = reachedAt.get(status)
    const state = ended
      ? at
        ? 'done'
        : 'skipped'
      : i < current
        ? 'done'
        : i === current
          ? 'current'
          : 'upcoming'
    return { key: status, label: RETURN_STATUS_LABEL[status], state, hint: at ? fmtWhen(at) : undefined }
  })
  if (ended) {
    const at = reachedAt.get(ret.status)
    steps.push({
      key: ret.status,
      label: RETURN_STATUS_LABEL[ret.status],
      state: 'current',
      hint: at ? fmtWhen(at) : undefined,
    })
  }
  return steps
}

export function ReturnDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const now = useNow(60_000)
  const [pending, setPending] = useState<Pending>(null)
  const { ret, loading } = useReturn(id)
  const { order } = useFullOrder(
    ret?.orderId,
    s.orders.find((o) => o.id === ret?.orderId),
    s.tenant.id,
  )

  if (!ret) {
    return (
      <Card>
        <EmptyState
          title={loading ? 'Loading return' : 'Return not found'}
          description={loading ? 'Reading the return from the server.' : 'It may belong to another brand.'}
          action={loading ? undefined : <BackButton fallback={paths.returns} />}
        />
      </Card>
    )
  }

  const refunder = can('order.refund')
  const starter = can('order.fulfil') || can('ticket.manage')
  const units = ret.items.reduce((n, i) => n + i.qty, 0)
  const cap = order ? returnRefundCap(order, ret) : 0
  const refundBlock = order ? returnRefundBlocker(ret, order) : 'Loading the order.'
  const cancelBlock = returnCancelBlocker(ret)
  const linePrice = (variantId: string) => order?.lines.find((l) => l.variantId === variantId)?.price ?? 0

  const approve = () => {
    s.dispatch({ type: 'returns/approve', id: ret.id, note: '' })
    toast(`${ret.code} approved`, { tone: 'success', description: 'The shopper can send the items back.' })
  }
  // The next step is the primary button; each needs order.refund.
  const next =
    ret.status === 'requested'
      ? { label: 'Approve return', run: approve, block: null }
      : ret.status === 'approved'
        ? { label: 'Mark received', run: () => setPending('receive'), block: null }
        : ret.status === 'received'
          ? { label: 'Refund', run: () => setPending('refund'), block: refundBlock }
          : null

  const menu = [
    ...(refunder && ret.status === 'requested'
      ? [
          {
            key: 'reject',
            label: 'Reject return',
            description: 'Tell the shopper why',
            icon: <X />,
            onSelect: () => setPending('reject'),
          },
        ]
      : []),
    ...(starter && !cancelBlock
      ? [
          {
            key: 'cancel',
            label: 'Cancel return',
            description: 'The shopper keeps the items',
            icon: <Ban />,
            destructive: true,
            onSelect: () => {
              s.dispatch({ type: 'returns/cancel', id: ret.id, note: '' })
              toast(`${ret.code} cancelled`, { description: 'The items can be returned again later.' })
            },
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={paths.returns} />
        <div className="gap-2 flex flex-wrap items-center">
          {refunder && next && (
            <Button onClick={next.run} disabled={!!next.block} title={next.block ?? undefined}>
              {next.label}
              <ArrowRight />
            </Button>
          )}
          {menu.length > 0 && (
            <ActionMenu
              title={ret.code}
              trigger={
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              }
              items={menu}
            />
          )}
        </div>
      </div>

      {refunder && next?.block && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot refund yet:</span> {next.block}
        </Card>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {ret.code} · {fmtDateTime(ret.createdAt)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{s.customerName(ret.customerId)}</h1>
            <p className="mt-1 text-sm text-on-ink-muted">
              {RETURN_REASON_LABEL[ret.reason]} · asked by{' '}
              {ret.requestedBy === 'shopper' ? 'the shopper' : 'staff'}
            </p>
          </div>
          <ReturnStatusBadge status={ret.status} className={ON_INK} />
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
          <HeroMetric
            label="Units"
            value={fmtNumber(units)}
            unit={ret.items.length === 1 ? 'item' : `${ret.items.length} items`}
          />
          <HeroMetric label="Refunded" value={ret.refundAmount ? fmtIdr(ret.refundAmount) : 'None yet'} />
          <HeroMetric
            label="Can refund"
            value={ret.status === 'refunded' || !isOpenReturn(ret) ? 'None' : order ? fmtIdr(cap) : '…'}
          />
          <HeroMetric
            label="Restocked"
            value={
              ret.status === 'received' || ret.status === 'refunded'
                ? ret.restock
                  ? 'Yes'
                  : 'No'
                : 'Not yet'
            }
          />
        </div>
        {ret.rejectReason && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">Rejected: {ret.rejectReason}</p>
        )}
      </Card>

      <Card className="p-5">
        <Steps steps={returnSteps(ret)} />
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ret.items.map((item) => (
              <div key={item.variantId} className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2">
                <div className="min-w-0 flex-1">
                  <ProductLink productId={item.productId} />
                  <p className="mt-0.5 text-xs truncate text-muted">
                    {s.maps.variant.get(item.variantId)?.name} · {RETURN_REASON_LABEL[item.reason]}
                  </p>
                </div>
                <p className="text-sm shrink-0 text-right tabular-nums">
                  <span className="text-muted">{item.qty} × </span>
                  {fmtIdr(linePrice(item.variantId))}
                </p>
              </div>
            ))}
            {ret.note && (
              <p className="rounded-2xl px-3 py-2 text-sm bg-surface-2">&ldquo;{ret.note}&rdquo;</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Order and customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="gap-2 flex flex-wrap items-center justify-between">
              <span className="text-muted">Order</span>
              <OrderLink orderId={ret.orderId} />
            </p>
            <div className="gap-2 flex flex-wrap items-center justify-between">
              <span className="text-muted">Customer</span>
              <CustomerLink customerId={ret.customerId} />
            </div>
            {order && (
              <>
                <p className="gap-2 flex flex-wrap items-center justify-between">
                  <span className="text-muted">Order total</span>
                  <span className="tabular-nums">{fmtIdr(order.total)}</span>
                </p>
                <p className="gap-2 flex flex-wrap items-center justify-between">
                  <span className="text-muted">Refunded on the order</span>
                  <span className="tabular-nums">
                    {order.refundedAmount ? fmtIdr(order.refundedAmount) : 'None'}
                  </span>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {ret.events.map((e) => (
            <div key={e.id} className="gap-3 rounded-2xl px-3 py-2 flex items-start hover:bg-surface-2">
              <span className="w-28 pt-0.5 text-xs shrink-0 text-muted tabular-nums">
                {fmtWhen(e.at, now)}
              </span>
              <span className="min-w-0">
                <span className="text-sm block">{e.note}</span>
                <span className="block text-[0.6875rem] text-muted">
                  {e.by === 'storefront' ? 'The shopper' : s.userName(e.by)}
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <RejectReturnDialog
        ret={ret}
        open={pending === 'reject'}
        onOpenChange={(o) => !o && setPending(null)}
      />
      <ReceiveReturnDialog
        ret={ret}
        open={pending === 'receive'}
        onOpenChange={(o) => !o && setPending(null)}
      />
      {order && (
        <RefundReturnDialog
          ret={ret}
          order={order}
          open={pending === 'refund'}
          onOpenChange={(o) => !o && setPending(null)}
        />
      )}
    </div>
  )
}
