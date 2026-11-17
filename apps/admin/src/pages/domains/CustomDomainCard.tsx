import {
  type DomainRecord,
  type DomainStatus,
  DOMAIN_TAKEN,
  customDomain,
  domainProblem,
  domainRecords,
  domainTaken,
  fmtDate,
  newDomainToken,
} from '@rc/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  FormField,
  IconTile,
  Input,
  toast,
} from '@rc/ui'
import { Check, Copy, Globe, Link2, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { STORE_HOSTS, STORE_ROOT } from '../../lib/storefront'
import { useScoped } from '../../state/scoped'
import { platformHost } from './lib'

const copy = (label: string, text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined)
  toast(`${label} copied`, { tone: 'success', description: text })
}

/** Where shoppers reach the store: the platform address, and the brand's own domain once DNS proves it. */
export function CustomDomainCard() {
  const { tenant } = useScoped()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domains</CardTitle>
        <CardDescription>
          Your store always opens on its platform address. Connect a domain you own and shoppers can use that
          too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2">
          <IconTile size="sm" className="bg-card">
            <Globe />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate font-mono">{platformHost(tenant)}</p>
            <p className="text-xs text-muted">Platform address, always on</p>
          </div>
        </div>
        {STORE_HOSTS ? (
          // The editor starts over when the brand switches or its domain changes.
          <DomainEditor key={`${tenant.id}:${tenant.domain ?? ''}:${tenant.domainToken ?? ''}`} />
        ) : (
          <p className="text-xs text-muted">
            Custom domains need each store on its own address. Ask the platform team to set STORE_ROOT_DOMAIN.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DomainEditor() {
  const s = useScoped()
  const { tenant } = s
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'check' | 'disconnect' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState<DomainStatus | null>(null)
  const [demoChecked, setDemoChecked] = useState(false)

  // The server knows every record the platform accepts, A records included; the demo lists its own.
  const [serverRecords, setServerRecords] = useState<DomainRecord[] | null>(null)
  useEffect(() => {
    if (!HTTP || !tenant.domain || !canManage) return
    let cancelled = false
    api
      .domain(tenant.id)
      .then((d) => !cancelled && setServerRecords(d.records))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [tenant.id, tenant.domain, canManage])
  const records = status?.records ?? serverRecords ?? domainRecords(tenant, STORE_ROOT)
  const verified = customDomain(tenant) !== null

  const save = async (domain: string) => {
    setBusy('connect')
    try {
      await s.dispatchAsync({
        type: 'tenants/setDomain',
        tenantId: tenant.id,
        domain,
        token: newDomainToken(),
      })
      toast('Domain added', {
        tone: 'success',
        description: `Add the records below at ${domain}'s DNS provider.`,
      })
    } catch (err) {
      setError((err as Error).message)
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setBusy(null)
  }

  const connect = (e: FormEvent) => {
    e.preventDefault()
    const domain = draft
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
    const problem = domainProblem(domain, [STORE_ROOT, window.location.hostname])
    if (problem) return setError(problem)
    if (domainTaken(s.state.tenants, tenant.id, domain)) return setError(DOMAIN_TAKEN)
    void save(domain)
  }

  const check = async () => {
    setBusy('check')
    try {
      // Demo mode has no DNS to ask: the check waits a moment, then passes.
      if (!HTTP) await new Promise((resolve) => window.setTimeout(resolve, 900))
      const delta = await s.dispatchAsync({ type: 'tenants/verifyDomain', tenantId: tenant.id })
      if (delta?.domainStatus) {
        setStatus(delta.domainStatus)
        toast(delta.domainStatus.verified ? 'Domain verified' : 'Not verified yet', {
          tone: delta.domainStatus.verified ? 'success' : undefined,
          description: delta.domainStatus.verified
            ? `${tenant.domain} now opens your store.`
            : delta.domainStatus.detail,
        })
      } else {
        setDemoChecked(true)
        toast('Domain verified (demo)', { tone: 'success', description: 'The demo does not ask DNS.' })
      }
    } catch (err) {
      toast('Check failed', { tone: 'danger', description: (err as Error).message })
    }
    setBusy(null)
  }

  const disconnect = async () => {
    setConfirming(false)
    setBusy('disconnect')
    try {
      await s.dispatchAsync({ type: 'tenants/setDomain', tenantId: tenant.id, domain: null, token: '' })
      toast('Domain disconnected', { description: `${tenant.domain} no longer opens your store.` })
    } catch (err) {
      toast('Not disconnected', { tone: 'danger', description: (err as Error).message })
    }
    setBusy(null)
  }

  if (!tenant.domain) {
    if (!canManage) return <p className="text-xs text-muted">No custom domain. Your role cannot add one.</p>
    return (
      <form onSubmit={connect} className="rounded-2xl p-3 space-y-3 bg-surface-2">
        <FormField
          label="Your domain"
          hint="The address you bought, for example www.yourstore.com. You add two records for it next."
          error={error}
        >
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            placeholder="www.yourstore.com"
            autoCapitalize="none"
            spellCheck={false}
            leftIcon={<Link2 />}
          />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" loading={busy === 'connect'} disabled={!draft.trim()}>
            Connect domain
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="rounded-2xl p-3 space-y-3 bg-surface-2">
      <div className="gap-3 flex flex-wrap items-center">
        <IconTile size="sm" className="bg-card">
          <Link2 />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate font-mono">{tenant.domain}</p>
          <p className="text-xs text-muted">
            {verified && tenant.domainVerifiedAt
              ? `Verified ${fmtDate(tenant.domainVerifiedAt)}. Shoppers and links use this address.`
              : 'Not verified yet. Shoppers keep using the platform address until it is.'}
          </p>
        </div>
        {verified ? (
          <Badge variant="success">
            <ShieldCheck />
            Verified
          </Badge>
        ) : (
          <Badge variant="warning">Not verified</Badge>
        )}
      </div>

      {canManage && !verified && (
        <p className="text-xs text-muted">
          A DNS record is a line in your domain's settings that tells the internet where it leads. Sign in
          where you bought the domain or where its DNS is managed, open its DNS settings, and add each record
          below. A change can take up to a day to show.
        </p>
      )}

      {canManage && !tenant.domainToken && (
        <div className="gap-2 flex flex-wrap items-center justify-between">
          <p className="text-xs text-muted">
            This domain was added before DNS checks. Get its records to verify it.
          </p>
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'connect'}
            onClick={() => void save(tenant.domain!)}
          >
            Get verification records
          </Button>
        </div>
      )}
      {canManage && tenant.domainToken && records.length > 0 && (
        <ul className="space-y-2">
          {records.map((r) => (
            <RecordRow key={`${r.type}:${r.value}`} record={r} demoOk={demoChecked} />
          ))}
        </ul>
      )}
      {status?.detail && !status.verified && (
        <p className="text-xs font-medium text-warning">{status.detail}</p>
      )}

      <p className="text-xs text-muted">
        HTTPS on your own domain depends on how the platform's proxy is set up. Ask the platform team if the
        address shows a certificate warning.
      </p>

      {canManage && (
        <div className="gap-2 flex flex-wrap items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            loading={busy === 'disconnect'}
            onClick={() => setConfirming(true)}
          >
            Disconnect
          </Button>
          <Button size="sm" loading={busy === 'check'} disabled={!tenant.domainToken} onClick={check}>
            <RefreshCw />
            Check DNS
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disconnect ${tenant.domain}?`}
        description="The store stops opening on this domain and links go back to the platform address. You can connect it again later and verify it with a new record."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnect}
      />
    </div>
  )
}

function RecordRow({ record, demoOk }: { record: DomainRecord; demoOk: boolean }) {
  const ok = record.ok ?? (demoOk ? true : undefined)
  const what = {
    TXT: 'Proves the domain is yours',
    CNAME: 'Points the domain at your store',
    A: 'Or, for a domain without www, points it at this address',
  }[record.type]
  return (
    <li className="rounded-xl p-3 space-y-2 bg-card">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <span className="gap-2 text-xs flex items-center">
          <Badge>{record.type}</Badge>
          <span className="text-muted">{what}</span>
        </span>
        {ok === true && (
          <Badge variant="success">
            <Check />
            Found
          </Badge>
        )}
        {ok === false && (
          <Badge variant="warning">
            <X />
            {record.found?.length ? 'Wrong value' : 'Missing'}
          </Badge>
        )}
      </div>
      <CopyLine label="Name" value={record.name} />
      <CopyLine label="Value" value={record.value} />
      {ok === false && record.found?.length ? (
        <p className="text-xs break-all text-muted">
          DNS answered <span className="font-mono">{record.found.join(', ')}</span>
        </p>
      ) : null}
    </li>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="gap-2 flex items-center">
      <span className="w-12 text-xs shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-xs flex-1 font-mono break-all">{value}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => copy(label, value)}
      >
        <Copy />
      </Button>
    </div>
  )
}
