import { fmtIdr } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { Heart, type LucideIcon, Menu, Search, ShoppingBag, Store, UserRound } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router'
import { BrandLogo } from '../../components/BrandLogo'
import { CategoryMenu, GreetingBar, ReferralBanner } from '../../components/shell'
import { popularCategories } from '../../lib/catalog'
import { firstName, paths } from '../../lib/paths'
import { EMBED } from '../../lib/embed'
import { RETURNS_POLICY } from '../../lib/policy'
import { usePersisted } from '../../lib/storage'
import { useIsPhone } from '../../lib/useIsPhone'
import { useShop } from '../../state/shop'
import { Intro } from './Intro'

function DesktopHeader({ onCategories, menuOpen }: { onCategories: () => void; menuOpen: boolean }) {
  const { tenant, store, cart, customer } = useShop()
  const { pathname } = useLocation()
  const shopActive = /\/(search|c|p|collections)(\/|$)/.test(pathname.slice(store.length + 1))
  const link = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center px-3 text-sm font-semibold transition hover:opacity-80',
      active ? 'text-[color:var(--sf-accent)]' : 'text-[color:var(--sf-on-primary)]',
    )
  return (
    <div className="h-16 gap-4 pr-2 pl-3 flex items-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)] shadow-float">
      <Link to={paths.home(store)} className="min-h-11 min-w-0 flex items-center">
        <BrandLogo tenant={tenant} inverse />
      </Link>
      <nav aria-label="Main" className="mx-auto flex items-center">
        <Link
          to={paths.search(store, '', { sort: 'best' })}
          className={link(shopActive)}
          aria-current={shopActive ? 'page' : undefined}
        >
          Shop
        </Link>
        <button type="button" onClick={onCategories} aria-expanded={menuOpen} className={link(menuOpen)}>
          Categories
        </button>
        {/* Tablets keep Shop and Categories; the rest returns from lg up so the bar never overflows. */}
        <Link to={`${paths.home(store)}#testimonials`} className={cn(link(false), 'lg:inline-flex hidden')}>
          Testimonials
        </Link>
        <Link
          to={paths.account(store)}
          className={cn(link(pathname.endsWith('/account')), 'lg:inline-flex hidden')}
        >
          Rewards
        </Link>
      </nav>
      <div className="gap-2 flex shrink-0 items-center">
        <Link
          to={paths.search(store)}
          aria-label="Search the store"
          className="size-11 inline-flex items-center justify-center rounded-full bg-[var(--sf-bg)] text-[color:var(--sf-text)]"
        >
          <Search className="size-5" aria-hidden="true" />
        </Link>
        <Link
          to={paths.cart(store)}
          aria-label={`Cart, ${cart.count} items`}
          className="size-11 relative inline-flex items-center justify-center rounded-full bg-[var(--sf-bg)] text-[color:var(--sf-text)]"
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
          {!!cart.count && (
            <span
              aria-hidden="true"
              className="-top-1 -right-1 h-5 min-w-5 px-1 font-bold absolute flex items-center justify-center rounded-full bg-[var(--sf-accent)] text-[10px] text-[color:var(--sf-on-accent)]"
            >
              {cart.count}
            </span>
          )}
        </Link>
        {customer ? (
          <Link
            to={paths.account(store)}
            className="min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-full bg-[var(--sf-bg)] text-[color:var(--sf-text)]"
          >
            Hi, {firstName(customer.name)}
          </Link>
        ) : (
          <>
            <Link
              to={paths.account(store)}
              className="min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-full bg-[var(--sf-bg)] text-[color:var(--sf-text)]"
            >
              Sign in
            </Link>
            <Link
              to={`${paths.account(store)}?join=1`}
              className="min-h-11 px-5 text-sm font-semibold lg:inline-flex hidden items-center rounded-full border border-current"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function PhoneHeader({ onMenu }: { onMenu: () => void }) {
  const { tenant, store, cart, catalog } = useShop()
  return (
    <div className="mx-3 mt-2 md:hidden backdrop-blur-md pointer-events-auto overflow-hidden rounded-[22px] bg-[var(--sf-bg)]/90 shadow-float">
      <div className="h-14 px-2 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open the menu"
          className="size-11 inline-flex items-center justify-center"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Link to={paths.home(store)} className="min-h-11 min-w-0 flex items-center justify-center">
          <BrandLogo tenant={tenant} />
        </Link>
        <Link to={paths.cart(store)} className="min-h-11 px-2 text-sm font-semibold inline-flex items-center">
          Cart ({cart.count})
        </Link>
      </div>
      <nav
        aria-label="Shop"
        className="h-11 gap-5 px-4 text-sm no-scrollbar flex items-center overflow-x-auto border-t border-[color:var(--sf-line)] whitespace-nowrap"
      >
        <Link
          to={paths.search(store)}
          aria-label="Search"
          className="-ml-3.5 min-h-11 min-w-11 inline-flex items-center justify-center"
        >
          <Search className="size-4" aria-hidden="true" />
        </Link>
        <Link to={paths.search(store, '', { sort: 'best' })} className="min-h-11 inline-flex items-center">
          Shop
        </Link>
        <Link to={paths.search(store, '', { sort: 'new' })} className="min-h-11 inline-flex items-center">
          New arrivals
        </Link>
        {popularCategories(catalog).map((c) => (
          <Link key={c.id} to={paths.category(store, c.id)} className="min-h-11 inline-flex items-center">
            {c.name}
          </Link>
        ))}
      </nav>
    </div>
  )
}

function TabBar() {
  const { store, cart } = useShop()
  const { pathname } = useLocation()
  const tabs: { label: string; icon: LucideIcon; to: string; count?: number }[] = [
    { label: 'Shop', icon: Store, to: paths.home(store) },
    { label: 'Search', icon: Search, to: paths.search(store) },
    { label: 'Wishlist', icon: Heart, to: paths.wishlist(store) },
    { label: 'Cart', icon: ShoppingBag, to: paths.cart(store), count: cart.count },
    { label: 'Account', icon: UserRound, to: paths.account(store) },
  ]
  return (
    <nav
      aria-label="Shop sections"
      className="inset-x-0 bottom-0 md:hidden fixed z-40 grid grid-cols-5 border-t border-[color:var(--sf-line)] bg-[var(--sf-bg)] pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map(({ label, icon: Icon, to, count }) => {
        const active = pathname === to
        return (
          <Link
            key={label}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'min-h-14 gap-0.5 flex flex-col items-center justify-center text-[11px]',
              active ? 'font-bold' : 'text-[color:var(--sf-muted)]',
            )}
          >
            <span className="relative">
              <Icon className="size-5" aria-hidden="true" />
              {!!count && (
                <span
                  aria-hidden="true"
                  className="-top-1.5 -right-2.5 h-4 min-w-4 px-1 font-bold absolute flex items-center justify-center rounded-full bg-[var(--sf-text)] text-[9px] text-[color:var(--sf-bg)]"
                >
                  {count}
                </span>
              )}
            </span>
            {label}
            {!!count && <span className="sr-only">, {count} items</span>}
          </Link>
        )
      })}
    </nav>
  )
}

