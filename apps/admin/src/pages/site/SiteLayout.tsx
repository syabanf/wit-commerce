import { cn } from '@rc/ui'
import { Menu, X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { WitCommerce } from '../../layouts/WitLogo'
import { COMPANY, copyright, SITE_NAV, SOCIALS } from './company'
import { buttonClass, OfficeList, riseAt, ConsoleLink } from './parts'
import './site.css'

/** The frame of every public page: header, footer, skip link, scroll to top on navigation. */
export function SiteLayout({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation()
  const firstRender = useRef(true)

  // A new page starts at its top, or at the section its link names. After the first page, focus moves
  // to the heading for screen readers.
  useLayoutEffect(() => {
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1))
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const heading = document.querySelector<HTMLElement>('#main h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }, [pathname])

  return (
    <div className="landing-root flex min-h-dvh flex-col overflow-x-clip bg-surface text-foreground">
      <a
        href="#main"
        className="focus:top-3 focus:left-3 focus:px-4 focus:py-2 sr-only focus:not-sr-only focus:fixed focus:z-[60] focus:rounded-full focus:bg-card focus:shadow-float"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-ink text-white' : 'text-body hover:bg-surface',
  )

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => {
    setOpen(false)
    menuButton.current?.focus()
  }

  return (
    <>
      <header
        className="inset-x-0 top-0 px-4 pt-3 sm:px-6 fixed z-40"
        style={{ viewTransitionName: 'site-header' }}
      >
        <div
          className={cn(
            'h-14 max-w-6xl gap-2 pr-2 pl-4 backdrop-blur-xl mx-auto flex items-center rounded-full border transition-[background-color,box-shadow,border-color] duration-300',
            scrolled ? 'border-white/80 bg-white/90 shadow-float' : 'border-white/50 bg-white/55 shadow-card',
          )}
        >
          <Link to="/" viewTransition aria-label="WIT Commerce home" className="shrink-0 rounded-full">
            <WitCommerce />
          </Link>
          <nav aria-label="Main" className="gap-1 lg:flex mx-auto hidden items-center">
            {SITE_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} viewTransition className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="gap-1 lg:ml-0 lg:flex ml-auto hidden items-center">
            <ConsoleLink className="press px-3.5 py-2 text-sm font-semibold rounded-full whitespace-nowrap text-body hover:bg-surface">
              Sign in
            </ConsoleLink>
            <Link to="/start" className={buttonClass('red', 'h-10 px-4')}>
              Create your store
            </Link>
          </div>
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="press size-10 text-white lg:hidden ml-auto grid place-items-center rounded-full bg-ink"
          >
            <Menu className="size-5" aria-hidden />
            <span className="sr-only">Open menu</span>
          </button>
        </div>
      </header>
      {open && <MenuSheet onClose={close} />}
    </>
  )
}

/** The phone menu: a full-height sheet that holds focus until Escape, the close button or a link. */
function MenuSheet({ onClose }: { onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const openedAt = useRef(pathname)

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  // Back and forward navigations close it too, not only taps on its links.
  useEffect(() => {
    if (pathname !== openedAt.current) onClose()
  }, [pathname, onClose])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return onClose()
    if (e.key !== 'Tab' || !sheet.current) return
    const items = [...sheet.current.querySelectorAll<HTMLElement>('a, button')]
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  return (
    <div
      ref={sheet}
      id="site-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      onKeyDown={onKeyDown}
      className="inset-0 px-4 pt-3 pb-8 lg:hidden fixed z-50 flex flex-col bg-surface"
    >
      <div className="h-14 bg-white pr-2 pl-4 flex items-center justify-between rounded-full shadow-card">
        <Link to="/" viewTransition onClick={onClose} aria-label="WIT Commerce home" className="rounded-full">
          <WitCommerce />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="press size-10 grid place-items-center rounded-full bg-surface"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close menu</span>
        </button>
      </div>
      <nav aria-label="Main" className="mt-8 gap-1 flex flex-col">
        {SITE_NAV.map((n, i) => (
          <NavLink
            key={n.to}
            to={n.to}
            viewTransition
            onClick={onClose}
            style={riseAt(i)}
            className={({ isActive }) =>
              cn(
                'rise px-5 py-4 text-3xl font-bold tracking-tight flex items-center justify-between rounded-card',
                isActive ? 'text-white bg-ink' : 'hover:bg-white text-foreground',
              )
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="gap-2 mt-auto grid">
        <Link to="/start" onClick={onClose} className={buttonClass('red')}>
          Create your store
        </Link>
        <ConsoleLink onClick={onClose} className={buttonClass('white')}>
          Sign in
        </ConsoleLink>
      </div>
    </div>
  )
}

const SITEMAP = [...SITE_NAV, { to: '/start', label: 'Create your store' }]

function Footer() {
  return (
    <footer className="px-4 pb-10 sm:px-6" style={{ viewTransitionName: 'site-footer' }}>
      <div className="max-w-6xl gap-10 pt-10 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] mx-auto grid border-t border-border">
        <div>
          <WitCommerce className="text-foreground" />
          <p className="mt-3 max-w-xs text-muted">
            Built by {COMPANY.name}, {COMPANY.tagline.toLowerCase()}.
          </p>
          <ul className="mt-5 gap-2 flex flex-wrap">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="press bg-white px-3 py-1.5 text-xs font-semibold inline-flex rounded-full shadow-card hover:bg-surface-2"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Sitemap">
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Site</p>
          <ul className="mt-3 gap-x-4 gap-y-2 md:grid-cols-1 grid grid-cols-2">
            {SITEMAP.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  viewTransition
                  className="rounded text-body hover:text-foreground hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <ConsoleLink className="rounded text-body hover:text-foreground hover:underline">
                Sign in
              </ConsoleLink>
            </li>
          </ul>
        </nav>
        <div>
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">{COMPANY.legalName}</p>
          <OfficeList className="mt-3 text-sm" />
        </div>
      </div>
      <p className="mt-10 max-w-6xl text-xs mx-auto text-muted">{copyright()}</p>
    </footer>
  )
}
