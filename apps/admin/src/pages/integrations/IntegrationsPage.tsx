import { fmtAgo, fmtNumber, fmtWhen, plural, toMs } from '@rc/fixtures'
import type { Integration, IntegrationCategory, IntegrationLog } from '@rc/types'
import { INTEGRATION_CATEGORY_LABEL } from '@rc/types'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  Combobox,
  DataTable,
  EmptyState,
  FilterChips,
  IconTile,
  NativeSelect,
  NoMatch,
  PageHeader,
  PillTabs,
  Switch,
  TableFilters,
  cn,
  countBy,
  matchesQuery,
  toast,
} from '@rc/ui'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  KeyRound,
  MessageCircle,
  RefreshCw,
  Store,
  Truck,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { HEALTH_TONE, HealthBadge } from '../../components/badges'
import { HTTP } from '../../lib/api'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { ConnectorDialog } from './ConnectorDialog'
import { CATEGORY_ORDER, SYNC_DELAY_MS } from './lib'

const CATEGORY_ICON: Record<IntegrationCategory, ReactNode> = {
  payment: <CreditCard />,
  logistics: <Truck />,
  enterprise: <Building2 />,
  marketing: <MessageCircle />,
  marketplace: <Store />,
}

type Filter = IntegrationCategory | 'all'

type LogResult = 'failed' | 'ok'
const resultOf = (l: IntegrationLog): LogResult => (l.ok ? 'ok' : 'failed')
const LOG_RESULTS: { value: LogResult; label: string }[] = [
  { value: 'failed', label: 'Failed' },
  { value: 'ok', label: 'Succeeded' },
]
const DIRECTION_OPTIONS = [
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
]

