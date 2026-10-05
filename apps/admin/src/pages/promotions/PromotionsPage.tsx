import { DAY, describePromotion, fmtDate, fmtDateShort, fmtIdrShort, fmtNumber, toMs } from '@rc/fixtures'
import {
  PROMOTION_KIND_LABEL,
  PROMOTION_STATUS_LABEL,
  type Promotion,
  type PromotionKind,
  type PromotionStatus,
  type PromotionTrigger,
} from '@rc/types'
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  ProgressBar,
  StatCard,
  toast,
} from '@rc/ui'
import { Hourglass, Plus, Search, Sparkles, Ticket, TicketPercent, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { PromotionStatusBadge } from '../../components/badges'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { PromotionDialog } from './PromotionDialog'
import { KIND_CHIP, activateBlocker, onStatus, promotionScope } from './lib'

const STATUSES = Object.keys(PROMOTION_STATUS_LABEL) as PromotionStatus[]
const KINDS = Object.keys(PROMOTION_KIND_LABEL) as PromotionKind[]

/** Status filter plus the "expiring in 7 days" tile, which is not a status. */
type StatusFilter = PromotionStatus | 'expiring' | null

export function PromotionsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('promotion.manage')
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [status, setStatus] = useHistoryState<StatusFilter>('status', null)
  const [kind, setKind] = useHistoryState<PromotionKind | null>('kind', null)
  const [trigger, setTrigger] = useHistoryState<PromotionTrigger | null>('trigger', null)
  const table = useTableHistory()

  const openId = params.get('id')
  const creating = params.get('new') === '1' && canManage
  const open = openId ? s.promotions.find((p) => p.id === openId) : undefined
  const setDialog = (next: { id: string } | 'new' | null) =>
    setParams(
      (p) => {
        p.delete('id')
        p.delete('new')
        if (next === 'new') p.set('new', '1')
        else if (next) p.set('id', next.id)
        return p
      },
      { replace: true },
    )

  const expiring = (p: Promotion) =>
    p.status === 'active' && toMs(p.endAt) >= now && toMs(p.endAt) - now <= 7 * DAY
  const matchStatus = (p: Promotion) => !status || (status === 'expiring' ? expiring(p) : p.status === status)
  const matchKind = (p: Promotion) => !kind || p.kind === kind
  const matchTrigger = (p: Promotion) => !trigger || p.trigger === trigger
  const paymentName = (id: string) => s.maps.paymentType.get(id)?.name ?? 'a removed payment type'
  const names = {
    categoryName: s.categoryName,
    productName: s.productName,
    segmentName: s.segmentName,
    sellerName: s.sellerName,
    paymentName,
  }
  const offer = (p: Promotion) => describePromotion(p, paymentName)

  const stats = useMemo(() => {
    const active = s.promotions.filter((p) => p.status === 'active')
    return {
      active: active.length,
      scheduled: s.promotions.filter((p) => p.status === 'scheduled').length,
      automatic: active.filter((p) => p.trigger === 'automatic').length,
      used: s.promotions.reduce((n, p) => n + p.used, 0),
      revenue: s.promotions.reduce((n, p) => n + p.revenue, 0),
      expiring: active.filter((p) => toMs(p.endAt) >= now && toMs(p.endAt) - now <= 7 * DAY).length,
    }
  }, [s.promotions, now])

  const terms = query.trim().toLowerCase()
  const searched = s.promotions.filter(
    (p) =>
      !terms || `${p.code} ${p.name} ${offer(p)} ${promotionScope(p, names)}`.toLowerCase().includes(terms),
  )
  const rows = searched.filter((p) => matchStatus(p) && matchKind(p) && matchTrigger(p))

  const toggle = (p: Promotion) => {
    const on = p.status === 'paused' || p.status === 'draft'
    const next = on ? onStatus(p, now) : 'paused'
    s.dispatch({ type: 'promotions/setStatus', id: p.id, status: next })
    toast(on ? (next === 'scheduled' ? 'Promotion scheduled' : 'Promotion activated') : 'Promotion paused', {
      tone: on ? 'success' : 'default',
      description: `${p.name} · ${
        on
          ? next === 'scheduled'
            ? `starts ${fmtDate(p.startAt)}`
            : 'shoppers can use it now'
          : p.trigger === 'code'
            ? 'checkout no longer accepts the code'
            : 'the cart no longer applies it'
      }`,
    })
  }

  const columns: Column<Promotion>[] = [
    {
      id: 'code',
      header: 'Promotion',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          {p.trigger === 'code' ? (
            <p className="text-xs font-semibold font-mono">{p.code}</p>
          ) : (
            <p className="text-xs font-semibold text-muted">Automatic</p>
          )}
          <p className="text-sm truncate">{p.name}</p>
          <p className="mt-0.5 md:hidden text-[0.6875rem] text-muted">{offer(p)}</p>
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap">
            <PromotionStatusBadge status={p.status} />
          </div>
        </div>
      ),
    },
    {
      id: 'value',
      header: 'Offer',
      hideBelow: 'md',
      sortValue: (p) => p.kind,
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium">{offer(p)}</p>
          <p className="text-[0.6875rem] text-muted">{PROMOTION_KIND_LABEL[p.kind]}</p>
        </div>
      ),
    },
    {
      id: 'scope',
      header: 'For',
      hideBelow: 'xl',
      sortValue: (p) => promotionScope(p, names),
      cell: (p) => <span className="text-sm">{promotionScope(p, names)}</span>,
    },
    {
      id: 'window',
      header: 'Window',
      hideBelow: 'lg',
      sortValue: (p) => toMs(p.endAt),
      cell: (p) => (
        <span className={expiring(p) ? 'font-semibold whitespace-nowrap text-warning' : 'whitespace-nowrap'}>
          {fmtDateShort(p.startAt)} → {fmtDate(p.endAt)}
        </span>
      ),
    },
    {
      id: 'usage',
      header: 'Usage',
      hideBelow: 'lg',
      sortValue: (p) => p.used,
      cell: (p) =>
        p.usageLimit ? (
          <div className="w-32">
            <p className="text-xs tabular-nums">
              {fmtNumber(p.used)} <span className="text-muted">of {fmtNumber(p.usageLimit)}</span>
            </p>
            <ProgressBar
              className="mt-1"
              value={p.used / p.usageLimit}
              tone={p.used >= p.usageLimit ? 'warning' : 'ink'}
              aria-label={`${p.used} of ${p.usageLimit} used`}
            />
          </div>
        ) : (
          <span className="text-sm whitespace-nowrap tabular-nums">{fmtNumber(p.used)} used</span>
        ),
    },
    {
      id: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortValue: (p) => p.revenue,
      cell: (p) => (
        <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdrShort(p.revenue)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (p) => STATUSES.indexOf(p.status),
      cell: (p) => <PromotionStatusBadge status={p.status} />,
    },
    ...(canManage
      ? [
          {
            id: 'action',
            header: <span className="sr-only">Action</span>,
            align: 'right' as const,
            hideBelow: 'md' as const,
            cell: (p: Promotion) => {
              if (p.status === 'expired') return null
              const on = p.status === 'paused' || p.status === 'draft'
              const blocker = on ? activateBlocker(p, now) : null
              return (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!blocker}
                  title={blocker ?? undefined}
                  onClick={() => toggle(p)}
                >
                  {on ? 'Activate' : 'Pause'}
                </Button>
              )
            },
          },
        ]
      : []),
  ]

  const filtered = !!status || !!kind || !!trigger || !!terms
  const clear = () => {
    setQuery('')
    setStatus(null)
    setKind(null)
    setTrigger(null)
  }

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Voucher codes, automatic discounts and personal-store offers, with what each one has redeemed and sold."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search promotions"
              leftIcon={<Search />}
              placeholder="Search code or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 sm:w-72 sm:flex-none flex-1"
            />
            {canManage && (
              <Button onClick={() => setDialog('new')}>
                <Plus />
                New promotion
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        {openId && !open && (
          <Banner
            tone="warning"
            title="Promotion not found"
            action={
              <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                Show all promotions
              </Button>
            }
          >
            It may have been removed or belongs to another brand.
          </Banner>
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-5 grid grid-cols-2">
          <StatCard
            label="Active"
            value={stats.active}
            hint={stats.scheduled ? `${stats.scheduled} more scheduled` : 'Nothing scheduled'}
            icon={<TicketPercent />}
            tone="success"
            onClick={() => setStatus('active')}
          />
          <StatCard
            label="Automatic offers"
            value={stats.automatic}
            hint="Active, applied in the cart"
            icon={<Sparkles />}
            tone="default"
            onClick={() => {
              setStatus('active')
              setTrigger('automatic')
            }}
          />
          <StatCard
            label="Redemptions"
            value={fmtNumber(stats.used)}
            hint="All promotions, all time"
            icon={<Ticket />}
            tone="info"
            onClick={clear}
          />
          <StatCard
            label="Revenue with an offer"
            value={fmtIdrShort(stats.revenue)}
            hint="Orders that used a promotion"
            icon={<Wallet />}
            tone="ink"
            onClick={clear}
          />
          <StatCard
            label="Expiring in 7 days"
            value={stats.expiring}
            hint={stats.expiring ? 'Extend or let them end' : 'None ending this week'}
            icon={<Hourglass />}
            tone={stats.expiring ? 'warning' : 'default'}
            className="xl:col-span-1 col-span-2"
            onClick={() => setStatus('expiring')}
          />
        </div>
        <ChipRow className="md:flex-wrap max-w-full" role="group" aria-label="Filter promotions">
          <Chip
            variant="filter"
            active={!status}
            count={searched.filter((p) => matchKind(p) && matchTrigger(p)).length}
            onClick={() => setStatus(null)}
          >
            Any status
          </Chip>
          {status === 'expiring' && (
            <Chip
              variant="filter"
              active
              count={searched.filter((p) => expiring(p) && matchKind(p) && matchTrigger(p)).length}
              onClick={() => setStatus(null)}
            >
              Expiring in 7 days
            </Chip>
          )}
          {STATUSES.map((st) => {
            const count = searched.filter((p) => p.status === st && matchKind(p) && matchTrigger(p)).length
            if (!count && status !== st) return null
            return (
              <Chip
                key={st}
                variant="filter"
                active={status === st}
                count={count}
                onClick={() => setStatus(status === st ? null : st)}
              >
                {PROMOTION_STATUS_LABEL[st]}
              </Chip>
            )
          })}
          <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 self-center bg-border" />
          <Chip
            variant="filter"
            active={!kind}
            count={searched.filter((p) => matchStatus(p) && matchTrigger(p)).length}
            onClick={() => setKind(null)}
          >
            Any kind
          </Chip>
          {KINDS.map((k) => (
            <Chip
              key={k}
              variant="filter"
              active={kind === k}
              count={searched.filter((p) => p.kind === k && matchStatus(p) && matchTrigger(p)).length}
              onClick={() => setKind(kind === k ? null : k)}
            >
              {KIND_CHIP[k]}
            </Chip>
          ))}
          <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 self-center bg-border" />
          {(['automatic', 'code'] as const).map((t) => (
            <Chip
              key={t}
              variant="filter"
              active={trigger === t}
              count={searched.filter((p) => p.trigger === t && matchStatus(p) && matchKind(p)).length}
              onClick={() => setTrigger(trigger === t ? null : t)}
            >
              {t === 'automatic' ? 'Automatic' : 'With a code'}
            </Chip>
          ))}
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          onRowClick={(p) => setDialog({ id: p.id })}
          resetPageKey={`${query}|${status}|${kind}|${trigger}`}
          initialSort={{ id: 'window', desc: true }}
          rowClassName={(p) => (p.id === openId ? 'bg-surface-2' : undefined)}
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No promotions match"
                description="Clear the search and filters to see every promotion."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No promotions yet"
                description="Create an automatic offer or a voucher code, then attach it to a campaign or a personal store."
              />
            )
          }
          {...table}
        />
      </div>

      <PromotionDialog
        open={creating || !!open}
        onOpenChange={(o) => !o && setDialog(null)}
        editing={creating ? null : (open ?? null)}
        readOnly={!creating && !canManage}
      />
    </>
  )
}
