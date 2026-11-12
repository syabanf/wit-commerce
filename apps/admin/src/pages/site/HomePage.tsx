import { slugify } from '@rc/fixtures'
import { INDUSTRY_LABEL } from '@rc/types'
import { ArrowRight, Boxes, Check, CreditCard, type LucideIcon, MousePointerClick, Users } from 'lucide-react'
import { type FormEvent, lazy, Suspense, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { STORE_ROOT } from '../../lib/storefront'
import {
  buttonClass,
  Checklist,
  CtaBand,
  Dot,
  Kicker,
  Marquee,
  riseAt,
  SectionHead,
  usePageMeta,
  ConsoleLink,
} from './parts'
import { Reveal } from './Reveal'
import { SiteLayout } from './SiteLayout'

// three.js is large; it loads after the page paints, and only on this page.
const Hero3D = lazy(() => import('./Hero3D').then((m) => ({ default: m.Hero3D })))

/** The root for signed-out visitors: the home page inside the site frame. */
export function PublicHome() {
  return (
    <SiteLayout>
      <HomePage />
    </SiteLayout>
  )
}

export function HomePage() {
  usePageMeta(
    'WIT Commerce · Your store, live today',
    'Open a store on its own address, sell online and through your sales team, and run orders, stock and customers from one console.',
  )
  return (
    <>
      <Hero />
      <Marquee
        words={[
          'Store editor',
          'Midtrans',
          'Seller app',
          'AI assistant',
          '10 currencies',
          'Webhooks',
          'Customer 360',
          'Loyalty',
          'Warehouses',
        ]}
      />
      <FeatureStrip />
      <SolutionsTeaser />
      <Assistant />
      <CtaBand />
    </>
  )
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="pt-28 pb-6 sm:pt-32 lg:min-h-[min(100dvh,860px)] lg:pb-16 relative isolate"
    >
      {/* Soft WIT glow behind the object. */}
      <div
        aria-hidden
        className="inset-0 absolute -z-20"
        style={{
          background:
            'radial-gradient(60% 55% at 72% 42%, rgba(237,28,36,0.10), transparent 70%), radial-gradient(45% 45% at 30% 80%, rgba(131,179,238,0.22), transparent 70%)',
        }}
      />
      <div className="max-w-6xl px-4 sm:px-6 mx-auto grid">
        <div className="max-w-xl">
          <p
            className="rise mb-5 gap-2 bg-white/80 px-3 py-1 text-xs font-semibold backdrop-blur inline-flex items-center rounded-full shadow-card"
            style={riseAt(0)}
          >
            <span className="size-1.5 rounded-full bg-accent" />
            Brand, store and customers in one place
          </p>
          <h1
            id="hero-title"
            className="rise text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl leading-[1.02]"
            style={riseAt(1)}
          >
            Your store,
            <br />
            live today
            <Dot />
          </h1>
          <p className="rise mt-5 max-w-md text-lg text-body" style={riseAt(2)}>
            Open a store on its own address, sell online and through your sales team, and run orders, stock
            and customers from one console.
          </p>
          <div className="rise" style={riseAt(3)}>
            <ClaimForm />
          </div>
          <div
            className="rise mt-6 gap-x-5 gap-y-2 text-sm flex flex-wrap items-center text-muted"
            style={riseAt(4)}
          >
            <span className="gap-1.5 inline-flex items-center">
              <Check className="size-4 text-accent" aria-hidden /> Three steps to a store
            </span>
            <span className="gap-1.5 inline-flex items-center">
              <Check className="size-4 text-accent" aria-hidden /> Visual editor
            </span>
            <ConsoleLink className="gap-1 font-semibold inline-flex items-center text-foreground hover:underline">
              Try the demo <ArrowRight className="size-4" aria-hidden />
            </ConsoleLink>
          </div>
        </div>
      </div>
      <Suspense fallback={<div className="h-80 lg:hidden" />}>
        <Hero3D className="mt-4 h-80 sm:h-96 lg:absolute lg:inset-0 lg:left-[40%] lg:mt-0 lg:h-auto relative -z-10" />
      </Suspense>
    </section>
  )
}

/** Type a store name and see the address it gets, then continue to sign-up with it filled in. */
function ClaimForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const sub = slugify(name).slice(0, 30).replace(/-+$/, '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(name.trim() ? `/start?name=${encodeURIComponent(name.trim())}` : '/start')
  }
  return (
    <form onSubmit={submit} className="mt-8 max-w-lg">
      <label htmlFor="claim-name" className="sr-only">
        Store name
      </label>
      <div className="gap-2 bg-white p-2 sm:flex-row sm:items-center sm:rounded-full flex flex-col rounded-[22px] shadow-float">
        <input
          id="claim-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name your store"
          maxLength={60}
          autoComplete="off"
          className="h-12 min-w-0 px-4 text-base flex-1 rounded-full bg-transparent outline-none placeholder:text-silver"
        />
        <button type="submit" className={buttonClass('ink')}>
          Create store <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-3 pl-4 text-xs font-mono text-muted" aria-live="polite">
        {sub || 'yourstore'}.{STORE_ROOT}
      </p>
    </form>
  )
}

