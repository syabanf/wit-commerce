import type { CaptchaSettings, Invoice, PlanInfo, PlanLimitsWire, PlatformPlans } from '@rc/api'
import { PLAN_IDS, PLAN_LIMIT_KEYS, PLAN_LIMIT_LABEL, fmtAgo, fmtDate, fmtNumber } from '@rc/fixtures'
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
  Input,
  NativeSelect,
  PageHeader,
  toast,
} from '@rc/ui'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'
import { INVOICE_STATUS, PAYMENT_NOTE, message, periodLabel, planName, priceLabel } from './lib'

const cellClass = 'px-5 py-3 border-b border-border text-left'

/** The platform's plans: prices and limits, requests to approve, every brand's plan and invoices. */
export function PlansPage() {
  const { user } = useAuth()
  const platform = user?.role === 'platform_admin'
  const [data, setData] = useState<PlatformPlans | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    api.plans
      .platform()
      .then(setData)
      .catch((err: unknown) => setLoadError(message(err)))
  }, [])
  useEffect(() => {
    if (HTTP && platform) load()
  }, [platform, load])

  return (
    <>
      <PageHeader
        title="Plans"
        description="What each plan costs and allows, the brands' upgrade requests, and the invoices the platform records."
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            Plans live on the server. Build the console with VITE_API_URL to change them.
          </Banner>
        )}
        {HTTP && !platform && (
          <Banner tone="neutral" title="Ask a platform admin">
            Only a platform admin can change plans and invoices.
          </Banner>
        )}
        {loadError && (
          <Banner
            tone="danger"
            title="Could not load the plans"
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}
        {HTTP && platform && data && (
          <>
            <RequestsCard data={data} onChanged={load} />
            <div className="gap-4 xl:grid-cols-3 grid grid-cols-1">
              {data.plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  defaults={data.defaults.find((d) => d.id === plan.id) ?? plan}
                  onSaved={setData}
                />
              ))}
            </div>
            <TenantsCard data={data} onChanged={load} />
            <InvoicesCard data={data} onChanged={load} />
          </>
        )}
        {HTTP && platform && <CaptchaCard />}
      </div>
    </>
  )
}

