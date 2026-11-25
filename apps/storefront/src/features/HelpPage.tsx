import { addWorkingDays, complaintBlocker, complaintDays, newId, nowIso } from '@rc/fixtures'
import type { Ticket } from '@rc/types'
import { CircleCheck, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Field, describedBy, inputClass } from '../components/ui'
import { paths, waLink } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { t, tx } from '../i18n'
import { problemText, refusalText } from '../i18n/refusals'
import { fmtDateTime } from '../i18n/format'
import { useShop } from '../state/shop'

/** The platform's complaint steps, used when the brand wrote none of its own. */
const defaultSteps = () => [
  t('account.help.step1'),
  t('account.help.step2'),
  t('account.help.step3'),
  t('account.help.step4'),
]

/**
 * Help & complaints (PP 80/2019 Pasal 27): where to reach the brand, how complaints work, how
 * they are followed up and how long they take, and a form that opens a support ticket.
 */
export function HelpPage() {
  const { tenant, store } = useShop()
  useTitle(`${t('account.help.title')} · ${tenant.name}`)
  const l = tenant.legal ?? {}
  const days = complaintDays(tenant)
  const brand = tenant.name.replace(/\.$/, '')
  const steps = l.complaintProcedure
    ? l.complaintProcedure.split(/\n+/).filter((s) => s.trim())
    : defaultSteps()
  return (
    <div className="max-w-3xl space-y-6 md:pt-6 mx-auto">
      <section className="sf-card p-6 md:p-10" aria-labelledby="help-h">
        <h1 id="help-h" className="sf-display text-3xl font-bold">
          {t('account.help.title')}
        </h1>
        <p className="mt-2 text-[color:var(--sf-muted)]">{t('account.help.intro', { brand, days })}</p>
        <ul className="mt-6 gap-3 sm:grid-cols-2 grid grid-cols-1">
          {l.phone && (
            <Contact icon={<Phone />} label={t('account.help.phone')}>
              <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-4">
                {l.phone}
              </a>
            </Contact>
          )}
          {l.phone && (
            <Contact icon={<MessageCircle />} label="WhatsApp">
              <a
                href={waLink(l.phone)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {t('account.help.chat')}
              </a>
            </Contact>
          )}
          {l.email && (
            <Contact icon={<Mail />} label={t('account.email')}>
              <a href={`mailto:${l.email}`} className="break-all underline underline-offset-4">
                {l.email}
              </a>
            </Contact>
          )}
          {l.address && (
            <Contact icon={<MapPin />} label={t('account.help.address')}>
              {l.entityName ? `${l.entityName}, ` : ''}
              {l.address}
            </Contact>
          )}
          {l.hours && (
            <Contact icon={<Clock />} label={t('account.help.hours')}>
              {l.hours}
            </Contact>
          )}
        </ul>
      </section>

      <section className="sf-card p-6 md:p-10 space-y-5" aria-labelledby="how-h">
        <h2 id="how-h" className="sf-display text-xl font-bold">
          {t('account.help.how')}
        </h2>
        <ol className="space-y-2 text-sm leading-relaxed pl-5 list-decimal">
          {steps.map((step) => (
            <li key={step}>{step.trim()}</li>
          ))}
        </ol>
        <div className="space-y-2 text-sm leading-relaxed">
          <h3 className="font-bold">{t('account.help.followUp')}</h3>
          <p>{t('account.help.followUpText')}</p>
          <h3 className="font-bold">{t('account.help.resolution')}</h3>
          <p>
            {tx(
              'account.help.resolutionText',
              {
                terms: (
                  <Link
                    key="terms"
                    to={paths.terms(store)}
                    className="font-semibold underline underline-offset-4"
                  >
                    {t('account.help.terms')}
                  </Link>
                ),
              },
              { days },
            )}
          </p>
        </div>
      </section>

      <ComplaintForm />
    </div>
  )
}

function Contact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="gap-3 p-4 text-sm [&_svg]:size-4 [&_svg]:mt-0.5 flex items-start rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)] [&_svg]:shrink-0">
      {icon}
      <span className="min-w-0">
        <span className="text-xs font-semibold block text-[color:var(--sf-muted)]">{label}</span>
        {children}
      </span>
    </li>
  )
}

