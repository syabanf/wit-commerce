import { DAY, fmtIdrShort, fmtNumber, isSold, nowMs, startOfDay, toMs } from '@rc/fixtures'
import { INDUSTRY_LABEL, TENANT_PLAN_LABEL, type Tenant } from '@rc/types'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, StatCard, toast } from '@rc/ui'
import { Building2, Globe, Plus, Rocket, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { useStore } from '../../state/store'
import { ONBOARDING_STEPS, isLive, remainingSteps, storeHost } from './lib'

interface TenantStats {
  revenue: number
  customers: number
}

export function TenantsPage() {
  const { state } = useStore()
  const { can, tenants: ownTenants, tenant: current, switchTenant } = useAuth()
  const navigate = useNavigate()
  const admin = can('tenant.manage')
  const tenants = admin ? state.tenants : ownTenants

  const stats = useMemo(() => {
    const from = startOfDay(nowMs()) + DAY - 30 * DAY
    const map = new Map<string, TenantStats>(state.tenants.map((t) => [t.id, { revenue: 0, customers: 0 }]))
    for (const o of state.orders) {
      if (!isSold(o) || toMs(o.createdAt) < from) continue
      const row = map.get(o.tenantId)
      if (row) row.revenue += o.total - o.refundedAmount
    }
    for (const c of state.customers) {
      const row = map.get(c.tenantId)
      if (row) row.customers += 1
    }
    return map
  }, [state.tenants, state.orders, state.customers])

  const live = tenants.filter(isLive).length
  const inProgress = tenants.filter((t) => t.onboarding.length < ONBOARDING_STEPS.length).length
  const gmv = tenants.reduce((n, t) => n + (stats.get(t.id)?.revenue ?? 0), 0)

  const open = (t: Tenant) => {
    switchTenant(t.id)
    toast('Switched brand', { description: `${t.name} is open in the console.` })
    navigate('/')
  }

  return (
    <>
      <PageHeader
        title="Tenants"
        description={
          admin
            ? 'Every brand on the platform, how far each is through setup and what it sold in the last 30 days.'
            : 'The brands you can open, how far each is through setup and what it sold in the last 30 days.'
        }
        actions={
          admin && (
            <Button asChild>
              <Link to={paths.newTenant}>
                <Plus />
                New tenant
              </Link>
            </Button>
          )
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Tenants"
            value={fmtNumber(tenants.length)}
            hint={admin ? 'On the platform' : 'You can open'}
            icon={<Building2 />}
            tone="ink"
          />
          <StatCard
            label="Live stores"
            value={fmtNumber(live)}
            hint="Published or on a verified domain"
            icon={<Globe />}
            tone="success"
          />
          <StatCard
            label="Onboarding in progress"
            value={fmtNumber(inProgress)}
            hint="Setup steps still open"
            icon={<Rocket />}
            tone={inProgress ? 'warning' : 'default'}
          />
          <StatCard
            label="GMV, last 30 days"
            value={fmtIdrShort(gmv)}
            hint="Paid orders net of refunds"
            icon={<Wallet />}
            tone="info"
          />
        </div>

        {tenants.length ? (
          <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
            {tenants.map((t) => {
              const done = ONBOARDING_STEPS.filter((s) => t.onboarding.includes(s.key)).length
              const remaining = remainingSteps(t)
              const row = stats.get(t.id) ?? { revenue: 0, customers: 0 }
              return (
                <Card key={t.id} className="p-5 flex flex-col">
                  <div className="gap-3 flex items-start justify-between">
                    <div className="min-w-0 gap-3 flex items-center">
                      {/* Tenant brand colour: storefront data, so an inline style. */}
                      <span
                        aria-hidden="true"
                        className="size-[2.625rem] shrink-0 rounded-[13px]"
                        style={{ background: t.brand.colors.primary }}
                      />
                      <div className="min-w-0">
                        <h2 className="font-semibold leading-tight truncate">{t.name}</h2>
                        <p className="text-xs truncate text-muted">{INDUSTRY_LABEL[t.industry]}</p>
                      </div>
                    </div>
                    <Badge variant={t.plan === 'enterprise' ? 'ink' : 'outline'}>
                      {TENANT_PLAN_LABEL[t.plan]}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs truncate font-mono text-muted" title={storeHost(t)}>
                    {storeHost(t)}
                    {t.domain && !t.domainVerified && ' · not verified'}
                  </p>
                  <div className="mt-4">
                    <div className="mb-1.5 gap-2 text-xs flex items-center justify-between">
                      <span className="font-semibold">Setup</span>
                      <span className="text-muted tabular-nums">
                        {done} of {ONBOARDING_STEPS.length} steps
                      </span>
                    </div>
                    <ProgressBar
                      value={done / ONBOARDING_STEPS.length}
                      tone={remaining.length ? 'ink' : 'success'}
                      aria-label={`${t.name} setup progress`}
                    />
                    <p className="mt-1 text-[0.6875rem] text-muted">
                      {remaining.length
                        ? `Still to do: ${remaining.map((s) => s.label.toLowerCase()).join(', ')}`
                        : 'Setup complete'}
                    </p>
                  </div>
                  <dl className="mt-4 gap-3 rounded-2xl p-3 text-sm grid grid-cols-2 bg-surface-2">
                    <div className="min-w-0">
                      <dt className="text-[0.6875rem] text-muted">Revenue, 30 days</dt>
                      <dd className="font-bold truncate tabular-nums">{fmtIdrShort(row.revenue)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.6875rem] text-muted">Customers</dt>
                      <dd className="font-bold truncate tabular-nums">{fmtNumber(row.customers)}</dd>
                    </div>
                  </dl>
                  <div className="gap-2 pt-4 mt-auto flex flex-wrap items-center justify-between">
                    <span className="text-xs text-muted">
                      {t.id === current?.id ? 'Open now' : `Code ${t.code}`}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => open(t)}
                      disabled={t.id === current?.id}
                      title={t.id === current?.id ? 'This brand is already open.' : undefined}
                    >
                      Open
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No tenants yet"
              description={
                admin
                  ? 'Create the first tenant to start a brand on the platform.'
                  : 'A platform admin adds you to a brand.'
              }
              action={
                admin && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={paths.newTenant}>New tenant</Link>
                  </Button>
                )
              }
            />
          </Card>
        )}
      </div>
    </>
  )
}