function RequestsCard({ data, onChanged }: { data: PlatformPlans; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const pending = data.requests.filter((r) => r.status === 'pending')
  const tenantName = (id: string) => data.tenants.find((t) => t.id === id)?.name ?? id

  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    try {
      const r = await api.plans.decide(id, approve)
      toast(approve ? 'Upgrade approved' : 'Request declined', {
        tone: 'success',
        description: `${tenantName(r.tenantId)}: ${planName(data.plans, r.toPlan)}`,
      })
      onChanged()
    } catch (err) {
      toast('Not changed', { tone: 'danger', description: message(err) })
    }
    setBusy(null)
  }

  return (
    <Card>
      <CardHeader
        action={pending.length > 0 ? <Badge variant="info">{pending.length} waiting</Badge> : undefined}
      >
        <CardTitle>Plan requests</CardTitle>
        <CardDescription>Approving moves the brand to the plan it asked for at once.</CardDescription>
      </CardHeader>
      {pending.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">No request is waiting.</p>
      ) : (
        <ul className="pb-2">
          {pending.map((r) => (
            <li
              key={r.id}
              className="gap-3 px-5 py-3 text-sm flex flex-wrap items-center justify-between border-t border-border"
            >
              <span className="min-w-0">
                <span className="font-medium">{tenantName(r.tenantId)}</span>:{' '}
                {planName(data.plans, r.fromPlan)} to {planName(data.plans, r.toPlan)}
                <span className="text-xs block text-muted">
                  Asked {fmtDate(r.requestedAt)}
                  {r.note ? `. ${r.note}` : ''}
                </span>
              </span>
              <span className="gap-2 flex">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => decide(r.id, false)}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  loading={busy === r.id}
                  disabled={busy !== null}
                  onClick={() => decide(r.id, true)}
                >
                  Approve
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** One plan's price and limits, editable. Empty fields are refused rather than read as zero. */
function PlanCard({
  plan,
  defaults,
  onSaved,
}: {
  plan: PlanInfo
  defaults: PlanInfo
  onSaved: (next: PlatformPlans) => void
}) {
  const { userName } = useScoped()
  const now = useNow(30_000)
  const toForm = (p: PlanInfo) => ({
    price: String(p.price),
    ...Object.fromEntries(PLAN_LIMIT_KEYS.map((k) => [k, String(p.limits[k])])),
  })
  const [form, setForm] = useState<Record<string, string>>(() => toForm(plan))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setForm(toForm(plan)), [plan])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const numbers = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, Number(v.replace(/[,\s]/g, ''))]),
    )
    if (
      Object.values(form).some((v) => v.trim() === '') ||
      Object.values(numbers).some((n) => !Number.isInteger(n) || n < 0)
    ) {
      setError('Enter every field as a whole number of 0 or more.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const limits = Object.fromEntries(
        PLAN_LIMIT_KEYS.map((k) => [k, numbers[k]!]),
      ) as unknown as PlanLimitsWire
      onSaved(await api.plans.save(plan.id, { price: numbers.price!, limits }))
      toast('Plan saved', { tone: 'success', description: plan.name })
    } catch (err) {
      setError(message(err))
    }
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader
        action={
          plan.updatedAt ? <Badge variant="info">Changed</Badge> : <Badge variant="muted">Default</Badge>
        }
      >
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>
          {plan.updatedAt
            ? `Saved ${fmtAgo(plan.updatedAt, now)} by ${userName(plan.updatedBy ?? '')}.`
            : 'The numbers WIT Commerce ships with. Change them to suit this platform.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate className="gap-3 sm:grid-cols-2 grid grid-cols-1">
          <FormField
            label="Monthly price (Rp)"
            htmlFor={`${plan.id}-price`}
            hint={`Default ${priceLabel(defaults.price)}`}
          >
            <Input
              id={`${plan.id}-price`}
              inputMode="numeric"
              value={form.price ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </FormField>
          {PLAN_LIMIT_KEYS.map((key) => (
            <FormField
              key={key}
              label={PLAN_LIMIT_LABEL[key]}
              htmlFor={`${plan.id}-${key}`}
              hint={`Default ${fmtNumber(defaults.limits[key])}`}
            >
              <Input
                id={`${plan.id}-${key}`}
                inputMode="numeric"
                value={form[key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </FormField>
          ))}
          {error && (
            <Banner tone="danger" title="Not saved" className="sm:col-span-2">
              {error}
            </Banner>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={busy}>
              Save {plan.name}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function TenantsCard({ data, onChanged }: { data: PlatformPlans; onChanged: () => void }) {
  const options = PLAN_IDS.map((id) => ({ value: id, label: planName(data.plans, id) }))
  const move = async (tenantId: string, name: string, plan: string) => {
    try {
      await api.plans.setTenantPlan(tenantId, plan)
      toast('Plan changed', { tone: 'success', description: `${name}: ${planName(data.plans, plan)}` })
      onChanged()
    } catch (err) {
      toast('Plan not changed', { tone: 'danger', description: message(err) })
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Brands</CardTitle>
        <CardDescription>Move a brand without a request, for example after a call.</CardDescription>
      </CardHeader>
      <ul className="pb-2">
        {data.tenants.map((t) => (
          <li
            key={t.id}
            className="gap-3 px-5 py-2 text-sm flex flex-wrap items-center justify-between border-t border-border"
          >
            <span className="font-medium">{t.name}</span>
            <NativeSelect
              aria-label={`Plan of ${t.name}`}
              variant="inline"
              options={options}
              value={t.plan}
              onChange={(e) => void move(t.id, t.name, e.target.value)}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function InvoicesCard({ data, onChanged }: { data: PlatformPlans; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const tenantName = (id: string) => data.tenants.find((t) => t.id === id)?.name ?? id
  const mark = async (inv: Invoice, status: Invoice['status']) => {
    setBusy(inv.id)
    try {
      await api.plans.setInvoiceStatus(inv.id, status)
      toast(`Invoice marked ${INVOICE_STATUS[status].label.toLowerCase()}`, {
        tone: 'success',
        description: `${tenantName(inv.tenantId)}, ${periodLabel(inv.period)}`,
      })
      onChanged()
    } catch (err) {
      toast('Invoice not changed', { tone: 'danger', description: message(err) })
    }
    setBusy(null)
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>
          The timer issues one invoice per brand on a paid plan each month. {PAYMENT_NOTE}
        </CardDescription>
      </CardHeader>
      {data.invoices.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">No invoices yet.</p>
      ) : (
        <div className="pb-2 relative overflow-x-auto">
          <table className="border-spacing-0 text-sm w-full border-separate">
            <caption className="sr-only">Invoices of every brand</caption>
            <thead>
              <tr className="text-xs text-muted">
                {['Brand', 'Month', 'Amount', 'Status', ''].map((h) => (
                  <th key={h} scope="col" className={`${cellClass} font-semibold`}>
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <th scope="row" className={`${cellClass} font-medium`}>
                    {tenantName(inv.tenantId)}
                    <span className="text-xs font-normal block text-muted">
                      {planName(data.plans, inv.plan)}
                    </span>
                  </th>
                  <td className={cellClass}>{periodLabel(inv.period)}</td>
                  <td className={`${cellClass} tabular-nums`}>
                    {priceLabel(inv.amount).replace(' a month', '')}
                  </td>
                  <td className={cellClass}>
                    <Badge variant={INVOICE_STATUS[inv.status].variant}>
                      {INVOICE_STATUS[inv.status].label}
                    </Badge>
                    {inv.paidAt && <span className="text-xs block text-muted">{fmtDate(inv.paidAt)}</span>}
                  </td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {inv.status === 'due' ? (
                      <span className="gap-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => mark(inv, 'void')}
                        >
                          Void
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy === inv.id}
                          disabled={busy !== null}
                          onClick={() => mark(inv, 'paid')}
                        >
                          Mark paid
                        </Button>
                      </span>
                    ) : (
                      <span className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => mark(inv, 'due')}
                        >
                          Mark due
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Cloudflare Turnstile keys for sign-up and shopper registration. */
function CaptchaCard() {
  const { userName } = useScoped()
  const now = useNow(30_000)
  const [settings, setSettings] = useState<CaptchaSettings | null>(null)
  const [siteKey, setSiteKey] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const show = (next: CaptchaSettings) => {
    setSettings(next)
    setSiteKey(next.siteKey)
    setSecret('')
  }
  useEffect(() => {
    api.captchaSettings
      .get()
      .then(show)
      .catch((err: unknown) => setError(message(err)))
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = await api.captchaSettings.save({ siteKey: siteKey.trim(), secret: secret.trim() })
      show(next)
      toast(next.siteKey ? 'Turnstile saved' : 'Turnstile turned off', { tone: 'success' })
    } catch (err) {
      setError(message(err))
    }
    setBusy(false)
  }

  const on = !!settings?.siteKey
  return (
    <Card>
      <CardHeader action={<Badge variant={on ? 'success' : 'muted'}>{on ? 'On' : 'Off'}</Badge>}>
        <CardTitle>Bot check</CardTitle>
        <CardDescription>
          With Cloudflare Turnstile keys saved, store sign-up and shopper registration ask for the check.
          Create the keys in the Cloudflare dashboard under Turnstile. Clear both fields and save to turn it
          off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate autoComplete="off" className="gap-4 md:grid-cols-2 grid grid-cols-1">
          <FormField label="Site key" htmlFor="turnstile-site" hint="Public: the sign-up pages show it.">
            <Input id="turnstile-site" value={siteKey} onChange={(e) => setSiteKey(e.target.value)} />
          </FormField>
          <FormField
            label="Secret key"
            htmlFor="turnstile-secret"
            hint={
              settings?.secretSet
                ? `Saved ${settings.updatedAt ? fmtAgo(settings.updatedAt, now) : ''} by ${userName(settings.updatedBy ?? '')}. Leave empty to keep it.`
                : 'Stored encrypted. Nobody can read it back here.'
            }
          >
            <Input
              id="turnstile-secret"
              type="password"
              autoComplete="new-password"
              placeholder={settings?.secretSet ? `•••• ${settings.secretLast4}` : ''}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </FormField>
          {error && (
            <Banner tone="danger" title="Not saved" className="md:col-span-2">
              {error}
            </Banner>
          )}
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
