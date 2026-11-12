import type { ConnectionResult, ConnectorCredentials } from '@rc/api'
import { fmtAgo } from '@rc/fixtures'
import type { Integration } from '@rc/types'
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  toast,
} from '@rc/ui'
import { type FormEvent, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'

const RESULT_TONE = {
  ok: 'success',
  rejected: 'danger',
  unreachable: 'warning',
  incomplete: 'warning',
  unsupported: 'neutral',
} as const
const RESULT_TITLE = {
  ok: 'Connected',
  rejected: 'Rejected',
  unreachable: 'Not reached',
  incomplete: 'Values missing',
  unsupported: 'No live check',
} as const

/** The values WIT Commerce uses to call a provider. They go in and never come back out. */
export function ConnectorDialog({ integration, onClose }: { integration: Integration; onClose: () => void }) {
  const { userName } = useScoped()
  const now = useNow(30_000)
  const [state, setState] = useState<ConnectorCredentials | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ConnectionResult | null>(null)

  useEffect(() => {
    api.connector
      .get(integration.id)
      .then(setState)
      .catch((e: Error) => setError(e.message))
  }, [integration.id])

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await api.connector.test(integration.id))
    } catch (err) {
      setError((err as Error).message)
    }
    setTesting(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const changes: Record<string, string | null> = {}
    for (const key of cleared) changes[key] = null
    for (const [key, value] of Object.entries(values)) if (value.trim()) changes[key] = value
    if (!Object.keys(changes).length) return onClose()
    setSaving(true)
    try {
      const saved = await api.connector.save(integration.id, changes)
      toast('Credentials saved', {
        tone: 'success',
        description: saved.complete
          ? `${integration.provider} has every value it needs.`
          : `${integration.provider} still misses a required value.`,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate autoComplete="off">
          <DialogHeader>
            <DialogTitle>{integration.provider} credentials</DialogTitle>
            <DialogDescription>
              Stored encrypted. Nobody can read a value back here, so keep the original in your password
              manager.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Banner tone="danger" title="Could not finish" className="mb-4">
              {error}
            </Banner>
          )}
          <div className="gap-4 grid grid-cols-1">
            {state?.fields.map((f) => {
              const removing = cleared.has(f.key)
              const set = f.set && !removing
              return (
                <FormField
                  key={f.key}
                  label={f.label}
                  htmlFor={`connector-${f.key}`}
                  required={f.required}
                  hint={
                    set
                      ? `Set ${f.updatedAt ? fmtAgo(f.updatedAt, now) : ''} by ${userName(f.updatedBy)}. Leave empty to keep it.`
                      : removing
                        ? 'Clears when you save.'
                        : 'Not set yet.'
                  }
                >
                  <div className="gap-2 flex items-center">
                    <Input
                      id={`connector-${f.key}`}
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="new-password"
                      className="min-w-0 flex-1"
                      placeholder={set ? `•••• ${f.last4 ?? ''}` : ''}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                    {f.set && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setCleared((list) => {
                            const next = new Set(list)
                            if (removing) next.delete(f.key)
                            else next.add(f.key)
                            return next
                          })
                        }
                      >
                        {removing ? 'Keep' : 'Clear'}
                      </Button>
                    )}
                  </div>
                </FormField>
              )
            })}
            {state && (
              <div className="gap-2 flex flex-wrap items-center justify-between">
                <Badge variant={state.complete ? 'success' : 'warning'}>
                  {state.complete ? 'Complete' : 'Incomplete'}
                </Badge>
                <Button type="button" variant="outline" size="sm" loading={testing} onClick={test}>
                  Test saved values
                </Button>
              </div>
            )}
            {result && (
              <Banner tone={RESULT_TONE[result.outcome]} title={RESULT_TITLE[result.outcome]}>
                {result.detail}
                {result.ms > 0 && ` ${result.ms} ms.`}
              </Banner>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!state}>
              Save credentials
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
