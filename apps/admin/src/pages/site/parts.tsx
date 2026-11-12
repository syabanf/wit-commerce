import { cn } from '@rc/ui'
import { Check, Store } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { markEntered } from '../../auth/entry'
import { OFFICES } from './company'
import { Reveal } from './Reveal'

/** Sets the tab title and meta description while the page is open, and puts the old ones back after. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const before = { title: document.title, description: meta?.content ?? '' }
    document.title = title
    meta?.setAttribute('content', description)
    return () => {
      document.title = before.title
      meta?.setAttribute('content', before.description)
    }
  }, [title, description])
}

/** Inline style for a hero child that rises in at step `i`. */
export const riseAt = (i: number) => ({ '--i': i }) as CSSProperties

const BUTTON = {
  red: 'bg-accent-strong text-white shadow-glow hover:bg-accent-dark',
  ink: 'bg-ink text-white hover:bg-ink-3',
  white: 'bg-white text-foreground shadow-card hover:bg-surface-2',
}

/**
 * The way into the console. Signed out it goes to sign-in with the demo accounts; with a saved
 * session it opens the dashboard and marks the tab as entered, so the root stops showing the site.
 */
export function ConsoleLink({
  className,
  children,
  onClick,
}: {
  className?: string
  children: ReactNode
  onClick?: () => void
}) {
  const { user } = useAuth()
  if (!user) {
    return (
      <Link to="/login" onClick={onClick} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <Link
      to="/"
      onClick={() => {
        markEntered()
        onClick?.()
      }}
      className={className}
    >
      Open dashboard
    </Link>
  )
}

export function buttonClass(tone: keyof typeof BUTTON, className?: string) {
  return cn(
    'press inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold whitespace-nowrap',
    BUTTON[tone],
    className,
  )
}

export function Kicker({ children, onDark }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p
      className={cn(
        'font-semibold tracking-wider text-[11px] uppercase',
        onDark ? 'text-on-ink-muted' : 'text-muted',
      )}
    >
      {children}
    </p>
  )
}

/** A red period closes every title. */
export const Dot = () => <span className="text-accent">.</span>

export function SectionHead({
  kicker,
  title,
  id,
  lead,
  center,
}: {
  kicker: string
  title: string
  id: string
  lead?: string
  center?: boolean
}) {
  return (
    <Reveal className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <Kicker>{kicker}</Kicker>
      <h2 id={id} className="mt-3 text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
        {title}
        <Dot />
      </h2>
      {lead && <p className="mt-4 text-lg text-body">{lead}</p>}
    </Reveal>
  )
}

/** The top of an inner page: one h1 over two slow glossy blobs. */
export function PageHero({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string
  title: string
  lead: string
  children?: ReactNode
}) {
  return (
    <section
      aria-labelledby="page-title"
      className="px-4 pt-32 pb-16 sm:px-6 sm:pt-40 sm:pb-20 relative isolate overflow-hidden"
    >
      <div aria-hidden className="inset-0 absolute -z-10">
        <div className="blob blob-red -top-24 sm:size-[34rem] right-[-10%] size-[26rem]" />
        <div className="blob blob-blue sm:size-[30rem] bottom-[-30%] left-[-12%] size-[24rem]" />
      </div>
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <p
            className="rise gap-2 bg-white/80 px-3 py-1 text-xs font-semibold backdrop-blur inline-flex items-center rounded-full shadow-card"
            style={riseAt(0)}
          >
            <span className="size-1.5 rounded-full bg-accent" />
            {kicker}
          </p>
          <h1
            id="page-title"
            className="rise mt-5 text-5xl font-bold tracking-tight sm:text-6xl leading-[1.04]"
            style={riseAt(1)}
          >
            {title}
            <Dot />
          </h1>
          <p className="rise mt-5 max-w-2xl text-lg text-body" style={riseAt(2)}>
            {lead}
          </p>
          {children && (
            <div className="rise mt-8" style={riseAt(3)}>
              {children}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function Checklist({ items, onDark }: { items: readonly string[]; onDark?: boolean }) {
  return (
    <ul className={cn('space-y-2.5 text-sm', onDark ? 'text-white' : 'text-body')}>
      {items.map((t) => (
        <li key={t} className="gap-2 flex">
          <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}

/** A slow strip of feature words. The second copy only fills the loop, so screen readers skip it. */
export function Marquee({ words }: { words: readonly string[] }) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {words.map((w) => (
        <li
          key={w}
          className="gap-6 pr-6 text-lg font-semibold tracking-tight sm:text-xl flex items-center whitespace-nowrap text-body"
        >
          {w}
          <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="marquee py-6 overflow-hidden">
      <div className="marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}

/** The red closing band every page ends on. */
export function CtaBand({
  title = 'Open your store today',
  body = 'Three steps, then edit it by clicking on it.',
}: {
  title?: string
  body?: string
}) {
  return (
    <section aria-labelledby="cta-title" className="px-4 pt-10 pb-20 sm:px-6">
      <Reveal className="max-w-6xl gap-6 p-8 text-white sm:p-12 md:flex-row md:items-center md:justify-between mx-auto flex flex-col items-start rounded-hero bg-accent-strong shadow-glow">
        <div>
          <h2 id="cta-title" className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            {title}.
          </h2>
          <p className="mt-2 text-white/85">{body}</p>
        </div>
        <div className="gap-2 flex flex-wrap">
          <Link to="/start" className={buttonClass('white', 'shadow-none')}>
            <Store className="size-4" aria-hidden /> Create your store
          </Link>
          <Link
            to="/contact"
            viewTransition
            className="press h-12 px-6 text-sm font-semibold text-white ring-white/60 hover:bg-white/10 inline-flex items-center rounded-full ring-1"
          >
            Talk to us
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

/** The offices from company.ts, as a two-column list. */
export function OfficeList({ className, onDark }: { className?: string; onDark?: boolean }) {
  const quiet = onDark ? 'text-on-ink-muted' : 'text-muted'
  return (
    <ul className={cn('gap-4 sm:grid-cols-2 grid', className)}>
      {OFFICES.map((o) => (
        <li key={o.city}>
          <p className="font-semibold">{o.city}</p>
          {o.soon && <p className={quiet}>Coming soon</p>}
          {o.places.map((p) => (
            <p key={p.address} className={quiet}>
              {p.name && <span className={onDark ? 'text-white' : 'text-body'}>{p.name}, </span>}
              {p.address}
            </p>
          ))}
        </li>
      ))}
    </ul>
  )
}
