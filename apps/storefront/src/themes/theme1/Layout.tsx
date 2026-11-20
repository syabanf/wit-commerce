import { fmtIdr } from '@rc/fixtures'
import { cn } from '@rc/ui'
import {
  Heart,
  House,
  LayoutGrid,
  type LucideIcon,
  Menu,
  Package,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useState } from 'react'
import { Link, useLocation, useMatch, useSearchParams } from 'react-router'
import { BrandLogo } from '../../components/BrandLogo'
import {
  AccountGlyph,
  CategoryMenu,
  GreetingBar,
  ReferralBanner,
  useSearchSubmit,
} from '../../components/shell'
import { IconButton } from '../../components/ui'
import { SuggestInput } from '../../components/SearchSuggest'
import { useStoreMenu } from '../../lib/menus'
import { paths } from '../../lib/paths'
import { MenuLink } from '../../components/MenuLink'
import { RETURNS_POLICY } from '../../lib/policy'
import { useShop } from '../../state/shop'
import { CurrencySwitcher } from '../../components/Money'
import { SellerIdentity } from '../../components/SellerIdentity'
import { t, tp } from '../../i18n'
import { LanguageSwitch } from '../../i18n/LanguageSwitch'

export function Logo({ className }: { className?: string }) {
  const { tenant, store } = useShop()
  return (
    <Link to={paths.home(store)} className={cn('min-h-11 min-w-0 flex items-center', className)}>
      <BrandLogo tenant={tenant} />
    </Link>
  )
}

function SearchPill({ withCategory, className }: { withCategory?: boolean; className?: string }) {
  const { catalog } = useShop()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState(params.get('cat') ?? '')
  const submit = useSearchSubmit()
  const id = useId()
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit(q, cat)
  }
  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className={cn(
        'h-12 min-w-0 p-1 relative flex items-center rounded-full border border-[color:var(--sf-line)] bg-[var(--sf-canvas)]',
        className,
      )}
    >
      {withCategory && (
        <>
          <label htmlFor={`${id}-cat`} className="sr-only">
            {t('shell.search.in')}
          </label>
          <select
            id={`${id}-cat`}
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="h-10 max-w-44 min-w-0 pr-2 pl-3 text-sm font-semibold lg:block hidden truncate rounded-full bg-transparent"
          >
            <option value="">{t('shell.allCategories')}</option>
            {catalog.topCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="h-6 lg:block hidden w-px shrink-0 bg-[var(--sf-line)]" />
        </>
      )}
      <Search
        className={cn('ml-3 size-4 shrink-0 text-[color:var(--sf-muted)]', withCategory && 'lg:hidden')}
        aria-hidden="true"
      />
      <label htmlFor={`${id}-q`} className="sr-only">
        {t('shell.search.products')}
      </label>
      <SuggestInput
        id={`${id}-q`}
        value={q}
        onChange={setQ}
        placeholder={withCategory ? t('shell.search.productsAndBrands') : t('shell.search.products')}
        className="h-10 min-w-0 px-3 text-base md:text-sm flex-1 bg-transparent placeholder:text-[color:var(--sf-muted)]"
      />
      {withCategory && (
        <button
          type="submit"
          className="h-10 px-4 text-sm font-semibold lg:px-6 shrink-0 rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]"
        >
          {t('shell.search')}
        </button>
      )}
    </form>
  )
}

function HeaderAction({
  to,
  icon,
  label,
  count,
}: {
  to: string
  icon: ReactNode
  label: string
  count?: number
}) {
  return (
    <Link
      to={to}
      aria-label={count ? `${label}, ${tp('shell.items', count)}` : label}
      className="min-h-11 min-w-11 gap-0.5 rounded-2xl px-2 py-1 font-semibold lg:min-w-16 relative flex flex-col items-center justify-center text-[11px] hover:bg-[var(--sf-soft)]"
    >
      {icon}
      <span className="lg:inline hidden">{label}</span>
      {!!count && (
        <span className="top-0 right-2 h-5 min-w-5 px-1 font-bold absolute flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[10px] text-[color:var(--sf-on-primary)]">
          {count}
        </span>
      )}
    </Link>
  )
}

