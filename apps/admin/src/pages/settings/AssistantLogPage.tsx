import {
  ApiError,
  type AssistantLogEntry,
  type AssistantLogFilter,
  type AssistantOutcome,
  type AssistantTotals,
} from '@rc/api'
import { fmtDateTime, fmtNumber, plural } from '@rc/fixtures'
import {
  Badge,
  type BadgeProps,
  Banner,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
} from '@rc/ui'
import { ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { UserPicker } from '../../components/pickers'
import { lookedUp } from '../../assistant/lib'
import { HTTP, api } from '../../lib/api'
import { useScoped } from '../../state/scoped'

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'The server did not answer.')

const OUTCOME: Record<AssistantOutcome | 'open', { label: string; variant: BadgeProps['variant'] }> = {
  confirmed: { label: 'Confirmed', variant: 'success' },
  dismissed: { label: 'Dismissed', variant: 'muted' },
  failed: { label: 'Failed', variant: 'danger' },
  open: { label: 'Left open', variant: 'info' },
}

const OUTCOME_OPTIONS = (Object.keys(OUTCOME) as (keyof typeof OUTCOME)[]).map((value) => ({
  value,
  label: OUTCOME[value].label,
}))

/** Every question staff asked the assistant in this brand, what it proposed and what they did with it. */
export function AssistantLogPage() {
  const { user } = useAuth()
  const s = useScoped()
  const admin = user?.role === 'tenant_admin' || user?.role === 'platform_admin'
  const [filter, setFilter] = useState<AssistantLogFilter>({})
  const [entries, setEntries] = useState<AssistantLogEntry[] | null>(null)
  const [next, setNext] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (before?: string) => {
      setBusy(true)
      setError(null)
      try {
        const page = await api.assistantLog.list(s.tenantId, { ...filter, before })
        setEntries((shown) => (before ? [...(shown ?? []), ...page.entries] : page.entries))
        setNext(page.nextBefore)
      } catch (err) {
        setError(message(err))
      } finally {
        setBusy(false)
      }
    },
    [s.tenantId, filter],
  )

  useEffect(() => {
    if (HTTP && admin) void load()
  }, [admin, load])

  const set = (patch: AssistantLogFilter) => setFilter((f) => ({ ...f, ...patch }))

  return (
    <>
      <PageHeader
        title="Assistant log"
        description="What staff asked the assistant, what it proposed and what they did with each proposal. Kept for 90 days."
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            The assistant and its log live on the server. Build the console with VITE_API_URL to see them.
          </Banner>
        )}
        {HTTP && !admin && (
          <Banner tone="neutral" title="Ask a tenant admin">
            Only tenant admins read the assistant log.
          </Banner>
        )}
        {HTTP && user?.role === 'platform_admin' && <BrandTotals />}
        {HTTP && admin && (
          <Card>
            <CardHeader>
              <CardTitle>{s.tenant.name}</CardTitle>
              <CardDescription>
                Questions newest first. Emails and phone numbers in a question are replaced before it is
                stored.
              </CardDescription>
            </CardHeader>
            <div className="gap-2 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
              <UserPicker
                aria-label="Filter by person"
                placeholder="Anyone"
                clearable
                value={filter.userId ?? null}
                onChange={(userId) => set({ userId: userId ?? undefined })}
              />
              <NativeSelect
                aria-label="Filter by outcome"
                placeholder="Any outcome"
                options={OUTCOME_OPTIONS}
                value={filter.outcome ?? ''}
                onChange={(e) =>
                  set({ outcome: (e.target.value || undefined) as AssistantLogFilter['outcome'] })
                }
              />
              <Input
                type="date"
                aria-label="From date"
                value={filter.from ?? ''}
                onChange={(e) => set({ from: e.target.value || undefined })}
              />
              <Input
                type="date"
                aria-label="To date"
                value={filter.to ?? ''}
                onChange={(e) => set({ to: e.target.value || undefined })}
              />
            </div>
            <div className="px-5 pb-5">
              {error ? (
                <div className="gap-3 flex flex-wrap items-center justify-between">
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    Try again
                  </Button>
                </div>
              ) : entries === null ? (
                <p className="text-sm text-muted">Loading the log…</p>
              ) : entries.length === 0 ? (
                <EmptyState
                  compact
                  title="No questions here"
                  description="Questions to Ask AI show up here, with what happened to each proposal."
                />
              ) : (
                <>
                  <ol className="divide-y divide-border">
                    {entries.map((e) => (
                      <LogRow key={e.id} entry={e} />
                    ))}
                  </ol>
                  {next && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      loading={busy}
                      onClick={() => void load(next)}
                    >
                      Show older questions
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

function LogRow({ entry: e }: { entry: AssistantLogEntry }) {
  return (
    <li className="py-3">
      <details className="group">
        <summary className="gap-x-4 gap-y-1 sm:flex-row sm:items-baseline sm:justify-between flex cursor-pointer list-none flex-col">
          <div className="min-w-0">
            <p className="text-sm font-medium break-words">{e.question}</p>
            <p className="text-xs text-muted">
              {e.userName} · {plural(e.actions.length, 'proposal')}
              {e.errorCode && ' · did not answer'}
            </p>
          </div>
          <div className="gap-2 flex shrink-0 flex-wrap items-center">
            {e.feedback === 'up' && <ThumbsUp aria-label="Rated helpful" className="size-4 text-muted" />}
            {e.feedback === 'down' && (
              <ThumbsDown aria-label="Rated not helpful" className="size-4 text-muted" />
            )}
            {e.actions.map((a, i) => {
              const o = OUTCOME[a.outcome ?? 'open']
              return (
                <Badge key={i} variant={o.variant}>
                  {o.label}
                </Badge>
              )
            })}
            <time dateTime={e.at} className="text-xs text-muted">
              {fmtDateTime(e.at)}
            </time>
          </div>
        </summary>
        <dl className="mt-3 gap-x-6 gap-y-2 p-3 text-xs sm:grid-cols-[max-content_minmax(0,1fr)] rounded-xl grid grid-cols-1 bg-surface">
          <dt className="text-muted">Page</dt>
          <dd className="break-all">{e.page || 'None'}</dd>
          <dt className="text-muted">Model calls</dt>
          <dd>
            {e.modelCalls} · {fmtNumber(e.latencyMs)} ms
          </dd>
          <dt className="text-muted">Looked up</dt>
          <dd>{e.lookups.length ? lookedUp(e.lookups) : 'Nothing'}</dd>
          <dt className="text-muted">Answer</dt>
          <dd>{e.errorCode ? `None (${e.errorCode})` : plural(e.answerLength, 'character')}</dd>
          <dt className="text-muted">Proposals</dt>
          <dd>
            {e.actions.length === 0 ? (
              'None'
            ) : (
              <ul className="space-y-1">
                {e.actions.map((a, i) => (
                  <li key={i} className="gap-1.5 flex flex-wrap items-center">
                    <span className="font-medium">{a.type}</span>
                    {a.targets.length > 0 && (
                      <span className="break-all text-muted">{a.targets.join(', ')}</span>
                    )}
                    {a.risk === 'high' && (
                      <span className="gap-1 inline-flex items-center text-danger">
                        <TriangleAlert aria-hidden="true" className="size-3" />
                        High risk
                      </span>
                    )}
                    <span>· {OUTCOME[a.outcome ?? 'open'].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </details>
    </li>
  )
}

const cell = 'px-5 py-3 border-b border-border text-left whitespace-nowrap'

/** Use per brand over 30 days, for platform admins. */
function BrandTotals() {
  const [data, setData] = useState<AssistantTotals | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.assistantLog
      .totals()
      .then(setData)
      .catch((err: unknown) => setError(message(err)))
  }, [])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Every brand, last 30 days</CardTitle>
        <CardDescription>Questions, model calls and what happened to the proposals.</CardDescription>
      </CardHeader>
      {error ? (
        <p role="alert" className="px-5 pb-5 text-sm text-danger">
          {error}
        </p>
      ) : !data ? (
        <p className="px-5 pb-5 text-sm text-muted">Loading the totals…</p>
      ) : data.brands.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            compact
            title="No questions yet"
            description="No brand has asked the assistant in 30 days."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead className="text-xs text-muted">
              <tr>
                <th className={cell}>Brand</th>
                <th className={`${cell} text-right`}>Questions</th>
                <th className={`${cell} text-right`}>Model calls</th>
                <th className={`${cell} text-right`}>Proposed</th>
                <th className={`${cell} text-right`}>Confirmed</th>
                <th className={`${cell} text-right`}>Dismissed</th>
                <th className={`${cell} text-right`}>Failed</th>
                <th className={`${cell} text-right`}>No answer</th>
                <th className={`${cell} text-right`}>Rated</th>
              </tr>
            </thead>
            <tbody>
              {data.brands.map((b) => (
                <tr key={b.tenantId}>
                  <td className={`${cell} font-medium`}>{b.tenantName}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.questions)}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.modelCalls)}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.proposed)}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.confirmed)}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.dismissed)}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.failed)}</td>
                  <td className={`${cell} text-right`}>{fmtNumber(b.errors)}</td>
                  <td className={`${cell} text-right`}>
                    {b.thumbsUp} up · {b.thumbsDown} down
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