export function IntegrationsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('integration.manage')
  const now = useNow(30_000)
  const [params] = useSearchParams()
  const focusId = params.get('id')
  const [category, setCategory] = useHistoryState<Filter>('category', 'all')
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(new Set())
  const table = useTableHistory()

  const integrations = useMemo(
    () =>
      [...s.integrations].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      ),
    [s.integrations],
  )
  const visible = category === 'all' ? integrations : integrations.filter((i) => i.category === category)
  const logs = useMemo(
    () => [...s.integrationLogs].sort((a, b) => toMs(b.at) - toMs(a.at)),
    [s.integrationLogs],
  )

  const [logQuery, setLogQuery] = useHistoryState('log.q', '')
  const [logResult, setLogResult] = useHistoryState<LogResult | null>('log.result', null)
  const [logDirection, setLogDirection] = useHistoryState<IntegrationLog['direction'] | ''>(
    'log.direction',
    '',
  )
  const [logIntegrationId, setLogIntegrationId] = useHistoryState<string | null>('log.integration', null)
  const logBase = useMemo(
    () =>
      logs.filter(
        (l) =>
          (!logDirection || l.direction === logDirection) &&
          (!logIntegrationId || l.integrationId === logIntegrationId) &&
          matchesQuery(
            logQuery,
            s.maps.integration.get(l.integrationId)?.provider,
            l.event,
            l.path,
            l.summary,
          ),
      ),
    [logs, logDirection, logIntegrationId, logQuery, s.maps.integration],
  )
  const logRows = logResult ? logBase.filter((l) => resultOf(l) === logResult) : logBase
  const logPickers = (logDirection ? 1 : 0) + (logIntegrationId ? 1 : 0)
  const logFilters = logPickers + (logQuery.trim() ? 1 : 0) + (logResult ? 1 : 0)
  const clearLogFilters = () => {
    setLogQuery('')
    setLogResult(null)
    setLogDirection('')
    setLogIntegrationId(null)
  }

  useEffect(() => {
    if (!focusId) return
    document.getElementById(`integration-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusId])

  const toggle = (i: Integration) => {
    s.dispatch({ type: 'integrations/toggle', id: i.id })
    toast(i.enabled ? 'Integration turned off' : 'Integration turned on', {
      description: i.enabled
        ? `${i.provider} stopped sending and receiving events.`
        : `${i.provider} is connected again.`,
    })
  }

  const sync = (i: Integration) => {
    setSyncing((ids) => new Set(ids).add(i.id))
    window.setTimeout(() => {
      s.dispatch({ type: 'integrations/sync', id: i.id })
      setSyncing((ids) => new Set([...ids].filter((id) => id !== i.id)))
      toast('Sync finished', { tone: 'success', description: `${i.provider} pulled its latest changes.` })
    }, SYNC_DELAY_MS)
  }

  const tabs = [
    { value: 'all', label: 'All', count: integrations.length },
    ...CATEGORY_ORDER.map((c) => ({
      value: c,
      label: INTEGRATION_CATEGORY_LABEL[c],
      count: integrations.filter((i) => i.category === c).length,
    })),
  ]

  const columns: Column<IntegrationLog>[] = [
    {
      id: 'dir',
      header: <span className="sr-only">Direction</span>,
      width: '3.5rem',
      cell: (l) => (
        <IconTile size="sm" tone={l.direction === 'inbound' ? 'info' : 'ink'}>
          {l.direction === 'inbound' ? (
            <ArrowDownLeft aria-hidden="true" />
          ) : (
            <ArrowUpRight aria-hidden="true" />
          )}
          <span className="sr-only">{l.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>
        </IconTile>
      ),
    },
    {
      id: 'at',
      header: 'Time',
      sortValue: (l) => toMs(l.at),
      cell: (l) => <span className="text-xs whitespace-nowrap tabular-nums">{fmtWhen(l.at, now)}</span>,
    },
    {
      id: 'provider',
      header: 'Provider',
      sortValue: (l) => s.maps.integration.get(l.integrationId)?.provider ?? '',
      cell: (l) => (
        <Badge variant="outline">{s.maps.integration.get(l.integrationId)?.provider ?? 'Removed'}</Badge>
      ),
    },
    {
      id: 'event',
      header: 'Event',
      hideBelow: 'sm',
      sortValue: (l) => l.event,
      cell: (l) => <span className="text-xs font-mono">{l.event}</span>,
    },
    {
      id: 'path',
      header: 'Path',
      hideBelow: 'lg',
      cell: (l) => <span className="text-xs font-mono text-muted">{l.path}</span>,
    },
    {
      id: 'summary',
      header: 'Summary',
      hideBelow: 'md',
      cell: (l) => <span className="text-xs">{l.summary}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (l) => (l.ok ? 1 : 0),
      cell: (l) => <Badge variant={l.ok ? 'success' : 'danger'}>{l.ok ? 'OK' : 'Failed'}</Badge>,
    },
    {
      id: 'ms',
      header: 'Duration',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (l) => l.ms,
      cell: (l) => <span className="text-xs whitespace-nowrap tabular-nums">{fmtNumber(l.ms)} ms</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Payment, courier, ERP, messaging and marketplace connections for this brand, with the events they exchange."
      />
      <div className="space-y-4">
        <Banner tone="neutral" title="Who owns which data">
          Payments settle in the payment gateway, invoices and accounting live in the ERP, and marketplace
          orders are imported here and fulfilled like any other order. Couriers own tracking; Commerce OS owns
          products, stock, customers and orders.
        </Banner>

        <PillTabs
          items={tabs}
          value={category}
          onValueChange={(v) => setCategory(CATEGORY_ORDER.find((c) => c === v) ?? 'all')}
        />

        {visible.length ? (
          <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
            {visible.map((i) => (
              <ConnectionCard
                key={i.id}
                integration={i}
                now={now}
                focused={i.id === focusId}
                manage={manage}
                syncing={syncing.has(i.id)}
                onToggle={() => toggle(i)}
                onSync={() => sync(i)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title={
                category === 'all'
                  ? 'No integrations yet'
                  : `No ${INTEGRATION_CATEGORY_LABEL[category].toLowerCase()} integrations`
              }
              description="Connections appear here once the platform team sets them up for this brand."
            />
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Webhook and API log</CardTitle>
            <CardDescription>
              Requests between Commerce OS and connected systems, newest first.
            </CardDescription>
          </CardHeader>
          <TableFilters
            query={logQuery}
            onQueryChange={setLogQuery}
            searchPlaceholder="Provider, event, path or summary"
            searchLabel="Search the request log"
            shown={logRows.length}
            total={logs.length}
            activeCount={logFilters}
            onClear={clearLogFilters}
            activePickers={logPickers}
            chips={
              <FilterChips
                options={LOG_RESULTS}
                value={logResult}
                onChange={setLogResult}
                counts={countBy(logBase, resultOf)}
                total={logBase.length}
              />
            }
            pickers={
              <>
                <NativeSelect
                  variant="inline"
                  aria-label="Filter by direction"
                  placeholder="Any direction"
                  options={DIRECTION_OPTIONS}
                  value={logDirection}
                  onChange={(e) => setLogDirection(e.target.value as IntegrationLog['direction'] | '')}
                />
                <Combobox
                  variant="inline"
                  clearable
                  aria-label="Filter by provider"
                  placeholder="Any provider"
                  items={integrations}
                  getKey={(i) => i.id}
                  getLabel={(i) => i.provider}
                  value={logIntegrationId}
                  onChange={setLogIntegrationId}
                />
              </>
            }
          />
          <DataTable
            columns={columns}
            rows={logRows}
            getRowKey={(l) => l.id}
            pageSize={10}
            initialSort={{ id: 'at', desc: true }}
            rowClassName={(l) => (l.ok ? undefined : 'bg-accent-soft/40')}
            resetPageKey={`${logQuery}|${logResult}|${logDirection}|${logIntegrationId}`}
            empty={
              logFilters ? (
                <NoMatch title="No requests match" onClear={clearLogFilters} />
              ) : (
                <EmptyState
                  compact
                  title="No requests yet"
                  description="Lines appear as connected systems send and receive events."
                />
              )
            }
            {...table}
          />
        </Card>
      </div>
    </>
  )
}

function ConnectionCard({
  integration: i,
  now,
  focused,
  manage,
  syncing,
  onToggle,
  onSync,
}: {
  integration: Integration
  now: number
  focused: boolean
  manage: boolean
  syncing: boolean
  onToggle: () => void
  onSync: () => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <Card id={`integration-${i.id}`} className={cn('p-5 flex flex-col', focused && 'ring-2 ring-accent')}>
      <div className="gap-3 flex items-start justify-between">
        <div className="min-w-0 gap-3 flex items-center">
          <IconTile tone={HEALTH_TONE[i.health]}>{CATEGORY_ICON[i.category]}</IconTile>
          <div className="min-w-0">
            <p className="font-semibold truncate">{i.provider}</p>
            <p className="text-xs text-muted">{INTEGRATION_CATEGORY_LABEL[i.category]}</p>
          </div>
        </div>
        <HealthBadge health={i.health} />
      </div>
      <p className="mt-3 text-xs truncate font-mono text-muted" title={i.endpoint}>
        {i.endpoint}
      </p>
      <div className="mt-3 gap-2 text-xs flex flex-wrap items-center justify-between text-muted">
        <span>Last sync {i.lastSyncAt ? fmtAgo(i.lastSyncAt, now) : 'never'}</span>
        <span className="tabular-nums">
          {plural(i.events24h, 'event')} ·{' '}
          <span className={cn(i.errors24h > 0 && 'font-semibold text-accent-strong')}>
            {plural(i.errors24h, 'error')}
          </span>{' '}
          in 24 h
        </span>
      </div>
      {i.health === 'failing' ? (
        <div className="mt-3 gap-2 rounded-2xl px-3 py-2 flex flex-wrap items-center justify-between bg-danger-soft">
          <p className="min-w-0 text-sm flex-1 text-accent-strong">{i.note}</p>
          {manage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast('Reconnect link sent', {
                  description: `The ${i.provider} shop owner got an authorisation link by email. Orders resume once they approve it.`,
                })
              }
            >
              Reconnect
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-body">{i.note}</p>
      )}
      {manage && (
        <div className="pt-4 mt-auto">
          <div className="gap-2 pt-4 flex flex-wrap items-center justify-between border-t border-border">
            <label className="gap-2 text-sm flex items-center">
              <Switch
                size="sm"
                checked={i.enabled}
                aria-label={`Turn ${i.provider} on or off`}
                onCheckedChange={onToggle}
              />
              {i.enabled ? 'On' : 'Off'}
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={!HTTP}
              title={HTTP ? undefined : 'Connector credentials need the API. Set VITE_API_URL.'}
              onClick={() => setEditing(true)}
            >
              <KeyRound />
              Credentials
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={syncing}
              disabled={!i.enabled}
              title={i.enabled ? undefined : `Turn ${i.provider} on to sync it.`}
              onClick={onSync}
            >
              <RefreshCw />
              Sync now
            </Button>
          </div>
        </div>
      )}
      {editing && <ConnectorDialog integration={i} onClose={() => setEditing(false)} />}
    </Card>
  )
}
