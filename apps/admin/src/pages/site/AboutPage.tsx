import { Bot, EyeOff, FileLock2, UsersRound } from 'lucide-react'
import { COMPANY, SOCIALS } from './company'
import { CtaBand, Dot, Kicker, OfficeList, PageHero, SectionHead, usePageMeta } from './parts'
import { Reveal } from './Reveal'

const PRINCIPLES = [
  {
    icon: FileLock2,
    title: 'Shoppers never see drafts',
    body: 'Edits to a live page wait in a draft. The store changes when you press Publish.',
  },
  {
    icon: Bot,
    title: 'The AI never acts without Confirm',
    body: 'The assistant suggests. Nothing changes in your store until a person presses Confirm.',
  },
  {
    icon: EyeOff,
    title: 'Contact data stays out of the model',
    body: 'Customer emails, phone numbers and addresses never go to the AI model.',
  },
  {
    icon: UsersRound,
    title: 'Each role sees what it needs',
    body: 'Operations, marketing, service and sales each get the pages and actions of their job.',
  },
]

export function AboutPage() {
  usePageMeta(
    'About · WIT Commerce',
    `WIT Commerce is built by ${COMPANY.name}, ${COMPANY.legalName}, an IT consultancy and software house since ${COMPANY.founded}.`,
  )
  return (
    <>
      <PageHero
        kicker={`Built by ${COMPANY.name}`}
        title="The team behind WIT Commerce"
        lead={`${COMPANY.name} is an IT consultancy and software house, ${COMPANY.tagline.toLowerCase()}. We have built software for businesses since ${COMPANY.founded}.`}
      />

      <section aria-labelledby="why-title" className="px-4 py-16 sm:px-6">
        <div className="max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 mx-auto grid">
          <SectionHead
            kicker="Why we built it"
            id="why-title"
            title="One platform for brand, store and customers"
          />
          <Reveal delay={100} className="space-y-4 text-lg text-body">
            <p>
              Running a brand online often means a website in one tool, payments in another, stock in a
              spreadsheet and customers in a chat app. Every change means copying data from one to the next.
            </p>
            <p>
              We built WIT Commerce so a brand runs from one place. The look of the store, the products, the
              orders and the people who buy them share one console, and each team works on its own part of it.
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="principles-title" className="px-4 py-16 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            kicker="Principles"
            id="principles-title"
            title="Rules the product enforces"
            lead="Each one is a check in the code."
          />
          <ul className="mt-10 gap-4 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
            {PRINCIPLES.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 80}>
                <article className="lift p-6 flex h-full flex-col rounded-card bg-card shadow-card">
                  <span className="size-11 grid place-items-center rounded-[13px] bg-accent-soft text-accent">
                    <p.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm text-body">{p.body}</p>
                </article>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="company-title" className="px-4 py-16 sm:px-6">
        <Reveal className="max-w-6xl gap-10 p-6 text-white sm:p-10 lg:grid-cols-2 lg:p-14 relative mx-auto grid overflow-hidden rounded-hero bg-ink shadow-float">
          <div
            aria-hidden
            className="-bottom-24 -left-24 size-80 blur-3xl pointer-events-none absolute rounded-full bg-accent/35"
          />
          <div className="relative">
            <Kicker onDark>{COMPANY.legalName}</Kicker>
            <h2 id="company-title" className="mt-3 text-4xl leading-tight font-bold tracking-tight">
              {COMPANY.name}
              <Dot />
            </h2>
            <p className="mt-4 text-on-ink-muted">
              {COMPANY.tagline}. Established {COMPANY.founded}.
            </p>
            <p className="mt-8 font-semibold tracking-wider text-[11px] text-on-ink-muted uppercase">
              What we do
            </p>
            <ul className="mt-3 gap-2 flex flex-wrap">
              {COMPANY.services.map((s) => (
                <li key={s} className="bg-white/10 px-3 py-1.5 text-sm font-semibold rounded-full">
                  {s}
                </li>
              ))}
            </ul>
            <ul className="mt-8 gap-2 flex flex-wrap">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="press bg-white px-3 py-1.5 text-xs font-semibold inline-flex rounded-full text-foreground hover:bg-surface"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <p className="font-semibold tracking-wider text-[11px] text-on-ink-muted uppercase">Offices</p>
            <OfficeList className="mt-3" onDark />
          </div>
        </Reveal>
      </section>

      <CtaBand />
    </>
  )
}
