import { describePromotion, fmtIdr, paymentFee, paymentTypeDisableBlocker } from '@rc/fixtures'
import { PAYMENT_METHOD_LABEL, type PaymentType } from '@rc/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  Switch,
  toast,
} from '@rc/ui'
import { ArrowDown, ArrowUp, CreditCard, Landmark, Pencil, Plus, Receipt, TicketPercent } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { PromotionStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { PaymentTypeDialog } from './PaymentTypeDialog'
import { SAMPLE_ORDER, feeLabel, limitsLabel } from './lib'

export function PaymentTypesPage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('integration.manage')
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<PaymentType | null>(null)
  const [dialogOpen, setDialogOpen] = useState(params.get('new') === '1' && manage)
  const table = useTableHistory()

  const types = s.paymentTypes
  const paymentName = (id: string) => s.maps.paymentType.get(id)?.name ?? 'a removed payment type'
  const offers = useMemo(
    () => s.promotions.filter((p) => p.paymentTypeIds.length > 0 && p.status !== 'expired'),
    [s.promotions],
  )
  const offerCount = (id: string) => offers.filter((p) => p.paymentTypeIds.includes(id)).length

  const stats = useMemo(() => {
    const on = types.filter((t) => t.enabled)
    const providers = [...new Set(on.map((t) => t.provider))]
    const fees = on.map((t) => paymentFee(t, SAMPLE_ORDER))
    const cheapest = on.reduce<PaymentType | null>(
      (best, t) => (!best || paymentFee(t, SAMPLE_ORDER) < paymentFee(best, SAMPLE_ORDER) ? t : best),
      null,
    )
    return {
      on: on.length,
      providers,
      averageFee: fees.length ? fees.reduce((a, b) => a + b, 0) / fees.length : 0,
      cheapest,
    }
  }, [types])

  const openDialog = (t: PaymentType | null) => {
    setEditing(t)
    setDialogOpen(true)
  }
  const closeDialog = (open: boolean) => {
    setDialogOpen(open)
    if (!open && params.has('new')) setParams((p) => (p.delete('new'), p), { replace: true })
  }

  const toggle = (t: PaymentType) => {
    s.dispatch({ type: 'paymentTypes/toggle', id: t.id })
    toast(t.enabled ? 'Payment type turned off' : 'Payment type turned on', {
      tone: t.enabled ? 'default' : 'success',
      description: `${t.name} · ${t.enabled ? 'shoppers no longer see it at checkout' : 'shoppers can pick it at checkout'}`,
    })
  }

  // Swap with the neighbour, then write back every position that changed (two saves for a swap).
  const move = (index: number, by: -1 | 1) => {
    const order = [...types]
    const a = order[index]
    const b = order[index + by]
    if (!a || !b) return
    order[index] = b
    order[index + by] = a
    order.forEach((t, sort) => {
      if (t.sort !== sort) s.dispatch({ type: 'paymentTypes/save', paymentType: { ...t, sort } })
    })
    toast('Checkout order changed', {
      tone: 'success',
      description: `${a.name} is now number ${index + by + 1} at checkout.`,
    })
  }

  const columns: Column<PaymentType>[] = [
    ...(manage
      ? [
          {
            id: '_order',
            header: <span className="sr-only">Order</span>,
            width: '5rem',
            cell: (t: PaymentType) => {
              const i = types.indexOf(t)
              return (
                <div className="gap-0.5 flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${t.name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${t.name} down`}
                    disabled={i === types.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              )
            },
          } satisfies Column<PaymentType>,
        ]
      : []),
    {
      id: 'name',
      header: 'Payment type',
      cell: (t) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{t.name}</p>
          <p className="text-xs truncate text-muted">
            {PAYMENT_METHOD_LABEL[t.method]}
            <span className="md:hidden"> · {t.provider}</span>
          </p>
          <p className="mt-1 leading-4 lg:hidden text-[11px] text-muted tabular-nums">
            {feeLabel(t)} · {limitsLabel(t)}
          </p>
        </div>
      ),
    },
    {
      id: 'provider',
      header: 'Provider',
      hideBelow: 'md',
      cell: (t) => <span className="text-sm">{t.provider}</span>,
    },
    {
      id: 'fee',
      header: 'Fee',
      hideBelow: 'lg',
      cell: (t) => <span className="text-sm whitespace-nowrap tabular-nums">{feeLabel(t)}</span>,
    },
    {
      id: 'limits',
      header: 'Order limits',
      hideBelow: 'lg',
      cell: (t) => <span className="text-sm whitespace-nowrap tabular-nums">{limitsLabel(t)}</span>,
    },
    {
      id: 'offers',
      header: 'Offers',
      align: 'right',
      hideBelow: 'xl',
      cell: (t) => {
        const n = offerCount(t.id)
        return n ? <span className="tabular-nums">{n}</span> : <span className="text-muted">–</span>
      },
    },
    {
      id: 'enabled',
      header: 'On',
      cell: (t) => {
        const blocker = t.enabled ? paymentTypeDisableBlocker(t, types) : null
        return manage ? (
          <span title={blocker ?? undefined} className="inline-flex">
            <Switch
              checked={t.enabled}
              disabled={!!blocker}
              aria-label={`${t.name} on at checkout`}
              onCheckedChange={() => toggle(t)}
            />
          </span>
        ) : (
          <span className="text-sm text-muted">{t.enabled ? 'On' : 'Off'}</span>
        )
      },
    },
    ...(manage
      ? [
          {
            id: '_actions',
            header: '',
            width: '3rem',
            cell: (t: PaymentType) => (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => openDialog(t)}
                >
                  <Pencil />
                </Button>
              </div>
            ),
          } satisfies Column<PaymentType>,
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Payment types"
        description="The ways shoppers can pay at checkout, with each gateway's fee and limits."
        actions={
          manage && (
            <Button onClick={() => openDialog(null)}>
              <Plus />
              New payment type
            </Button>
          )
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="On at checkout"
            value={stats.on}
            unit={`of ${types.length}`}
            hint={
              stats.on === types.length
                ? 'Every payment type is on'
                : `${types.length - stats.on} switched off`
            }
            icon={<CreditCard />}
            tone="ink"
          />
          <StatCard
            label="Gateways"
            value={stats.providers.length}
            hint={stats.providers.join(', ') || 'None on'}
            icon={<Landmark />}
            tone="info"
          />
          <StatCard
            label={`Average fee on a ${fmtIdr(SAMPLE_ORDER)} order`}
            value={fmtIdr(stats.averageFee)}
            hint={
              stats.cheapest
                ? `Cheapest: ${stats.cheapest.name} at ${fmtIdr(paymentFee(stats.cheapest, SAMPLE_ORDER))}`
                : 'No payment type is on'
            }
            icon={<Receipt />}
            tone="default"
          />
          <StatCard
            label="Offers tied to a payment type"
            value={offers.length}
            hint={offers.length ? 'Listed under the table' : 'No payment offers running'}
            icon={<TicketPercent />}
            tone={offers.length ? 'success' : 'default'}
          />
        </div>
        <DataTable
          columns={columns}
          rows={types}
          getRowKey={(t) => t.id}
          onRowClick={manage ? openDialog : undefined}
          pageSize={0}
          empty={
            <EmptyState
              compact
              title="No payment types yet"
              description="Add at least one so shoppers can check out."
            />
          }
          {...table}
        />
        <p className="text-xs text-muted">
          Shoppers see the payment types in this order. Use the arrows to move one up or down.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Offers by payment type</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Promotions that apply only when the shopper pays with a given payment type.
            </p>
          </CardHeader>
          <CardContent>
            {offers.length ? (
              <div className="space-y-2">
                {offers.map((p) => (
                  <Link
                    key={p.id}
                    to={paths.promotion(p.id)}
                    className="gap-3 rounded-2xl p-3 flex flex-wrap items-center justify-between bg-surface-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium block truncate">{p.name}</span>
                      <span className="text-xs block text-muted">{describePromotion(p, paymentName)}</span>
                    </span>
                    <PromotionStatusBadge status={p.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="No payment offers"
                description='Create a promotion and choose payment types under "Only when paying with" to reward them here.'
              />
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentTypeDialog
        open={dialogOpen}
        onOpenChange={closeDialog}
        editing={editing}
        onSaved={(t) =>
          toast(editing ? 'Payment type saved' : 'Payment type created', {
            tone: 'success',
            description: `${t.name} · ${t.provider} · ${feeLabel(t)}`,
          })
        }
      />
    </>
  )
}
