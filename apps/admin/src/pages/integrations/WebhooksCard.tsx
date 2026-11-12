import type { IssuedWebhook, WebhookDelivery, WebhookEndpoint, WebhookList } from '@rc/api'
import { fmtWhen } from '@rc/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  toast,
} from '@rc/ui'
import { Plus, Webhook } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'
import { SecretDialog } from './SecretDialog'

const DELIVERY_VARIANT = { pending: 'warning', delivered: 'success', failed: 'danger' } as const
const POLL_MS = 5_000

/** Webhook endpoints of a brand and what was sent to them. `onChange` refreshes the audit trail. */
export function WebhooksCard({ onChange }: { onChange: () => void }) {
  const { tenant } = useScoped()
  const now = useNow(30_000)
  const [data, setData] = useState<WebhookList | null>(null)
  const [adding, setAdding] = useState(false)
  const [issued, setIssued] = useState<IssuedWebhook | null>(null)
  const [rotating, setRotating] = useState<WebhookEndpoint | null>(null)
  const [removing, setRemoving] = useState<WebhookEndpoint | null>(null)

  const load = useCallback(() => {
    api.webhooks
      .list(tenant.id)
      .then(setData)
      .catch((e: Error) => toast('Could not load webhooks', { tone: 'danger', description: e.message }))
  }, [tenant.id])
  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  /** Runs a change, then refreshes both this card and the audit trail. */
  const act = (run: Promise<unknown>, done: string) =>
    run
      .then(() => {
        toast(done)
        load()
        onChange()
      })
      .catch((e: Error) => toast('That did not work', { tone: 'danger', description: e.message }))

  const urlOf = (id: string) => data?.endpoints.find((w) => w.id === id)?.url ?? 'Removed'

  const columns: Column<WebhookEndpoint>[] = [
    {
      id: 'url',
      header: 'Endpoint',
      cell: (w) => (
        <div className="min-w-0">
          <p className="text-sm font-mono break-all">{w.url}</p>
          <p className="text-xs text-muted">{w.events.join(', ')}</p>
        </div>
      ),
    },
    {
      id: 'state',
      header: 'State',
      cell: (w) => <Badge variant={w.enabled ? 'success' : 'outline'}>{w.enabled ? 'On' : 'Paused'}</Badge>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (w) => (
        <div className="gap-2 md:flex-row flex flex-col items-end justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => act(api.webhooks.test(w.id), 'Test event queued')}
          >
            Send test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              act(
                api.webhooks.setEnabled(w.id, !w.enabled),
                w.enabled ? 'Endpoint paused' : 'Endpoint resumed',
              )
            }
          >
            {w.enabled ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRotating(w)}>
            Rotate
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRemoving(w)}>
            Remove
          </Button>
        </div>
      ),
    },
  ]

  const deliveryColumns: Column<WebhookDelivery>[] = [
    {
      id: 'at',
      header: 'Time',
      cell: (d) => (
        <span className="text-xs whitespace-nowrap tabular-nums">{fmtWhen(d.createdAt, now)}</span>
      ),
    },
    { id: 'event', header: 'Event', cell: (d) => <span className="text-xs font-mono">{d.event}</span> },
    {
      id: 'endpoint',
      header: 'Endpoint',
      hideBelow: 'lg',
      cell: (d) => <span className="text-xs font-mono text-muted">{urlOf(d.endpointId)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (d) => (
        <span title={d.lastError ?? undefined}>
          <Badge variant={DELIVERY_VARIANT[d.status]}>{d.status}</Badge>
        </span>
      ),
    },
    {
      id: 'result',
      header: 'Result',
      hideBelow: 'md',
      cell: (d) => (
        <span className="text-xs text-muted">
          {d.lastError ?? (d.lastStatus ? `Answered ${d.lastStatus}` : 'Waiting')} · {d.attempts}×
        </span>
      ),
    },
    {
      id: 'retry',
      header: <span className="sr-only">Retry</span>,
      align: 'right',
      cell: (d) =>
        d.status === 'failed' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => act(api.webhooks.retry(d.id), 'Delivery queued again')}
          >
            Retry
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <Card>
        <CardHeader
          action={
            data && (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus />
                Add endpoint
              </Button>
            )
          }
        >
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            WIT Commerce tells your systems when something changes. Each delivery is signed in
            X-Commerce-Signature and retried for about a day.
          </CardDescription>
        </CardHeader>
        <DataTable
          columns={columns}
          rows={data?.endpoints ?? []}
          getRowKey={(w) => w.id}
          pageSize={5}
          empty={
            <EmptyState
              compact
              icon={<Webhook />}
              title={data ? 'No endpoints yet' : 'Loading endpoints'}
              description="Add an https address to receive order, customer, product and stock events."
            />
          }
        />
      </Card>

      {!!data?.deliveries.length && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook deliveries</CardTitle>
            <CardDescription>The latest 50, newest first.</CardDescription>
          </CardHeader>
          <DataTable
            columns={deliveryColumns}
            rows={data.deliveries}
            getRowKey={(d) => String(d.id)}
            pageSize={10}
          />
        </Card>
      )}

      {adding && data && (
        <AddEndpointDialog
          tenantId={tenant.id}
          events={data.events}
          onClose={() => setAdding(false)}
          onIssued={(result) => {
            setAdding(false)
            setIssued(result)
            load()
            onChange()
          }}
        />
      )}
      {issued && (
        <SecretDialog
          title={`Copy the signing secret for ${issued.endpoint.url}`}
          secret={issued.secret}
          onClose={() => setIssued(null)}
        />
      )}
      <ConfirmDialog
        open={!!rotating}
        onOpenChange={(open) => !open && setRotating(null)}
        title="Rotate the signing secret?"
        description="Deliveries are signed with the new secret at once. The receiver rejects them until it has the new one."
        confirmLabel="Rotate secret"
        destructive
        onConfirm={() => {
          if (!rotating) return
          const id = rotating.id
          setRotating(null)
          api.webhooks
            .rotate(id)
            .then((result) => {
              setIssued(result)
              onChange()
            })
            .catch((e: Error) =>
              toast('The secret was not rotated', { tone: 'danger', description: e.message }),
            )
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this endpoint?"
        description="It stops receiving events, and its delivery history goes with it. This cannot be undone."
        confirmLabel="Remove endpoint"
        destructive
        onConfirm={() => {
          if (!removing) return
          const id = removing.id
          setRemoving(null)
          void act(api.webhooks.remove(id), 'Endpoint removed')
        }}
      />
    </>
  )
}

function AddEndpointDialog({
  tenantId,
  events,
  onClose,
  onIssued,
}: {
  tenantId: string
  events: string[]
  onClose: () => void
  onIssued: (issued: IssuedWebhook) => void
}) {
  const [url, setUrl] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlError = tried && !url.trim() ? 'Enter the address that receives the events.' : undefined
  const eventError = tried && !picked.length ? 'Choose at least one event.' : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!url.trim() || !picked.length) return
    setSaving(true)
    try {
      onIssued(await api.webhooks.create(tenantId, { url: url.trim(), events: picked }))
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription>
              Answer with any 2xx status. Other answers retry for about a day.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Banner tone="danger" title="The endpoint was not added" className="mb-4">
              {error}
            </Banner>
          )}
          <div className="gap-4 grid grid-cols-1">
            <FormField label="Address" htmlFor="hook-url" required error={urlError}>
              <Input
                id="hook-url"
                inputMode="url"
                placeholder="https://erp.example.com/commerce-os"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </FormField>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">Events</legend>
              <div className="gap-2 flex flex-wrap">
                {events.map((name) => (
                  <Chip
                    key={name}
                    active={picked.includes(name)}
                    onClick={() =>
                      setPicked((list) =>
                        list.includes(name) ? list.filter((x) => x !== name) : [...list, name],
                      )
                    }
                  >
                    {name}
                  </Chip>
                ))}
              </div>
              {eventError && <p className="mt-1.5 text-xs text-accent-strong">{eventError}</p>}
            </fieldset>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add endpoint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
