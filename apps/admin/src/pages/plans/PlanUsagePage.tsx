import type { PlanInfo, PlanOverview } from '@rc/api'
import { PLAN_LIMIT_KEYS, PLAN_LIMIT_LABEL, fmtDate, fmtNumber, nextPlan, planUsageShare } from '@rc/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  PageHeader,
  ProgressBar,
  Textarea,
  toast,
} from '@rc/ui'
import { ArrowUpCircle } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { useScoped } from '../../state/scoped'
import {
  INVOICE_STATUS,
  PAYMENT_NOTE,
  REQUEST_STATUS,
  message,
  periodLabel,
  planGains,
  planName,
  priceLabel,
} from './lib'

const cellClass = 'px-5 py-3 border-b border-border text-left'

/** A brand's plan: each limit against what the brand uses, the next plan, and the invoices. */
export function PlanUsagePage() {
  const { user } = useAuth()
  const { tenantId, tenant } = useScoped()
  const admin = user?.role === 'tenant_admin' || user?.role === 'platform_admin'
  const [data, setData] = useState<PlanOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    api.plans
      .overview(tenantId)
      .then(setData)
      .catch((err: unknown) => setLoadError(message(err)))
  }, [tenantId])
  useEffect(() => {
    if (HTTP && admin) load()
  }, [admin, load])

  const current = data?.plans.find((p) => p.id === data.plan)
  const upNext = data && nextPlan(data.plan)
  const next = data?.plans.find((p) => p.id === upNext)
  const pending = data?.requests.find((r) => r.status === 'pending')

  return (
    <>
      <PageHeader
        title="Plan & usage"
        description={`What the plan of ${tenant.name} allows, how much of it the brand uses, and its invoices.`}
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            Plans and invoices live on the server. Build the console with VITE_API_URL to see them.
          </Banner>
        )}
        {HTTP && !admin && (
          <Banner tone="neutral" title="Ask your brand admin">
            Only a brand admin sees the plan and its invoices.
          </Banner>
        )}
        {loadError && (
          <Banner
            tone="danger"
            title="Could not load the plan"
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}

        {data && current && (
          <>
            <Card>
              <CardHeader action={<Badge variant="ink">{current.name}</Badge>}>
                <CardTitle>Usage</CardTitle>
                <CardDescription>
                  {priceLabel(current.price)}. Past a limit, new products, people, sellers, warehouses,
                  currencies and uploads are refused; what the brand already has keeps working.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="gap-x-8 gap-y-5 md:grid-cols-2 grid grid-cols-1">
                  {PLAN_LIMIT_KEYS.map((key) => {
                    const used = data.usage[key] ?? 0
                    const limit = current.limits[key]
                    const share = planUsageShare(used, limit)
                    return (
                      <li key={key} className="min-w-0">
                        <div className="mb-1.5 gap-2 text-sm flex flex-wrap items-baseline justify-between">
                          <span className="font-medium">{PLAN_LIMIT_LABEL[key]}</span>
                          <span className="text-muted tabular-nums">
                            {fmtNumber(used)} of {fmtNumber(limit)}
                          </span>
                        </div>
                        <ProgressBar
                          value={share}
                          tone={share >= 1 ? 'accent' : share >= 0.8 ? 'warning' : 'ink'}
                          aria-label={`${PLAN_LIMIT_LABEL[key]}: ${fmtNumber(used)} of ${fmtNumber(limit)}`}
                        />
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

            <UpgradeCard
              tenantId={tenantId}
              current={current}
              next={next ?? null}
              plans={data.plans}
              pendingTo={pending?.toPlan ?? null}
              onAsked={load}
            />

            {data.requests.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Plan requests</CardTitle>
                </CardHeader>
                <ul className="pb-2">
                  {data.requests.map((r) => (
                    <li
                      key={r.id}
                      className="gap-2 px-5 py-3 text-sm flex flex-wrap items-center justify-between border-t border-border"
                    >
                      <span>
                        {planName(data.plans, r.fromPlan)} to {planName(data.plans, r.toPlan)}
                        <span className="text-xs block text-muted">
                          Asked {fmtDate(r.requestedAt)}
                          {r.decisionNote ? `. ${r.decisionNote}` : ''}
                        </span>
                      </span>
                      <Badge variant={REQUEST_STATUS[r.status].variant}>
                        {REQUEST_STATUS[r.status].label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>{PAYMENT_NOTE}</CardDescription>
              </CardHeader>
              {data.invoices.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">
                  No invoices yet. A paid plan gets one at the start of each month.
                </p>
              ) : (
                <div className="pb-2 relative overflow-x-auto">
                  <table className="border-spacing-0 text-sm w-full border-separate">
                    <caption className="sr-only">Invoices</caption>
                    <thead>
                      <tr className="text-xs text-muted">
                        <th scope="col" className={`${cellClass} font-semibold`}>
                          Month
                        </th>
                        <th scope="col" className={`${cellClass} font-semibold`}>
                          Plan
                        </th>
                        <th scope="col" className={`${cellClass} font-semibold`}>
                          Amount
                        </th>
                        <th scope="col" className={`${cellClass} font-semibold`}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((inv) => (
                        <tr key={inv.id}>
                          <th scope="row" className={`${cellClass} font-medium`}>
                            {periodLabel(inv.period)}
                            <span className="text-xs font-normal block text-muted">
                              Issued {fmtDate(inv.issuedAt)}
                              {inv.paidAt ? `, paid ${fmtDate(inv.paidAt)}` : ''}
                            </span>
                          </th>
                          <td className={cellClass}>{planName(data.plans, inv.plan)}</td>
                          <td className={`${cellClass} tabular-nums`}>
                            {priceLabel(inv.amount).replace(' a month', '')}
                          </td>
                          <td className={cellClass}>
                            <Badge variant={INVOICE_STATUS[inv.status].variant}>
                              {INVOICE_STATUS[inv.status].label}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  )
}

/** What the next plan adds, and the request for it. */
function UpgradeCard({
  tenantId,
  current,
  next,
  plans,
  pendingTo,
  onAsked,
}: {
  tenantId: string
  current: PlanInfo
  next: PlanInfo | null
  plans: PlanInfo[]
  pendingTo: string | null
  onAsked: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!next) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Largest plan</CardTitle>
          <CardDescription>
            {current.name} is the largest plan. Talk to the platform if the brand needs more.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.plans.request(tenantId, next.id, note.trim())
      setNote('')
      toast('Upgrade requested', { tone: 'success', description: `${current.name} to ${next.name}` })
      onAsked()
    } catch (err) {
      setError(message(err))
    }
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader action={<Badge variant="outline">{priceLabel(next.price)}</Badge>}>
        <CardTitle>{next.name} adds</CardTitle>
        <CardDescription>
          A platform admin approves the request and moves the brand to the new plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 space-y-1 text-sm">
          {planGains(current, next).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {pendingTo ? (
          <Banner tone="info" title="Request waiting">
            The platform has your request for {planName(plans, pendingTo)}. A new request replaces it.
          </Banner>
        ) : null}
        <form onSubmit={ask} noValidate className="mt-4 gap-3 grid grid-cols-1">
          <FormField
            label="Note for the platform"
            htmlFor="plan-note"
            hint="Optional. What the brand needs it for."
          >
            <Textarea
              id="plan-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
          {error && (
            <Banner tone="danger" title="Not requested">
              {error}
            </Banner>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              <ArrowUpCircle />
              Request upgrade
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
