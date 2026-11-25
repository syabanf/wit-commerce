import type { PrivacyRequest, PrivacyRequestKind } from '@rc/types'
import { MARKETING_CONSENT_VERSION } from '@rc/types'
import { useCallback, useEffect, useId, useState } from 'react'
import { Button, Field, describedBy, inputClass } from '../components/ui'
import { HTTP, api } from '../lib/api'
import { type MessageKey, t } from '../i18n'
import { problemText } from '../i18n/refusals'
import { fmtDate } from '../i18n/format'
import { useShop } from '../state/shop'
import { privacyKindLabel } from './accountLabels'

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
      .catch((err: unknown) => setError(problemText(err)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="sf-card space-y-3 p-6" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="sf-display text-xl font-bold">
        {t('account.privacy.offers')}
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
          <span className="font-semibold block">{t('account.privacy.consent')}</span>
          <span id={`${id}-box-hint`} className="text-[color:var(--sf-muted)]">
            {customer.marketingConsent
              ? t(on ? 'account.privacy.agreed' : 'account.privacy.declined', {
                  date: fmtDate(customer.marketingConsent.at),
                })
              : ''}
            {t('account.privacy.orderEmails')}
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

const ASK: { kind: PrivacyRequestKind; label: MessageKey; hint: MessageKey }[] = [
  { kind: 'access', label: 'account.privacy.access', hint: 'account.privacy.accessHint' },
  { kind: 'correction', label: 'account.privacy.correction', hint: 'account.privacy.correctionHint' },
  { kind: 'erasure', label: 'account.privacy.erasure', hint: 'account.privacy.erasureHint' },
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
    if (kind === 'correction' && !note.trim()) return setError(t('account.privacy.correctWhat'))
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
      .catch((err: unknown) => setError(problemText(err)))
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
      .catch((err: unknown) => setError(problemText(err)))
  }
  const ready = requests.some((r) => r.kind === 'access' && r.status === 'completed')
  const open = (k: PrivacyRequestKind) => requests.some((r) => r.kind === k && r.status === 'open')

  return (
    <section className="sf-card space-y-4 p-6" aria-labelledby={`${id}-h`}>
      <div>
        <h2 id={`${id}-h`} className="sf-display text-xl font-bold">
          {t('account.privacy.title')}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--sf-muted)]">{t('account.privacy.intro')}</p>
      </div>
      {requests.length > 0 && (
        <ul className="text-sm divide-y divide-[color:var(--sf-line)]">
          {requests.map((r) => (
            <li key={r.id} className="gap-2 py-2 flex flex-wrap items-center justify-between">
              <span className="font-semibold">{privacyKindLabel(r.kind)}</span>
              <span className="text-[color:var(--sf-muted)]">
                {r.status === 'open'
                  ? t('account.privacy.asked', { asked: fmtDate(r.requestedAt), due: fmtDate(r.dueAt) })
                  : t('account.privacy.done', { date: fmtDate(r.completedAt ?? r.dueAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ready && (
        <Button variant="outline" onClick={download}>
          {t('account.privacy.download')}
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
            {open(a.kind) ? t('account.privacy.askedLabel', { label: t(a.label) }) : t(a.label)}
          </Button>
        ))}
      </div>
      {kind && (
        <div className="space-y-3">
          <Field
            id={`${id}-note`}
            label={t('account.privacy.note')}
            error={error}
            hint={t(ASK.find((a) => a.kind === kind)!.hint)}
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
            {kind === 'erasure' ? t('account.privacy.askDelete') : t('account.sendRequest')}
          </Button>
        </div>
      )}
      {sent && (
        <p role="status" className="text-sm font-semibold">
          {t('account.privacy.sent')}
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
