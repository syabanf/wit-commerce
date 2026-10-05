import { fmtAgo, fmtNumber, fmtWhen, plural, toMs } from '@rc/fixtures'
import type { Integration, IntegrationCategory, IntegrationLog } from '@rc/types'
import { INTEGRATION_CATEGORY_LABEL } from '@rc/types'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  IconTile,
  Input,
  PageHeader,
  PillTabs,
  Switch,
  cn,
  toast,
} from '@rc/ui'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Copy,
  CreditCard,
  MessageCircle,
  RefreshCw,
  Store,
  Truck,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { HEALTH_TONE, HealthBadge } from '../../components/badges'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { CATEGORY_ORDER, SYNC_DELAY_MS, WEBHOOK_EVENTS, apiBaseUrl } from './lib'

const CATEGORY_ICON: Record<IntegrationCategory, ReactNode> = {
  payment: <CreditCard />,
  logistics: <Truck />,
  enterprise: <Building2 />,
  marketing: <MessageCircle />,
  marketplace: <Store />,
}

type Filter = IntegrationCategory | 'all'

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
          <DataTable
            columns={columns}
            rows={logs}
            getRowKey={(l) => l.id}
            pageSize={10}
            initialSort={{ id: 'at', desc: true }}
            rowClassName={(l) => (l.ok ? undefined : 'bg-accent-soft/40')}
            empty={
              <EmptyState
                compact
                title="No requests yet"
                description="Lines appear as connected systems send and receive events."
              />
            }
            {...table}
          />
        </Card>

        <DeveloperCard manage={manage} />
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
    </Card>
  )
}

function DeveloperCard({ manage }: { manage: boolean }) {
  const { tenant } = useScoped()
  const [rotating, setRotating] = useState(false)
  const baseUrl = apiBaseUrl(tenant)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(baseUrl)
      toast('Copied the API base URL', { description: baseUrl })
    } catch {
      toast('Could not copy the URL', {
        tone: 'danger',
        description: 'Select the address and copy it by hand.',
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Developer access</CardTitle>
        <CardDescription>
          REST API and webhooks for systems this console does not connect out of the box.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
          <FormField label="REST base URL" hint="Send the API key as a bearer token on every request.">
            <div className="gap-2 flex items-center">
              <Input
                readOnly
                value={baseUrl}
                inputClassName="bg-surface font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="outline" size="icon" aria-label="Copy the base URL" onClick={copy}>
                <Copy />
              </Button>
            </div>
          </FormField>
          <FormField
            label="API key"
            hint="A key is stored. It is shown once, when it is created, and never comes back to this page."
          >
            <div className="gap-2 flex flex-wrap items-center">
              <Input
                type="password"
                value=""
                readOnly
                placeholder="••••••••••••••••"
                aria-readonly="true"
                className="min-w-0 flex-1"
              />
              {manage && (
                <Button variant="outline" onClick={() => setRotating(true)}>
                  Rotate key
                </Button>
              )}
            </div>
          </FormField>
        </div>
        <div>
          <p className="text-sm font-medium">Webhook events</p>
          <p className="mt-0.5 text-xs text-muted">
            Subscribe an endpoint to any of these events. Each delivery is signed and retried for 24 hours.
          </p>
          <ul className="mt-3 gap-2 flex flex-wrap">
            {WEBHOOK_EVENTS.map((e) => (
              <li
                key={e}
                className="h-8 px-3 text-xs font-semibold inline-flex items-center rounded-full bg-surface-2 font-mono"
              >
                {e}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={`Rotate the ${tenant.code} API key?`}
        description="The current key stops working at once. Systems that use it fail until you paste the new key into them."
        confirmLabel="Rotate key"
        destructive
        onConfirm={() => {
          setRotating(false)
          toast('API key rotated', {
            description: `${tenant.name} · the new key was emailed to the tenant admins.`,
          })
        }}
      />
    </Card>
  )
}