function ComplaintForm() {
  const { tenant, customer, orders, send, closedDays } = useShop()
  const uid = useId()
  const [params] = useSearchParams()
  const own = customer ? orders.filter((o) => o.customerId === customer.id) : []
  // The order page links here with ?order=; a guest's order cannot be attached, so its code goes in the text.
  const linked = orders.find((o) => o.id === params.get('order'))
  const mine = !!linked && own.includes(linked)
  const [orderId, setOrderId] = useState(mine ? linked.id : '')
  const [name, setName] = useState(customer?.name ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState(
    linked && !mine ? t('account.help.orderPrefix', { code: linked.code }) : '',
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ code?: string; due: string } | null>(null)
  const contact = { name, email, phone }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const why = complaintBlocker({ subject, message, contact })
    if (why) {
      setError(refusalText(why))
      return
    }
    setBusy(true)
    setError('')
    try {
      const delta = await send({
        type: 'tickets/open',
        complaint: {
          id: newId('tic'),
          tenantId: tenant.id,
          customerId: customer?.id ?? null,
          orderId: orderId || null,
          subject,
          message,
          contact,
        },
      })
      const ticket = delta?.upserts.tickets?.[0] as Ticket | undefined
      setSent({
        code: ticket?.code,
        due: ticket?.slaDueAt ?? addWorkingDays(nowIso(), complaintDays(tenant), closedDays),
      })
    } catch (err) {
      setError(problemText(err))
    }
    setBusy(false)
  }

  if (sent)
    return (
      <section className="sf-card p-6 md:p-10 text-center" role="status">
        <CircleCheck className="size-8 mx-auto" aria-hidden="true" />
        <h2 className="sf-display mt-3 text-xl font-bold">{t('account.help.received')}</h2>
        <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
          {sent.code ? (
            <>
              {tx('account.help.ticket', {
                code: (
                  <strong key="code" className="font-mono text-[color:var(--sf-text)]">
                    {sent.code}
                  </strong>
                ),
              })}{' '}
            </>
          ) : null}
          {t('account.help.expect', { date: fmtDateTime(sent.due) })}
        </p>
      </section>
    )

  return (
    <form className="sf-card p-6 md:p-10 space-y-4" aria-labelledby={`${uid}-h`} onSubmit={submit} noValidate>
      <h2 id={`${uid}-h`} className="sf-display text-xl font-bold">
        {t('account.help.form')}
      </h2>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <Field id={`${uid}-name`} label={t('account.yourName')}>
          <input
            id={`${uid}-name`}
            className={inputClass}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id={`${uid}-email`} label={t('account.email')}>
          <input
            id={`${uid}-email`}
            type="email"
            className={inputClass}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id={`${uid}-phone`} label={t('account.phoneOrWa')} hint={t('account.help.contactHint')}>
          <input
            id={`${uid}-phone`}
            type="tel"
            className={inputClass}
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            {...describedBy(`${uid}-phone`, null, 'hint')}
          />
        </Field>
        {own.length > 0 && (
          <Field id={`${uid}-order`} label={t('account.help.order')} hint={t('account.optional')}>
            <select
              id={`${uid}-order`}
              className={inputClass}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">{t('account.help.noOrder')}</option>
              {own.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {fmtDateTime(o.createdAt)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field id={`${uid}-subject`} label={t('account.help.subject')}>
        <input
          id={`${uid}-subject`}
          className={inputClass}
          maxLength={120}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </Field>
      <Field id={`${uid}-message`} label={t('account.help.what')} hint={t('account.help.whatHint')}>
        <textarea
          id={`${uid}-message`}
          rows={5}
          maxLength={2000}
          className={`${inputClass} py-3 h-auto`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          {...describedBy(`${uid}-message`, null, 'hint')}
        />
      </Field>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t('account.help.sending') : t('account.help.submit')}
        </Button>
      </div>
    </form>
  )
}
