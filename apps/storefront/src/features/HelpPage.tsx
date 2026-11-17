import { ApiError } from '@rc/api'
import {
  DEFAULT_COMPLAINT_PROCEDURE,
  addWorkingDays,
  complaintBlocker,
  complaintDays,
  fmtDateTime,
  newId,
  nowIso,
} from '@rc/fixtures'
import type { Ticket } from '@rc/types'
import { CircleCheck, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Field, describedBy, inputClass } from '../components/ui'
import { paths, waLink } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'

/**
 * Help & complaints (PP 80/2019 Pasal 27): where to reach the brand, how complaints work, how
 * they are followed up and how long they take, and a form that opens a support ticket.
 */
export function HelpPage() {
  const { tenant, store } = useShop()
  useTitle(`Help & complaints · ${tenant.name}`)
  const l = tenant.legal ?? {}
  const days = complaintDays(tenant)
  const brand = tenant.name.replace(/\.$/, '')
  const steps = (l.complaintProcedure ?? DEFAULT_COMPLAINT_PROCEDURE).split(/\n+/).filter((s) => s.trim())
  return (
    <div className="max-w-3xl space-y-6 md:pt-6 mx-auto">
      <section className="sf-card p-6 md:p-10" aria-labelledby="help-h">
        <h1 id="help-h" className="sf-display text-3xl font-bold">
          Help &amp; complaints
        </h1>
        <p className="mt-2 text-[color:var(--sf-muted)]">
          Something wrong with an order? Tell {brand}. Our support team handles every complaint as a ticket,
          and we resolve it within {days} working days.
        </p>
        <ul className="mt-6 gap-3 sm:grid-cols-2 grid grid-cols-1">
          {l.phone && (
            <Contact icon={<Phone />} label="Phone">
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
                Chat with us
              </a>
            </Contact>
          )}
          {l.email && (
            <Contact icon={<Mail />} label="Email">
              <a href={`mailto:${l.email}`} className="break-all underline underline-offset-4">
                {l.email}
              </a>
            </Contact>
          )}
          {l.address && (
            <Contact icon={<MapPin />} label="Address">
              {l.entityName ? `${l.entityName}, ` : ''}
              {l.address}
            </Contact>
          )}
          {l.hours && (
            <Contact icon={<Clock />} label="Service hours">
              {l.hours}
            </Contact>
          )}
        </ul>
      </section>

      <section className="sf-card p-6 md:p-10 space-y-5" aria-labelledby="how-h">
        <h2 id="how-h" className="sf-display text-xl font-bold">
          How complaints work
        </h2>
        <ol className="space-y-2 text-sm leading-relaxed pl-5 list-decimal">
          {steps.map((step) => (
            <li key={step}>{step.trim()}</li>
          ))}
        </ol>
        <div className="space-y-2 text-sm leading-relaxed">
          <h3 className="font-bold">Follow-up</h3>
          <p>
            Your complaint opens a ticket with our support team, who replies by email or phone. Quote the
            ticket code when you contact us again, and we pick up where we left off.
          </p>
          <h3 className="font-bold">Resolution time</h3>
          <p>
            We resolve complaints within {days} working days of receiving them. If we cannot agree, our{' '}
            <Link to={paths.terms(store)} className="font-semibold underline underline-offset-4">
              terms
            </Link>{' '}
            set out how the dispute is settled.
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
  const { tenant, customer, orders, send } = useShop()
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
  const [message, setMessage] = useState(linked && !mine ? `Order ${linked.code}: ` : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ code?: string; due: string } | null>(null)
  const contact = { name, email, phone }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const why = complaintBlocker({ subject, message, contact })
    if (why) {
      setError(why)
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
        due: ticket?.slaDueAt ?? addWorkingDays(nowIso(), complaintDays(tenant)),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The store did not answer. Try again in a moment.')
    }
    setBusy(false)
  }

  if (sent)
    return (
      <section className="sf-card p-6 md:p-10 text-center" role="status">
        <CircleCheck className="size-8 mx-auto" aria-hidden="true" />
        <h2 className="sf-display mt-3 text-xl font-bold">We received your complaint</h2>
        <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
          {sent.code ? (
            <>
              Your ticket is <strong className="font-mono text-[color:var(--sf-text)]">{sent.code}</strong>
              .{' '}
            </>
          ) : null}
          Expect an answer by {fmtDateTime(sent.due)}.
        </p>
      </section>
    )

  return (
    <form className="sf-card p-6 md:p-10 space-y-4" aria-labelledby={`${uid}-h`} onSubmit={submit} noValidate>
      <h2 id={`${uid}-h`} className="sf-display text-xl font-bold">
        Send a complaint
      </h2>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <Field id={`${uid}-name`} label="Your name">
          <input
            id={`${uid}-name`}
            className={inputClass}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id={`${uid}-email`} label="Email">
          <input
            id={`${uid}-email`}
            type="email"
            className={inputClass}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id={`${uid}-phone`} label="Phone or WhatsApp" hint="Leave an email, a phone number, or both.">
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
          <Field id={`${uid}-order`} label="Order" hint="Optional">
            <select
              id={`${uid}-order`}
              className={inputClass}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">Not about one order</option>
              {own.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {fmtDateTime(o.createdAt)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field id={`${uid}-subject`} label="Subject">
        <input
          id={`${uid}-subject`}
          className={inputClass}
          maxLength={120}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </Field>
      <Field id={`${uid}-message`} label="What happened?" hint="Include your order number if you have one.">
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
          {busy ? 'Sending…' : 'Send complaint'}
        </Button>
      </div>
    </form>
  )
}
