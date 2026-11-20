import type { AuditEntry, AuditFilter, CsvDelimiterName } from '@rc/api'
import { fmtDateTime, plural } from '@rc/fixtures'
import {
  Banner,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  toast,
} from '@rc/ui'
import { Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { AuditChanges, actorLabel, apiMessage } from '../../components/AuditHistory'
import { paths } from '../../components/links'
import { UserPicker } from '../../components/pickers'
import { HTTP, api } from '../../lib/api'
import { saveBlob } from '../../lib/download'
import { useScoped } from '../../state/scoped'

/** Collections an entry can be about, for the record filter. */
const COLLECTIONS = [
  'products',
  'orders',
  'returns',
  'customers',
  'stock',
  'categories',
  'collections',
  'promotions',
  'campaigns',
  'segments',
  'tickets',
  'leads',
  'pages',
  'sellers',
  'paymentTypes',
  'integrations',
  'tenants',
  'users',
].map((id) => ({ id }))

const RECORD_LINK: Record<string, (id: string) => string> = {
  products: paths.product,
  orders: paths.order,
  customers: paths.customer,
  returns: paths.orderReturn,
}

/** Who changed what in this brand: every staff and API key write, from the audit log. */
export function AuditLogPage() {
  const { can } = useAuth()
  const s = useScoped()
  const allowed = can('user.manage')
  const [filter, setFilter] = useState<AuditFilter>({})
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [next, setNext] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [delimiter, setDelimiter] = useState<CsvDelimiterName>('comma')
  const [exporting, setExporting] = useState(false)

  const load = useCallback(
    async (before?: string) => {
      setBusy(true)
      setError(null)
      try {
        const page = await api.audit.list(s.tenantId, { ...filter, before })
        setEntries((shown) => (before ? [...(shown ?? []), ...page.entries] : page.entries))
        setNext(page.nextBefore)
      } catch (err) {
        setError(apiMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [s.tenantId, filter],
  )

  useEffect(() => {
    if (HTTP && allowed) void load()
  }, [allowed, load])

  const set = (patch: AuditFilter) => setFilter((f) => ({ ...f, ...patch }))

  const exportCsv = async () => {
    setExporting(true)
    try {
      saveBlob(await api.audit.exportCsv(s.tenantId, filter, delimiter), `audit-log-${s.tenant.subdomain}.csv`)
    } catch (err) {
      toast('The export did not download', { tone: 'danger', description: apiMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change staff and API keys made in this brand: who, what, when and from which network. Kept for 5 years and never edited."
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            The audit log lives on the server. Build the console with VITE_API_URL to see it.
          </Banner>
        )}
        {HTTP && !allowed && (
          <Banner tone="neutral" title="Ask a tenant admin">
            Only people who manage users read the audit log.
          </Banner>
        )}
        {HTTP && allowed && (
          <Card>
            <CardHeader>
              <CardTitle>{s.tenant.name}</CardTitle>
              <CardDescription>
                Newest first. Emails, phone numbers, addresses, notes and secrets show as changed, never their
                values. Networks are cut to their first three blocks.
              </CardDescription>
            </CardHeader>
            <div className="gap-2 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
              <UserPicker
                aria-label="Filter by person"
                placeholder="Anyone"
                clearable
                value={filter.actorId ?? null}
                onChange={(actorId) => set({ actorId: actorId ?? undefined })}
              />
              <Input
                aria-label="Filter by action"
                placeholder="Action, like orders/ or products/save"
                value={filter.action ?? ''}
                onChange={(e) => set({ action: e.target.value.trim() || undefined })}
              />
              <Combobox
                aria-label="Filter by record type"
                placeholder="Any record type"
                searchPlaceholder="Search record types"
                clearable
                items={COLLECTIONS}
                getKey={(c) => c.id}
                getLabel={(c) => c.id}
                value={filter.collection ?? null}
                onChange={(collection) => set({ collection: collection ?? undefined })}
              />
              <Input
                aria-label="Record id"
                placeholder="Record id, like prd-lr-101"
                value={filter.entityId ?? ''}
                onChange={(e) => set({ entityId: e.target.value.trim() || undefined })}
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
            <div className="gap-2 px-5 pb-4 flex flex-wrap items-center justify-between">
              <SegmentedControl
                size="sm"
                aria-label="CSV delimiter"
                options={[
                  { value: 'comma', label: 'Comma' },
                  { value: 'semicolon', label: 'Semicolon' },
                ]}
                value={delimiter}
                onChange={(v) => setDelimiter(v as CsvDelimiterName)}
              />
              <Button variant="outline" size="sm" loading={exporting} onClick={() => void exportCsv()}>
                <Download />
                Export CSV
              </Button>
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
                  title="No changes here"
                  description="Changes staff and API keys make show up here as they happen."
                />
              ) : (
                <>
                  <ol className="divide-y divide-border">
                    {entries.map((e) => (
                      <AuditRow key={e.id} entry={e} />
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
                      Show older changes
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

function AuditRow({ entry: e }: { entry: AuditEntry }) {
  const link = RECORD_LINK[e.entityCollection]
  return (
    <li className="py-3">
      <details>
        <summary className="gap-x-4 gap-y-1 sm:flex-row sm:items-baseline sm:justify-between flex cursor-pointer list-none flex-col">
          <div className="min-w-0">
            <p className="text-sm font-medium break-words">
              {e.action} · {e.entityCollection} {e.entityIds.join(', ')}
            </p>
            <p className="text-xs text-muted break-words">
              {actorLabel(e)}
              {e.actorRole && ` · ${e.actorRole}`} · {plural(e.changes.length, 'row')}
            </p>
          </div>
          <time dateTime={e.at} className="text-xs text-muted shrink-0">
            {fmtDateTime(e.at)}
          </time>
        </summary>
        <div className="mt-3 gap-3 p-3 rounded-xl bg-surface grid grid-cols-1">
          <AuditChanges entry={e} />
          <dl className="gap-x-6 gap-y-1 text-xs sm:grid-cols-[max-content_minmax(0,1fr)] grid grid-cols-1">
            <dt className="text-muted">Request</dt>
            <dd className="break-all">{e.requestId || 'None'}</dd>
            <dt className="text-muted">Network</dt>
            <dd>{e.ip || 'Unknown'}</dd>
            {link && e.entityIds.length === 1 && (
              <>
                <dt className="text-muted">Record</dt>
                <dd>
                  <Link className="underline" to={link(e.entityIds[0])}>
                    Open {e.entityIds[0]}
                  </Link>
                </dd>
              </>
            )}
          </dl>
        </div>
      </details>
    </li>
  )
}
