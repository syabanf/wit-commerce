import { type SellerStats, fmtIdrShort, fmtNumber, sellerPerformance } from '@rc/fixtures'
import {
  SELLER_KIND_LABEL,
  SELLER_STATUS_LABEL,
  type Seller,
  type SellerKind,
  type SellerStatus,
} from '@rc/types'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  Chip,
  ChipRow,
  EmptyState,
  Input,
  PageHeader,
  SplitStats,
  StatCard,
  toast,
} from '@rc/ui'
import { Ban, MailPlus, Search, Store, UserPlus, UsersRound, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { SellerStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useHistoryState } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { InviteSellerDialog } from './InviteSellerDialog'
import { storeUrl } from './lib'

const KINDS = Object.keys(SELLER_KIND_LABEL) as SellerKind[]
const STATUSES = Object.keys(SELLER_STATUS_LABEL) as SellerStatus[]

export function SellersPage() {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('seller.manage')
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useHistoryState('query', '')
  const [kind, setKind] = useHistoryState<SellerKind | null>('kind', null)
  const [status, setStatus] = useHistoryState<SellerStatus | null>('status', null)
  const inviting = params.get('new') === '1' && canManage
  const setInviting = (open: boolean) =>
    setParams(
      (p) => {
        if (open) p.set('new', '1')
        else p.delete('new')
        return p
      },
      { replace: true },
    )

  const perf = useMemo(
    () => sellerPerformance(s.sellers, s.orders, s.traffic, s.leads, 30, now),
    [s.sellers, s.orders, s.traffic, s.leads, now],
  )

  const stats = useMemo(() => {
    const count = (st: SellerStatus) => s.sellers.filter((x) => x.status === st).length
    let revenue = 0
    for (const row of perf.values()) revenue += row.revenue
    return { active: count('active'), invited: count('invited'), suspended: count('suspended'), revenue }
  }, [s.sellers, perf])

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searched = s.sellers
    .filter((x) => {
      const text = `${x.name} ${x.code} ${x.slug} ${x.city} ${SELLER_KIND_LABEL[x.kind]}`.toLowerCase()
      return terms.every((t) => text.includes(t))
    })
    .sort(
      (a, b) =>
        (perf.get(b.id)?.revenue ?? 0) - (perf.get(a.id)?.revenue ?? 0) || a.name.localeCompare(b.name),
    )
  const inKind = (x: Seller) => !kind || x.kind === kind
  const inStatus = (x: Seller) => !status || x.status === status
  const visible = searched.filter((x) => inKind(x) && inStatus(x))

  const clear = () => {
    setQuery('')
    setKind(null)
    setStatus(null)
  }

  return (
    <>
      <PageHeader
        title="Sellers"
        description="Sales staff, agents, resellers and affiliates with a personal store, and what each store sold in the last 30 days."
        actions={
          <>
            <Input
              variant="pill"
              type="search"
              aria-label="Search sellers"
              leftIcon={<Search />}
              placeholder="Search name, city or store"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:w-72 w-full"
            />
            {canManage && (
              <Button onClick={() => setInviting(true)}>
                <UserPlus />
                Invite seller
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Active sellers"
            value={stats.active}
            unit={`of ${s.sellers.length}`}
            hint="Stores open to customers"
            icon={<UsersRound />}
            tone="success"
            onClick={() => setStatus('active')}
          />
          <StatCard
            label="Revenue via personal stores"
            value={fmtIdrShort(stats.revenue)}
            hint="Last 30 days"
            icon={<Wallet />}
            tone="ink"
            onClick={clear}
          />
          <StatCard
            label="Invited, waiting"
            value={stats.invited}
            hint={stats.invited ? 'Store not set up yet' : 'No open invites'}
            icon={<MailPlus />}
            tone={stats.invited ? 'info' : 'default'}
            onClick={() => setStatus('invited')}
          />
          <StatCard
            label="Suspended"
            value={stats.suspended}
            hint={stats.suspended ? 'Store offline, ref links paused' : 'None'}
            icon={<Ban />}
            tone={stats.suspended ? 'danger' : 'default'}
            onClick={() => setStatus('suspended')}
          />
        </div>

        <ChipRow className="md:flex-wrap max-w-full" role="group" aria-label="Filter sellers">
          <Chip
            variant="filter"
            active={!kind}
            count={searched.filter(inStatus).length}
            onClick={() => setKind(null)}
          >
            Every kind
          </Chip>
          {KINDS.map((k) => (
            <Chip
              key={k}
              variant="filter"
              active={kind === k}
              count={searched.filter((x) => x.kind === k && inStatus(x)).length}
              onClick={() => setKind(kind === k ? null : k)}
            >
              {SELLER_KIND_LABEL[k]}
            </Chip>
          ))}
          <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 self-center bg-border" />
          <Chip
            variant="filter"
            active={!status}
            count={searched.filter(inKind).length}
            onClick={() => setStatus(null)}
          >
            Any status
          </Chip>
          {STATUSES.map((st) => (
            <Chip
              key={st}
              variant="filter"
              active={status === st}
              count={searched.filter((x) => x.status === st && inKind(x)).length}
              onClick={() => setStatus(status === st ? null : st)}
            >
              {SELLER_STATUS_LABEL[st]}
            </Chip>
          ))}
        </ChipRow>

        {visible.length > 0 ? (
          <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
            {visible.map((seller) => (
              <SellerCard key={seller.id} seller={seller} stats={perf.get(seller.id)} />
            ))}
          </div>
        ) : (
          <Card>
            {s.sellers.length === 0 ? (
              <EmptyState
                icon={<Store />}
                title={`No sellers at ${s.tenant.name} yet`}
                description="Invite your sales team, agents or resellers. Each gets a personal store on your domain that keeps your brand."
                action={
                  canManage ? (
                    <Button onClick={() => setInviting(true)}>
                      <UserPlus />
                      Invite seller
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                icon={<Search />}
                title={terms.length ? `No sellers match "${query.trim()}"` : 'No sellers match these filters'}
                description="Search by name, city or store address, or clear the filters to see everyone."
                action={
                  <Button variant="outline" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            )}
          </Card>
        )}
      </div>

      <InviteSellerDialog
        open={inviting}
        onOpenChange={setInviting}
        onSaved={(seller) => {
          toast(`Invite sent to ${seller.name}`, {
            tone: 'success',
            description: `${seller.code} · ${storeUrl(s.tenant, seller)}`,
          })
          navigate(paths.seller(seller.id), { replace: true })
        }}
      />
    </>
  )
}

function SellerCard({ seller, stats }: { seller: Seller; stats: SellerStats | undefined }) {
  const { tenant, maps } = useScoped()
  return (
    <Card className="relative flex flex-col transition-colors hover:bg-surface-2">
      <CardContent className="pt-5 flex flex-1 flex-col">
        <div className="gap-3 flex items-start">
          <Avatar name={seller.name} color={seller.color} size="lg" />
          <div className="min-w-0 flex-1">
            <Link
              to={paths.seller(seller.id)}
              className="text-base font-semibold leading-tight after:inset-0 block truncate after:absolute after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
            >
              {seller.name}
            </Link>
            <p className="mt-0.5 text-sm truncate text-muted">
              {seller.code} · {seller.city}
            </p>
          </div>
          <SellerStatusBadge status={seller.status} />
        </div>
        <div className="mt-3 gap-1.5 flex flex-wrap items-center">
          <Badge>{SELLER_KIND_LABEL[seller.kind]}</Badge>
          <Badge variant="outline">{maps.template.get(seller.templateId)?.name ?? 'No template'}</Badge>
        </div>
        <p className="mt-3 text-xs truncate font-mono text-muted">{storeUrl(tenant, seller)}</p>
        <SplitStats
          className="mt-5"
          items={[
            { label: 'Visitors 30d', value: fmtNumber(stats?.visitors ?? 0) },
            { label: 'Orders 30d', value: fmtNumber(stats?.orders ?? 0) },
            { label: 'Revenue 30d', value: fmtIdrShort(stats?.revenue ?? 0) },
          ]}
        />
      </CardContent>
    </Card>
  )
}
