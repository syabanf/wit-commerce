import { ApiError } from '@rc/api'
import { fmtDate } from '@rc/fixtures'
import type { PrivacyRequest, PrivacyRequestKind } from '@rc/types'
import { MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION, PRIVACY_REQUEST_KIND_LABEL } from '@rc/types'
import { useCallback, useEffect, useId, useState } from 'react'
import { Button, Field, describedBy, inputClass } from '../components/ui'
import { HTTP, api } from '../lib/api'
import { useShop } from '../state/shop'

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'The store did not answer. Try again in a moment.'

/** The shopper's own switch for offers and news. Order emails arrive either way. */
export function MarketingCard() {
  const { customer, send, reloadAccount } = useShop()
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!customer) return null
  const on = customer.marketingConsent?.granted === true

  const toggle = () => {
    setBusy(true)
    setError(null)
    send({
      type: 'customers/setConsent',
      id: customer.id,
      granted: !on,
      source: 'account',
      textVersion: MARKETING_CONSENT_VERSION,
    })
      .then(() => reloadAccount())
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="sf-card space-y-3 p-6" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="sf-display text-xl font-bold">
        Offers and news
      </h2>
      <label className="gap-3 flex items-start">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={toggle}
          className="mt-1 size-5 shrink-0 accent-[var(--sf-primary)]"
          {...describedBy(`${id}-box`, error, 'hint')}
        />
        <span className="text-sm">
          <span className="font-semibold block">{MARKETING_CONSENT_TEXT}</span>
          <span id={`${id}-box-hint`} className="text-[color:var(--sf-muted)]">
            {customer.marketingConsent
              ? `${on ? 'You agreed' : 'You said no'} on ${fmtDate(customer.marketingConsent.at)}. `
              : ''}
            Emails about your orders arrive either way.
          </span>
        </span>
      </label>
      {error && (
        <p id={`${id}-box-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}

const ASK: { kind: PrivacyRequestKind; label: string; hint: string }[] = [
  {
    kind: 'access',
    label: 'Get a copy of my data',
    hint: 'The store prepares a file you can download here.',
  },
  { kind: 'correction', label: 'Correct my data', hint: 'Say what is wrong in the note.' },
  {
    kind: 'erasure',
    label: 'Delete my data',
    hint: 'Your name and contact details are erased and you are signed out for good. Order amounts stay for the 10 years the law requires.',
  },
]

/** API mode: the shopper's requests about their personal data (UU PDP Pasal 5 to 13). */
export function PrivacyRequestsCard() {
  const { store } = useShop()
  const id = useId()
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [kind, setKind] = useState<PrivacyRequestKind | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!HTTP) return
    api.shop
      .privacyRequests(store)
      .then((r) => setRequests(r.requests))
      .catch(() => undefined)
  }, [store])
  useEffect(load, [load])
  if (!HTTP) return null

  const submit = () => {
    if (!kind) return
    if (kind === 'correction' && !note.trim()) return setError('Say what to correct.')
    setBusy(true)
    setError(null)
    api.shop
      .requestPrivacy(store, kind, note.trim())
      .then((r) => {
        setRequests(r.requests)
        setKind(null)
        setNote('')
        setSent(true)
      })
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setBusy(false))
  }

  const download = () => {
    api.shop
      .exportData(store)
      .then((data) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        )
        const link = document.createElement('a')
        link.href = url
        link.download = `${data.customer.code}-data.json`
        link.click()
        URL.revokeObjectURL(url)
      })
      .catch((err: unknown) => setError(messageOf(err)))
  }
  const ready = requests.some((r) => r.kind === 'access' && r.status === 'completed')
  const open = (k: PrivacyRequestKind) => requests.some((r) => r.kind === k && r.status === 'open')

  return (
    <section className="sf-card space-y-4 p-6" aria-labelledby={`${id}-h`}>
      <div>
        <h2 id={`${id}-h`} className="sf-display text-xl font-bold">
          Your data
        </h2>
        <p className="mt-1 text-sm text-[color:var(--sf-muted)]">
          Ask for a copy, a correction or the deletion of your data. The store answers within 3x24 hours.
        </p>
      </div>
      {requests.length > 0 && (
        <ul className="text-sm divide-y divide-[color:var(--sf-line)]">
          {requests.map((r) => (
            <li key={r.id} className="gap-2 py-2 flex flex-wrap items-center justify-between">
              <span className="font-semibold">{PRIVACY_REQUEST_KIND_LABEL[r.kind]}</span>
              <span className="text-[color:var(--sf-muted)]">
                {r.status === 'open'
                  ? `Asked ${fmtDate(r.requestedAt)} · answer by ${fmtDate(r.dueAt)}`
                  : `Done ${fmtDate(r.completedAt ?? r.dueAt)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ready && (
        <Button variant="outline" onClick={download}>
          Download my data
        </Button>
      )}
      <div className="gap-2 flex flex-wrap">
        {ASK.map((a) => (
          <Button
            key={a.kind}
            variant={kind === a.kind ? 'dark' : 'outline'}
            size="sm"
            disabled={open(a.kind)}
            onClick={() => {
              setKind(kind === a.kind ? null : a.kind)
              setSent(false)
              setError(null)
            }}
          >
            {open(a.kind) ? `${a.label}: asked` : a.label}
          </Button>
        ))}
      </div>
      {kind && (
        <div className="space-y-3">
          <Field
            id={`${id}-note`}
            label="Note for the store"
            error={error}
            hint={ASK.find((a) => a.kind === kind)!.hint}
          >
            <textarea
              id={`${id}-note`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              {...describedBy(`${id}-note`, error, 'hint')}
            />
          </Field>
          <Button variant={kind === 'erasure' ? 'dark' : 'primary'} disabled={busy} onClick={submit}>
            {kind === 'erasure' ? 'Ask to delete my data' : 'Send request'}
          </Button>
        </div>
      )}
      {sent && (
        <p role="status" className="text-sm font-semibold">
          Request sent. The store answers within 3x24 hours.
        </p>
      )}
      {!kind && error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
