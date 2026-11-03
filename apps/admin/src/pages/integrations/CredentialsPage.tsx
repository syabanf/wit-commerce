import type { ApiCredential, CredentialEvent, CredentialList, IssuedCredential } from '@rc/api'
import { fmtAgo, fmtDate, fmtWhen, fromInput, plural } from '@rc/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
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
  PageHeader,
  toast,
} from '@rc/ui'
import { Copy, ExternalLink, KeyRound, Plus } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { API_URL, HTTP, api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'
import { apiBaseUrl, copyText } from './lib'
import { SecretDialog } from './SecretDialog'
import { WebhooksCard } from './WebhooksCard'

const STATUS_VARIANT = { active: 'success', expired: 'warning', revoked: 'outline' } as const
const ACTION_LABEL: Record<string, string> = {
  created: 'Created',
  rotated: 'Rotated',
  revoked: 'Revoked',
  updated: 'Updated',
  cleared: 'Cleared',
  paused: 'Paused',
  resumed: 'Resumed',
  removed: 'Removed',
}

/** Integrations → API credentials: the keys outside systems call this API with, and its contract. */
export function CredentialsPage() {
  const { tenant, userName } = useScoped()
  const { can } = useAuth()
  const manage = can('integration.manage')
  const now = useNow(30_000)
  const [data, setData] = useState<CredentialList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<IssuedCredential | null>(null)
  const [rotating, setRotating] = useState<ApiCredential | null>(null)
  const [revoking, setRevoking] = useState<ApiCredential | null>(null)

  const load = useCallback(() => {
    if (!HTTP || !manage) return
    api.credentials
      .list(tenant.id)
      .then((list) => {
        setData(list)
        setLoadError(null)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [tenant.id, manage])
  useEffect(load, [load])

  const fail = (title: string) => (e: Error) => toast(title, { tone: 'danger', description: e.message })
  const baseUrl = apiBaseUrl(API_URL)

  const columns: Column<ApiCredential>[] = [
    {
      id: 'name',
      header: 'Name',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-semibold truncate">{c.name}</p>
          <p className="text-xs font-mono text-muted">{c.prefix}…</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (c) => c.status,
      cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>,
    },
    {
      id: 'scopes',
      header: 'Scopes',
      hideBelow: 'lg',
      cell: (c) => (
        <span className="text-xs font-mono text-muted" title={c.scopes.join(', ')}>
          {c.scopes.slice(0, 2).join(', ')}
          {c.scopes.length > 2 ? ` +${c.scopes.length - 2}` : ''}
        </span>
      ),
    },
    {
      id: 'used',
      header: 'Last used',
      hideBelow: 'md',
      sortValue: (c) => c.lastUsedAt ?? '',
      cell: (c) => (
        <span className="text-xs whitespace-nowrap">
          {c.lastUsedAt ? fmtAgo(c.lastUsedAt, now) : 'Never'}
          <span className="block text-muted">{plural(c.requests24h, 'request')} in 24 h</span>
        </span>
      ),
    },
    {
      id: 'expires',
      header: 'Expires',
      hideBelow: 'md',
      sortValue: (c) => c.expiresAt ?? '',
      cell: (c) => (
        <span className="text-xs whitespace-nowrap">{c.expiresAt ? fmtDate(c.expiresAt) : 'Never'}</span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (c) =>
        c.status === 'revoked' ? null : (
          <div className="gap-2 sm:flex-row flex flex-col items-end justify-end">
            <Button variant="outline" size="sm" onClick={() => setRotating(c)}>
              Rotate
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRevoking(c)}>
              Revoke
            </Button>
          </div>
        ),
    },
  ]

  const eventColumns: Column<CredentialEvent>[] = [
    {
      id: 'at',
      header: 'Time',
      cell: (e) => <span className="text-xs whitespace-nowrap tabular-nums">{fmtWhen(e.at, now)}</span>,
    },
    { id: 'subject', header: 'Credential', cell: (e) => <span className="text-sm">{e.subject}</span> },
    {
      id: 'action',
      header: 'Action',
      cell: (e) => <Badge variant="outline">{ACTION_LABEL[e.action] ?? e.action}</Badge>,
    },
    {
      id: 'by',
      header: 'By',
      hideBelow: 'sm',
      cell: (e) => <span className="text-xs">{userName(e.by)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="API credentials"
        description="Keys that let outside systems call Commerce OS for this brand, and the reference they build against."
        actions={
          HTTP && manage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New API key
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            API keys live on the server. Build the console with VITE_API_URL to create and rotate them.
          </Banner>
        )}
        {HTTP && !manage && (
          <Banner tone="neutral" title="Ask an admin">
            Your role cannot manage credentials. A tenant admin can create a key for you.
          </Banner>
        )}
        {loadError && (
          <Banner
            tone="danger"
            title="Could not load the credentials"
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}

        {HTTP && manage && (
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <CardDescription>
                A key reads and writes {tenant.name} only, within its scopes, up to 600 requests a minute.
              </CardDescription>
            </CardHeader>
            <DataTable
              columns={columns}
              rows={data?.credentials ?? []}
              getRowKey={(c) => c.id}
              pageSize={10}
              empty={
                <EmptyState
                  compact
                  icon={<KeyRound />}
                  title={data ? 'No API keys yet' : 'Loading keys'}
                  description="Create one for each system that connects, so you can revoke it alone."
                />
              }
            />
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Developer access</CardTitle>
            <CardDescription>The OpenAPI document describes every endpoint, scope and error.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormField label="REST base URL" hint="Send the key as Authorization: Bearer rck_… or X-Api-Key.">
              <div className="gap-2 flex items-center">
                <Input
                  readOnly
                  value={baseUrl}
                  className="min-w-0 flex-1"
                  inputClassName="bg-surface font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy the base URL"
                  onClick={() => copyText(baseUrl, 'the base URL')}
                >
                  <Copy />
                </Button>
              </div>
            </FormField>
            <div className="gap-2 flex flex-wrap">
              <a
                className="h-10 gap-2 px-4 text-sm font-semibold inline-flex items-center rounded-full border border-border bg-card hover:bg-surface"
                href={`${baseUrl}/docs`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                API reference
              </a>
              <a
                className="h-10 gap-2 px-4 text-sm font-semibold inline-flex items-center rounded-full border border-border bg-card hover:bg-surface"
                href={`${baseUrl}/openapi.json`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                openapi.json
              </a>
            </div>
          </CardContent>
        </Card>

        {HTTP && manage && <WebhooksCard onChange={load} />}

        {HTTP && manage && !!data?.events.length && (
          <Card>
            <CardHeader>
              <CardTitle>Credential activity</CardTitle>
              <CardDescription>
                API keys and connector values, newest first. Values never appear here.
              </CardDescription>
            </CardHeader>
            <DataTable
              columns={eventColumns}
              rows={data.events}
              getRowKey={(e) => String(e.id)}
              pageSize={10}
            />
          </Card>
        )}
      </div>

      {creating && data && (
        <NewKeyDialog
          tenantId={tenant.id}
          scopes={data.scopes}
          onClose={() => setCreating(false)}
          onIssued={(result) => {
            setCreating(false)
            setIssued(result)
            load()
          }}
        />
      )}
      {issued && (
        <SecretDialog
          title={`Copy the secret for ${issued.credential.name}`}
          secret={issued.secret}
          onClose={() => setIssued(null)}
        />
      )}
      <ConfirmDialog
        open={!!rotating}
        onOpenChange={(open) => !open && setRotating(null)}
        title={`Rotate ${rotating?.name}?`}
        description="The current secret stops working at once. The system that uses it fails until you paste the new one in."
        confirmLabel="Rotate key"
        destructive
        onConfirm={() => {
          if (!rotating) return
          setRotating(null)
          api.credentials
            .rotate(rotating.id)
            .then((result) => {
              setIssued(result)
              load()
            })
            .catch(fail('The key was not rotated'))
        }}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke ${revoking?.name}?`}
        description="The key stops working for good. This cannot be undone; create a new key to connect again."
        confirmLabel="Revoke key"
        destructive
        onConfirm={() => {
          if (!revoking) return
          const name = revoking.name
          setRevoking(null)
          api.credentials
            .revoke(revoking.id)
            .then(() => {
              toast('API key revoked', { description: name })
              load()
            })
            .catch(fail('The key was not revoked'))
        }}
      />
    </>
  )
}

function NewKeyDialog({
  tenantId,
  scopes,
  onClose,
  onIssued,
}: {
  tenantId: string
  scopes: CredentialList['scopes']
  onClose: () => void
  onIssued: (issued: IssuedCredential) => void
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [expires, setExpires] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameError = tried && !name.trim() ? 'Name the system that will use this key.' : undefined
  const scopeError = tried && !picked.length ? 'Choose at least one scope.' : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!name.trim() || !picked.length) return
    setSaving(true)
    try {
      onIssued(
        await api.credentials.create(tenantId, {
          name: name.trim(),
          scopes: picked,
          expiresAt: expires ? fromInput(expires) : null,
        }),
      )
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
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>
              Give each system its own key, with only the scopes it needs.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Banner tone="danger" title="The key was not created" className="mb-4">
              {error}
            </Banner>
          )}
          <div className="gap-4 grid grid-cols-1">
            <FormField label="Name" htmlFor="key-name" required error={nameError}>
              <Input
                id="key-name"
                placeholder="Accurate ERP sync"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">Scopes</legend>
              <div className="gap-2 flex flex-wrap">
                {scopes.map((s) => (
                  <Chip
                    key={s.id}
                    active={picked.includes(s.id)}
                    title={s.label}
                    onClick={() =>
                      setPicked((list) =>
                        list.includes(s.id) ? list.filter((x) => x !== s.id) : [...list, s.id],
                      )
                    }
                  >
                    {s.id}
                  </Chip>
                ))}
              </div>
              <p className={scopeError ? 'mt-1.5 text-xs text-accent-strong' : 'mt-1.5 text-xs text-muted'}>
                {scopeError ?? 'Write includes read of the same resource.'}
              </p>
            </fieldset>
            <FormField
              label="Expires"
              htmlFor="key-expires"
              hint="Leave empty for a key that lasts until revoked."
            >
              <Input
                id="key-expires"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