const STRIP: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MousePointerClick,
    title: 'Edit by clicking',
    body: 'Change words, pictures and buttons on the page itself. Shoppers see nothing until you press Publish.',
  },
  {
    icon: CreditCard,
    title: 'Get paid',
    body: 'Midtrans QRIS, virtual accounts, GoPay and cards, plus cash on delivery.',
  },
  {
    icon: Boxes,
    title: 'Run the back office',
    body: 'Orders, stock across warehouses and returns in one queue.',
  },
  {
    icon: Users,
    title: 'Sell through people',
    body: 'Each seller gets a personal store, referral links and a phone app.',
  },
]

function FeatureStrip() {
  return (
    <section aria-labelledby="strip-title" className="px-4 py-20 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="gap-6 md:flex-row md:items-end md:justify-between flex flex-col">
          <SectionHead kicker="Product" id="strip-title" title="Everything a store needs to start selling" />
          <Reveal>
            <Link to="/product" viewTransition className={buttonClass('white')}>
              See the product <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Reveal>
        </div>
        <ul className="mt-10 gap-4 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
          {STRIP.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 80}>
              <Link
                to="/product"
                viewTransition
                className="lift p-6 flex h-full flex-col rounded-card bg-card shadow-card"
              >
                <span className="size-11 grid place-items-center rounded-[13px] bg-accent-soft text-accent">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm text-body">{f.body}</p>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

const TEAMS = [
  { title: 'Owners', body: 'See the whole brand: sales, stock, campaigns and people.' },
  { title: 'Operations', body: 'Ship orders, keep stock right and handle refunds.' },
  { title: 'Marketing', body: 'Build segments, campaigns, automations and promotions.' },
]

function SolutionsTeaser() {
  return (
    <section aria-labelledby="solutions-title" className="px-4 py-20 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHead
          kicker="Solutions"
          id="solutions-title"
          title="Made for how you sell"
          lead="Pick what you sell when you open the store. Every team then sees the part of the console it works in."
        />
        <Reveal className="mt-8 gap-2 flex flex-wrap">
          {Object.values(INDUSTRY_LABEL).map((label) => (
            <Link
              key={label}
              to="/solutions"
              viewTransition
              className="press bg-white px-4 py-2 text-sm font-semibold rounded-full shadow-card hover:bg-surface-2"
            >
              {label}
            </Link>
          ))}
        </Reveal>
        <ul className="mt-6 gap-4 md:grid-cols-3 grid grid-cols-1">
          {TEAMS.map((t, i) => (
            <Reveal as="li" key={t.title} delay={i * 80}>
              <Link
                to="/solutions"
                viewTransition
                className="lift p-6 flex h-full flex-col rounded-card bg-card shadow-card"
              >
                <Kicker>For</Kicker>
                <h3 className="mt-2 text-2xl font-bold tracking-tight">
                  {t.title}
                  <Dot />
                </h3>
                <p className="mt-2 text-sm flex-1 text-body">{t.body}</p>
                <span className="mt-5 gap-1 text-sm font-semibold inline-flex items-center">
                  See solutions <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Assistant() {
  return (
    <section aria-labelledby="assistant-title" className="px-4 py-20 sm:px-6">
      <Reveal className="max-w-6xl gap-10 p-6 text-white sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-14 relative mx-auto grid grid-cols-1 overflow-hidden rounded-hero bg-ink shadow-float">
        <div
          aria-hidden
          className="-top-24 -right-24 size-80 blur-3xl pointer-events-none absolute rounded-full bg-accent/40"
        />
        <div className="relative">
          <Kicker onDark>AI assistant</Kicker>
          <h2 id="assistant-title" className="mt-3 text-4xl leading-tight font-bold tracking-tight">
            Ask your store a question
            <Dot />
          </h2>
          <p className="mt-4 text-on-ink-muted">
            It reads your sales, stock, orders and campaigns, answers in plain words and suggests what to do
            next.
          </p>
          <div className="mt-6">
            <Checklist
              onDark
              items={[
                'Nothing changes until you press Confirm',
                'It only offers what your role is allowed to do',
                'Customer emails, phones and addresses never reach the model',
              ]}
            />
          </div>
          <Link
            to="/product#assistant"
            viewTransition
            className="press mt-8 h-11 gap-2 bg-white px-5 text-sm font-semibold inline-flex items-center rounded-full text-foreground hover:bg-surface"
          >
            How it works <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div aria-hidden className="space-y-3 relative self-center">
          <div className="rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-sm ml-auto w-fit max-w-[85%]">
            What should I restock this week?
          </div>
          <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm max-w-[90%] text-foreground">
            Trail Runner 2 in size 42 is running low and sold well last week. I suggest receiving more.
          </div>
          <div className="rounded-2xl bg-white p-4 max-w-[90%] text-foreground">
            <p className="text-xs font-semibold text-muted uppercase">Suggested action</p>
            <p className="mt-1 text-sm font-semibold">Receive stock · Trail Runner 2 · 42</p>
            <p className="text-xs text-muted">Main warehouse</p>
            <div className="mt-3 gap-2 flex">
              <span className="px-3 py-1.5 text-xs font-semibold text-white rounded-full bg-accent-strong">
                Confirm
              </span>
              <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-surface">Dismiss</span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