function BottomBar({ onCategories, categoriesOpen }: { onCategories: () => void; categoriesOpen: boolean }) {
  const { store, cart } = useShop()
  const { pathname } = useLocation()
  const items: {
    key: string
    label: string
    icon: LucideIcon
    to?: string
    active: boolean
    count?: number
  }[] = [
    {
      key: 'home',
      label: t('shell.nav.home'),
      icon: House,
      to: paths.home(store),
      active: pathname === paths.home(store),
    },
    { key: 'cat', label: t('shell.nav.categories'), icon: LayoutGrid, active: categoriesOpen || pathname.includes('/c/') },
    {
      key: 'wish',
      label: t('shell.nav.wishlist'),
      icon: Heart,
      to: paths.wishlist(store),
      active: pathname === paths.wishlist(store),
    },
    {
      key: 'cart',
      label: t('shell.nav.cart'),
      icon: ShoppingBag,
      to: paths.cart(store),
      active: pathname === paths.cart(store),
      count: cart.count,
    },
    {
      key: 'me',
      label: t('shell.nav.account'),
      icon: UserRound,
      to: paths.account(store),
      active: pathname === paths.account(store),
    },
  ]
  return (
    <nav
      aria-label={t('shell.nav.sections')}
      className="inset-x-3 bottom-3 px-2 py-1.5 md:hidden fixed z-40 flex items-center justify-between rounded-full bg-[var(--sf-text)] text-[color:var(--sf-bg)] shadow-float"
    >
      {items.map(({ key, label, icon: Icon, to, active, count }) => {
        const inner = (
          <>
            <span
              className={cn(
                'size-11 relative flex items-center justify-center rounded-full',
                active && 'bg-[var(--sf-bg)] text-[color:var(--sf-text)]',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {!!count && (
                <span className="-top-0.5 -right-0.5 h-4.5 min-w-4.5 px-1 font-bold absolute flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[10px] text-[color:var(--sf-on-primary)]">
                  {count}
                </span>
              )}
            </span>
            <span className="sr-only">
              {label}
              {count ? `, ${tp('shell.items', count)}` : ''}
            </span>
          </>
        )
        return to ? (
          <Link
            key={key}
            to={to}
            aria-current={active ? 'page' : undefined}
            className="flex flex-1 justify-center"
          >
            {inner}
          </Link>
        ) : (
          <button
            key={key}
            type="button"
            onClick={onCategories}
            aria-expanded={categoriesOpen}
            className="flex flex-1 justify-center"
          >
            {inner}
          </button>
        )
      })}
    </nav>
  )
}

function Footer() {
  const { tenant, catalog, store } = useShop()
  const menu = useStoreMenu('footer')
  const payNames = catalog.paymentTypes.filter((t) => t.enabled).map((t) => t.name)
  return (
    <footer className="mt-4 pb-28 md:mt-8 md:pb-0 bg-[var(--sf-bg)]">
      <div className="gap-8 px-4 py-10 sm:grid-cols-3 md:px-6 lg:grid-cols-4 lg:px-10 grid grid-cols-1">
        <div className="min-w-0 sm:col-span-3 lg:col-span-1">
          <Logo />
          <p className="mt-2 text-sm text-[color:var(--sf-muted)]">{tenant.brand.tagline}</p>
        </div>
        <nav aria-label={t('shell.footer.shop')} className="min-w-0">
          <h2 className="mb-2 text-sm font-bold">{t('shell.footer.shop')}</h2>
          <ul className="gap-x-4 text-sm sm:block grid grid-cols-2">
            {menu.length
              ? menu.map((l, i) => (
                  <li key={`${i}-${l.label}`}>
                    <MenuLink item={l} className="min-h-9 flex items-center hover:underline" />
                  </li>
                ))
              : catalog.topCategories.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={paths.category(store, c.id)}
                      className="min-h-9 flex items-center hover:underline"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
          </ul>
        </nav>
        <div id="help" className="min-w-0 scroll-mt-24">
          <h2 className="mb-2 text-sm font-bold">{t('shell.footer.help')}</h2>
          <ul className="space-y-2 text-sm text-[color:var(--sf-muted)]">
            <li>
              {t('shell.footer.freeShipping')}{' '}
              <span className="whitespace-nowrap">{fmtIdr(tenant.loyalty.freeShippingMin)}</span>.
            </li>
            <li>{t('shell.footer.couriers')}</li>
            <li>{RETURNS_POLICY[tenant.industry]}</li>
          </ul>
        </div>
        <div className="min-w-0">
          <h2 className="mb-2 text-sm font-bold">{t('shell.footer.payWith')}</h2>
          <p className="text-sm text-[color:var(--sf-muted)]">{payNames.join(', ')}.</p>
        </div>
      </div>
      <SellerIdentity className="px-4 pb-6 md:px-6 lg:px-10" />
      <div className="gap-x-4 gap-y-1 px-4 py-4 text-xs flex flex-wrap items-center justify-center border-t border-[color:var(--sf-line)] text-center text-[color:var(--sf-muted)]">
        <p>
          © {tenant.name.replace(/\.$/, '')}. {t('shell.footer.prices')}
        </p>
        <LanguageSwitch />
      </div>
    </footer>
  )
}

/** Theme 1 · Marketplace shell: search-first header, a category menu row, and a floating phone tab bar. */
export function Layout({ children }: { children: ReactNode }) {
  const { store, cart, customer } = useShop()
  const [menuOpen, setMenuOpen] = useState(false)
  const isHome = !!useMatch('/:store')
  const { pathname } = useLocation()
  const pinnedBar = pathname.includes('/p/') || pathname.endsWith('/checkout')
  const menu = useStoreMenu('header')
  const themeLinks = [
    { label: t('shell.nav.hotOffers'), to: paths.search(store, '', { deals: true }) },
    { label: t('shell.nav.newArrivals'), to: paths.search(store, '', { sort: 'new' }) },
    { label: t('shell.nav.bestSellers'), to: paths.search(store, '', { sort: 'best' }) },
    { label: t('shell.nav.gifts'), to: paths.search(store, '', { gifts: true }) },
    { label: t('shell.nav.withAgent'), to: paths.agent(store) },
  ]
  // The store's own header links replace the theme's, Help included.
  const navLinks = menu.length ? menu : themeLinks
  return (
    <>
      <a
        href="#main"
        className="px-4 py-2 focus:top-2 focus:left-2 sr-only z-50 rounded-full bg-[var(--sf-text)] text-[color:var(--sf-bg)] focus:not-sr-only focus:fixed"
      >
        {t('shell.skip')}
      </a>
      {isHome && <GreetingBar className="bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]" />}
      <ReferralBanner className="border-b border-[color:var(--sf-line)] bg-[var(--sf-soft)]" />
      <header className="px-4 pt-3 md:px-6 lg:px-10 md:sticky md:top-0 z-40">
        <div className="backdrop-blur-md rounded-[var(--sf-card-radius)] bg-[var(--sf-bg)]/90 shadow-float">
          <div className="gap-4 px-6 py-4 lg:gap-6 md:flex hidden items-center">
            <Logo className="max-w-56 shrink-0" />
            <SearchPill withCategory className="flex-1" key={`d-${pathname}`} />
            <nav aria-label={t('shell.nav.shortcuts')} className="flex shrink-0 items-center">
              <CurrencySwitcher />
              <HeaderAction
                to={paths.account(store)}
                icon={<Package className="size-5" aria-hidden="true" />}
                label={t('shell.nav.orders')}
              />
              <HeaderAction
                to={paths.wishlist(store)}
                icon={<Heart className="size-5" aria-hidden="true" />}
                label={t('shell.nav.wishlist')}
              />
              <HeaderAction
                to={paths.cart(store)}
                icon={<ShoppingBag className="size-5" aria-hidden="true" />}
                label={t('shell.nav.cart')}
                count={cart.count}
              />
              <HeaderAction
                to={paths.account(store)}
                icon={<AccountGlyph />}
                label={customer ? t('shell.nav.account') : t('shell.nav.signIn')}
              />
            </nav>
          </div>
          <div className="md:block hidden border-t border-[color:var(--sf-line)]">
            <nav aria-label={t('shell.nav.browse')} className="gap-1 px-6 py-1.5 flex items-center">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen}
                className="mr-3 h-10 gap-2 pr-4 pl-3 text-sm font-semibold inline-flex items-center rounded-full border border-[color:var(--sf-line)] transition-colors hover:bg-[var(--sf-soft)]"
              >
                <Menu className="size-4" aria-hidden="true" /> {t('shell.allCategories')}
              </button>
              {navLinks.map((l, i) => (
                <MenuLink
                  key={`${i}-${l.label}`}
                  item={{ external: false, ...l }}
                  className="min-h-11 px-3 text-sm font-medium inline-flex items-center hover:text-[color:var(--sf-primary-text)]"
                />
              ))}
              {!menu.length && (
                <a
                  href="#help"
                  className="min-h-11 px-3 text-sm font-medium inline-flex items-center hover:text-[color:var(--sf-primary-text)]"
                >
                  {t('shell.footer.help')}
                </a>
              )}
            </nav>
          </div>
          <div className="space-y-2 px-3 py-2 md:hidden">
            <div className="gap-2 flex items-center justify-between">
              <Logo className="min-w-0" />
              <Link
                to={paths.cart(store)}
                className="size-11 relative inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-soft)]"
                aria-label={`${t('shell.nav.cart')}, ${tp('shell.items', cart.count)}`}
              >
                <ShoppingBag className="size-5" aria-hidden="true" />
                {!!cart.count && (
                  <span
                    aria-hidden="true"
                    className="-top-0.5 -right-0.5 h-5 min-w-5 px-1 font-bold absolute flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[10px] text-[color:var(--sf-on-primary)]"
                  >
                    {cart.count}
                  </span>
                )}
              </Link>
            </div>
            <div className="gap-2 flex items-center">
              <SearchPill className="flex-1" key={`m-${pathname}`} />
              <CurrencySwitcher className="bg-[var(--sf-soft)]" />
              <IconButton label={t('shell.nav.browseCategories')} tone="dark" onClick={() => setMenuOpen(true)}>
                <SlidersHorizontal aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="px-4 pt-4 pb-4 md:px-6 md:pt-6 md:pb-10 lg:px-10 w-full">
        {children}
      </main>
      <Footer />
      {!pinnedBar && <BottomBar onCategories={() => setMenuOpen(true)} categoriesOpen={menuOpen} />}
      <CategoryMenu open={menuOpen} onOpenChange={setMenuOpen} extra={navLinks} />
    </>
  )
}
