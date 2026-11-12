import { ArrowRight, Clock, Mail, Phone, Send } from 'lucide-react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { CONTACT } from './company'
import { buttonClass, Dot, Kicker, OfficeList, PageHero, usePageMeta } from './parts'
import { Reveal } from './Reveal'

const FIELD =
  'mt-1.5 w-full rounded-2xl bg-surface-2 px-4 py-3 text-base outline-none placeholder:text-silver focus:bg-white focus:ring-2 focus:ring-accent/40'

/** There is no backend for this form: it opens the visitor's mail app with the message filled in. */
function ContactForm() {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const field = (name: string) => String(data.get(name) ?? '').trim()
    const body = [
      field('message'),
      '',
      `Name: ${field('name')}`,
      ...(field('company') ? [`Company: ${field('company')}`] : []),
      `Email: ${field('email')}`,
    ].join('\n')
    const query = `subject=${encodeURIComponent(CONTACT.enquirySubject)}&body=${encodeURIComponent(body)}`
    window.location.href = `mailto:${CONTACT.email}?${query}`
  }

  return (
    <form
      onSubmit={submit}
      className="p-6 sm:p-8 rounded-hero bg-card shadow-card"
      aria-labelledby="form-title"
    >
      <h2 id="form-title" className="text-2xl font-bold tracking-tight">
        Send us a message
        <Dot />
      </h2>
      <div className="mt-6 gap-4 sm:grid-cols-2 grid">
        <label className="text-sm font-semibold">
          Name
          <input name="name" required autoComplete="name" className={FIELD} />
        </label>
        <label className="text-sm font-semibold">
          Company <span className="font-normal text-muted">(optional)</span>
          <input name="company" autoComplete="organization" className={FIELD} />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          Email
          <input name="email" type="email" required autoComplete="email" className={FIELD} />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          Message
          <textarea
            name="message"
            required
            rows={5}
            placeholder="What do you sell, and what would you like WIT Commerce to do?"
            className={`${FIELD} resize-y`}
          />
        </label>
      </div>
      <button type="submit" className={buttonClass('ink', 'mt-6 sm:w-auto w-full')}>
        <Send className="size-4" aria-hidden /> Opens your email app
      </button>
      <p className="mt-3 text-xs text-muted">
        Your mail app opens with this message to {CONTACT.email}. Nothing is sent until you press send there.
      </p>
    </form>
  )
}

export function ContactPage() {
  usePageMeta(
    'Contact · WIT Commerce',
    `Talk to the WIT Commerce team at ${CONTACT.email} or ${CONTACT.phone}, or visit an office in Bandung, Jakarta or Surabaya.`,
  )
  return (
    <>
      <PageHero
        kicker="Contact"
        title="Talk to the team"
        lead="Tell us what you sell and how you sell it. We will show you how WIT Commerce fits."
      />
      <section aria-label="Contact details and form" className="px-4 pb-20 sm:px-6">
        <div className="max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] mx-auto grid">
          <Reveal>
            <ContactForm />
          </Reveal>
          <div className="space-y-6">
            <Reveal delay={80}>
              <div className="p-6 sm:p-8 rounded-hero bg-card shadow-card">
                <Kicker>Reach us</Kicker>
                <ul className="mt-4 space-y-4 text-sm">
                  <li className="gap-3 flex">
                    <Mail className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    <a href={`mailto:${CONTACT.email}`} className="font-semibold hover:underline">
                      {CONTACT.email}
                    </a>
                  </li>
                  <li className="gap-3 flex">
                    <Phone className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    <a href={CONTACT.phoneHref} className="font-semibold hover:underline">
                      {CONTACT.phone}
                    </a>
                  </li>
                  <li className="gap-3 flex text-body">
                    <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    {CONTACT.hours}
                  </li>
                </ul>
                <p className="mt-6 font-semibold tracking-wider text-[11px] text-muted uppercase">Offices</p>
                <OfficeList className="mt-3 text-sm" />
              </div>
            </Reveal>
            <Reveal delay={160}>
              <div className="p-6 text-white sm:p-8 relative overflow-hidden rounded-hero bg-ink shadow-float">
                <div
                  aria-hidden
                  className="-top-16 -right-16 size-48 blur-3xl pointer-events-none absolute rounded-full bg-accent/40"
                />
                <h2 className="text-2xl font-bold tracking-tight relative">
                  Ready now<span className="text-accent">?</span>
                </h2>
                <p className="mt-2 relative text-on-ink-muted">
                  Open a store in three steps and edit it by clicking on it.
                </p>
                <Link to="/start" className={buttonClass('red', 'mt-6 relative')}>
                  Create your store <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