function Footer() {
  const { tenant, catalog } = useShop()
  return (
    <footer
      id="help"
      className="mt-6 px-4 pt-10 pb-28 md:mt-12 md:px-6 md:pb-12 lg:px-10 border-t border-[color:var(--sf-line)] text-center"
    >
      <p className="sf-display text-2xl font-bold">{tenant.name}</p>
      <p className="mt-1 text-sm text-[color:var(--sf-muted)]">{tenant.brand.tagline}</p>
      <ul className="mt-6 max-w-2xl space-y-1 text-sm mx-auto text-[color:var(--sf-muted)]">
        <li>Free shipping on orders from {fmtIdr(tenant.loyalty.freeShippingMin)}.</li>
        <li>{RETURNS_POLICY[tenant.industry]}</li>
        <li>
          Pay with{' '}
          {catalog.paymentTypes
            .filter((t) => t.enabled)
            .map((t) => t.name)
            .join(', ')}
          .
        </li>
      </ul>
      <p className="mt-6 text-xs text-[color:var(--sf-muted)]">
        © {tenant.name}. Prices in rupiah, taxes included.
      </p>
    </footer>
  )
}

/** Theme 2 · Showcase shell: a primary pill header on a tinted band on desktop, an editorial header and tab bar on phones. */
export function Layout({ children }: { children: ReactNode }) {
  const { tenant } = useShop()
  const [menuOpen, setMenuOpen] = useState(false)
  const isHome = !!useMatch('/:store')
  const isPhone = useIsPhone()
  const { pathname } = useLocation()
  const [introSeen, setIntroSeen] = usePersisted<boolean>('local', `rc.storefront.intro.${tenant.id}`, false)
  const pinned = pathname.includes('/p/') || pathname.endsWith('/checkout')

  if (isHome && isPhone && !introSeen && !EMBED) return <Intro onDone={() => setIntroSeen(true)} />

  return (
    <>
      <a
        href="#main"
        className="px-4 py-2 focus:top-2 focus:left-2 sr-only z-50 bg-[var(--sf-text)] text-[color:var(--sf-bg)] focus:not-sr-only focus:fixed"
      >
        Skip to content
      </a>
      {isHome && <GreetingBar className="bg-[var(--sf-text)] text-[color:var(--sf-bg)]" />}
      <ReferralBanner className="border-b border-[color:var(--sf-line)]" />
      <header className="top-0 md:-mb-20 pointer-events-none sticky z-40">
        <PhoneHeader onMenu={() => setMenuOpen(true)} />
        <div className="px-6 pt-4 lg:px-10 md:block hidden">
          <div className="pointer-events-auto">
            <DesktopHeader onCategories={() => setMenuOpen(true)} menuOpen={menuOpen} />
          </div>
        </div>
      </header>
      <main
        id="main"
        className={cn(isHome ? 'pb-6 md:pb-10' : 'px-4 pt-4 pb-6 md:px-6 md:pt-28 md:pb-10 lg:px-10 w-full')}
      >
        {children}
      </main>
      <Footer />
      {!pinned && <TabBar />}
      <CategoryMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  )
}
