import { ApiError, type CurrencyRate, type CurrencyRates } from '@rc/api'
import { CURRENCY_LABEL, fmtAgo, fmtCurrency, fmtNumber, isDisplayCurrency } from '@rc/fixtures'
import {
  Badge,
  type BadgeProps,
  Banner,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  cn,
  toast,
} from '@rc/ui'
import { RefreshCw } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'

const SOURCE: Record<CurrencyRate['source'], { label: string; variant: BadgeProps['variant'] }> = {
  auto: { label: 'Automatic', variant: 'success' },
  manual: { label: 'Manual', variant: 'info' },
  fallback: { label: 'Built-in', variant: 'muted' },
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'The server did not answer.')

/** What one unit of the currency costs in rupiah, the way people quote rates. */
const perUnit = (rate: number) => fmtNumber(1 / rate)

const cellClass = 'px-5 py-3 border-b border-border text-left'

/** The platform's exchange rates. Shoppers see estimates with them; orders stay in rupiah. */
export function CurrencySettingsPage() {
  const { user } = useAuth()
  const { userName } = useScoped()
  const now = useNow(30_000)
  const platform = user?.role === 'platform_admin'
  const [data, setData] = useState<CurrencyRates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    api.currencySettings
      .get()
      .then(setData)
      .catch((err: unknown) => setLoadError(message(err)))
  }, [])
  useEffect(() => {
    if (HTTP && platform) load()
  }, [platform, load])

  const refresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const next = await api.currencySettings.refresh()
      setData(next)
      if (next.refresh?.ok)
        toast('Rates refreshed', {
          tone: 'success',
          description: `${next.refresh.updated} automatic rates updated.`,
        })
      else setRefreshError(next.refresh?.error ?? 'Frankfurter did not answer.')
    } catch (err) {
      setRefreshError(message(err))
    }
    setRefreshing(false)
  }

  const lastAuto = data?.rates
    .filter((r) => r.source === 'auto' && r.updatedAt)
    .map((r) => r.updatedAt!)
    .sort()
    .at(-1)

  return (
    <>
      <PageHeader
        title="Currencies"
        description="Exchange rates for the estimated prices shoppers can switch to. Stores still sell, charge and report in rupiah."
        actions={
          HTTP && platform && data ? (
            <Button variant="outline" loading={refreshing} onClick={refresh}>
              <RefreshCw />
              Refresh
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            Rates live on the server. Build the console with VITE_API_URL to change them. The demo storefront
            uses the built-in rates.
          </Banner>
        )}
        {HTTP && !platform && (
          <Banner tone="neutral" title="Ask a platform admin">
            Only a platform admin can change exchange rates.
          </Banner>
        )}
        {loadError && (
          <Banner
            tone="danger"
            title="Could not load the rates"
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}
        {refreshError && (
          <Banner tone="danger" title="The rates did not refresh">
            The saved rates stay in use. {refreshError}
          </Banner>
        )}

        {HTTP && platform && data && (
          <Card>
            <CardHeader>
              <CardTitle>Rates</CardTitle>
              <CardDescription>
                Automatic rates come from the European Central Bank through Frankfurter once a day
                {lastAuto ? `, last ${fmtAgo(lastAuto, now)}` : ''}. A manual rate stays until you switch it
                back.
              </CardDescription>
            </CardHeader>
            <div className="pb-2 overflow-x-auto">
              <table className="border-spacing-0 text-sm w-full border-separate">
                <caption className="sr-only">Exchange rates against the rupiah</caption>
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className={cn(cellClass, 'font-semibold')}>
                      Currency
                    </th>
                    <th scope="col" className={cn(cellClass, 'font-semibold')}>
                      Rupiah per unit
                    </th>
                    <th scope="col" className={cn(cellClass, 'font-semibold')}>
                      Source
                    </th>
                    <th scope="col" className={cn(cellClass, 'font-semibold')}>
                      Updated
                    </th>
                    <th scope="col" className={cn(cellClass, 'font-semibold min-w-72')}>
                      Manual rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rates.map((r) => (
                    <RateRow
                      key={r.code}
                      rate={r}
                      updated={
                        r.updatedAt
                          ? `${fmtAgo(r.updatedAt, now)} by ${userName(r.updatedBy ?? '')}`
                          : 'Never'
                      }
                      onSaved={setData}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

/** One currency: its rate and an inline manual override, entered as rupiah per unit. */
function RateRow({
  rate,
  updated,
  onSaved,
}: {
  rate: CurrencyRate
  updated: string
  onSaved: (next: CurrencyRates) => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const source = SOURCE[rate.source]
  const label = isDisplayCurrency(rate.code) ? CURRENCY_LABEL[rate.code] : rate.code

  const run = async (request: () => Promise<CurrencyRates>, done: string) => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await request())
      setValue('')
      toast(done, { tone: 'success' })
    } catch (err) {
      setError(message(err))
    }
    setBusy(false)
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    const idr = Number(value.replace(/[,\s]/g, ''))
    if (!(idr > 0)) {
      setError('Enter how many rupiah one unit costs, above zero.')
      return
    }
    void run(
      () => api.currencySettings.save([{ code: rate.code, source: 'manual', rate: 1 / idr }]),
      `${rate.code} set to Rp ${fmtNumber(idr)}`,
    )
  }

  return (
    <tr>
      <th scope="row" className={cn(cellClass, 'font-medium')}>
        {rate.code}
        <span className="text-xs font-normal block text-muted">{label}</span>
      </th>
      <td className={cn(cellClass, 'tabular-nums')}>
        Rp {perUnit(rate.rate)}
        <span className="text-xs block text-muted">
          Rp 100,000 = {fmtCurrency(100_000 * rate.rate, rate.code)}
        </span>
      </td>
      <td className={cellClass}>
        <Badge variant={source.variant}>{source.label}</Badge>
      </td>
      <td className={cn(cellClass, 'text-muted')}>{updated}</td>
      <td className={cellClass}>
        <form onSubmit={save} noValidate className="gap-2 flex items-center">
          <Input
            aria-label={`Rupiah per ${rate.code}`}
            inputMode="decimal"
            placeholder={perUnit(rate.rate)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-32"
          />
          <Button type="submit" size="sm" variant="outline" loading={busy && !!value}>
            Set
          </Button>
          {rate.source === 'manual' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(
                  () => api.currencySettings.save([{ code: rate.code, source: 'auto' }]),
                  `${rate.code} uses the automatic rate`,
                )
              }
            >
              Use automatic rate
            </Button>
          )}
        </form>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </td>
    </tr>
  )
}
