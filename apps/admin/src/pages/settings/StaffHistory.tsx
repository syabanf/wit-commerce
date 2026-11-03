import { ApiError, type StaffEvent } from '@rc/api'
import { fmtDateTime } from '@rc/fixtures'
import { Button, Card, CardDescription, CardHeader, CardTitle, EmptyState } from '@rc/ui'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'

/** Reads as "<actor> <verb> <target>"; a person acting on themselves reads from their own name. */
const SENTENCE: Record<string, (actor: string, target: string) => string> = {
  created: (a, t) => `${a} added ${t}`,
  updated: (a, t) => `${a} edited ${t}`,
  disabled: (a, t) => `${a} disabled ${t}`,
  enabled: (a, t) => `${a} enabled ${t}`,
  password_reset: (a, t) => `${a} reset the password of ${t}`,
  invite_sent: (a, t) => `${a} sent an invitation to ${t}`,
  invite_failed: (a, t) => `An invitation from ${a} to ${t} did not go out`,
  invite_accepted: (_, t) => `${t} accepted the invitation`,
  password_changed: (_, t) => `${t} changed their password`,
  password_reset_by_link: (_, t) => `${t} reset their password from an email link`,
  admin_set_from_server: (_, t) => `A server command set the password of ${t}`,
}

const sentence = (e: StaffEvent) =>
  SENTENCE[e.action]?.(e.actorName, e.targetName) ?? `${e.actorName}: ${e.action} on ${e.targetName}`

/** Who changed which staff account in this brand. Reloads when `version` changes. */
export function StaffHistory({ tenantId, version }: { tenantId: string; version: number }) {
  const [events, setEvents] = useState<StaffEvent[] | null>(null)
  const [next, setNext] = useState<number | undefined>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (before?: number) => {
      setBusy(true)
      setError('')
      try {
        const page = await api.staff.events(tenantId, before)
        setEvents((shown) => (before ? [...(shown ?? []), ...page.events] : page.events))
        setNext(page.nextBefore)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The server did not answer.')
      } finally {
        setBusy(false)
      }
    },
    [tenantId],
  )

  useEffect(() => {
    void load()
  }, [load, version])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change history</CardTitle>
        <CardDescription>
          Who changed which account in this brand. Passwords never appear here.
        </CardDescription>
      </CardHeader>
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
        ) : events === null ? (
          <p className="text-sm text-muted">Loading the history…</p>
        ) : events.length === 0 ? (
          <EmptyState compact title="No changes yet" description="Adding or editing staff shows up here." />
        ) : (
          <>
            <ol className="divide-y divide-border">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="gap-x-4 gap-y-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between flex flex-col"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{sentence(e)}</p>
                    {e.detail && <p className="text-xs break-words text-muted">{e.detail}</p>}
                  </div>
                  <time dateTime={e.at} className="text-xs shrink-0 text-muted">
                    {fmtDateTime(e.at)}
                  </time>
                </li>
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
  )
}
