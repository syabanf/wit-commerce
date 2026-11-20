import { ApiError, type AuditChange, type AuditEntry } from '@rc/api'
import { fmtDateTime, plural } from '@rc/fixtures'
import { Button, Card, CardDescription, CardHeader, CardTitle } from '@rc/ui'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/auth'
import { HTTP, api } from '../lib/api'
import { useScoped } from '../state/scoped'

export const apiMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'The server did not answer.')

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'empty'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

/** One line per changed field: "price: 150000 → 175000", or "email changed" for redacted values. */
export function changeLines(c: AuditChange): string[] {
  if (c.op === 'more') return [`${plural(c.more ?? 0, 'more row')} not listed`]
  if (c.op === 'delete') return ['Deleted']
  const fields = Object.entries(c.fields ?? {})
  if (c.op === 'create' && fields.length === 0) return ['Created']
  return fields.map(([name, v]) => {
    if (v === 'changed') return `${name} changed`
    return c.op === 'create' ? `${name}: ${show(v.after)}` : `${name}: ${show(v.before)} → ${show(v.after)}`
  })
}

export const actorLabel = (e: AuditEntry) =>
  e.actorKind === 'api_key' ? `${e.actorName || 'API key'} (API key)` : e.actorName || e.actorId

/** The changes of one entry, row by row. */
export function AuditChanges({ entry }: { entry: AuditEntry }) {
  return (
    <ul className="space-y-2">
      {entry.changes.map((c, i) => (
        <li key={i} className="min-w-0">
          {c.op !== 'more' && (
            <p className="text-xs text-muted break-all">
              {c.op} · {c.collection} {c.id}
            </p>
          )}
          <ul className="text-sm">
            {changeLines(c).map((line, j) => (
              <li key={j} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/** The audit rows of one record, for its detail page. Shown to people who manage users. */
export function AuditHistoryCard({ collection, entityId }: { collection: string; entityId: string }) {
  const { can } = useAuth()
  const s = useScoped()
  const allowed = HTTP && can('user.manage')
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [next, setNext] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (before?: string) => {
      setBusy(true)
      setError(null)
      try {
        const page = await api.audit.list(s.tenantId, { collection, entityId, before, limit: 10 })
        setEntries((shown) => (before ? [...(shown ?? []), ...page.entries] : page.entries))
        setNext(page.nextBefore)
      } catch (err) {
        setError(apiMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [s.tenantId, collection, entityId],
  )

  useEffect(() => {
    if (allowed) void load()
  }, [allowed, load])

  if (!allowed) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Who changed this record, from the audit log.</CardDescription>
      </CardHeader>
      <div className="px-5 pb-5">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : entries === null ? (
          <p className="text-sm text-muted">Loading the history…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">No recorded changes yet.</p>
        ) : (
          <>
            <ol className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="py-3">
                  <details>
                    <summary className="gap-x-3 gap-y-1 flex cursor-pointer list-none flex-wrap items-baseline justify-between">
                      <span className="text-sm min-w-0 break-words">
                        <span className="font-medium">{actorLabel(e)}</span> · {e.action}
                      </span>
                      <time dateTime={e.at} className="text-xs text-muted">
                        {fmtDateTime(e.at)}
                      </time>
                    </summary>
                    <div className="mt-2 p-3 rounded-xl bg-surface">
                      <AuditChanges entry={e} />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
            {next && (
              <Button variant="outline" size="sm" className="mt-3" loading={busy} onClick={() => void load(next)}>
                Show older changes
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
