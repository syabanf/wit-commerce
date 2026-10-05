import { fmtIdr, initials } from '@rc/fixtures'
import type { Promotion } from '@rc/types'
import { cn } from '@rc/ui'
import { ChevronRight, Sparkles, UserRound, X } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import { popularCategories, productsIn, welcomePromotion } from '../lib/catalog'
import { firstName, paths } from '../lib/paths'
import { useNow, useShop } from '../state/shop'
import { Drawer } from './Drawer'
import { CategoryIcon } from './product'

export const offerText = (p: Promotion) =>
  p.kind === 'percentage' ? `${p.value}% off` : p.kind === 'fixed' ? `${fmtIdr(p.value)} off` : p.name

export const isVipCustomer = (c: { stage: string; tier: string }) =>
  c.stage === 'vip' || c.tier === 'gold' || c.tier === 'platinum'

/** Spec 39 personalisation: a guest sees the first-order code, a returning customer is greeted by name. */
export function GreetingBar({ className }: { className?: string }) {
  const { customer, catalog, store, tenant } = useShop()
  const now = useNow()
  const welcome = welcomePromotion(catalog, now)
  let content
  if (!customer)
    content = welcome ? (
      <>
        Get {offerText(welcome)} your first order with{' '}
        <strong className="px-2 py-0.5 font-black rounded-full border border-dashed border-current tracking-[0.12em]">
          {welcome.code}
        </strong>
      </>
    ) : (
      <>Free shipping on orders from {fmtIdr(tenant.loyalty.freeShippingMin)}</>
    )
  else
    content = (
      <>
        Welcome back, {firstName(customer.name)}.{' '}
        {isVipCustomer(customer) ? (
          <Link
            to={paths.search(store, '', { sort: 'new' })}
            className="min-h-11 gap-1 font-bold inline-flex items-center underline underline-offset-4"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            Early access for members
          </Link>
        ) : (
          <span className="opacity-80">You have {customer.points} points to spend.</span>
        )}
      </>
    )
  return (
    <div
      className={cn(
        'min-h-11 px-4 py-1.5 text-xs sm:text-sm flex items-center justify-center text-center',
        className,
      )}
    >
      <p>{content}</p>
    </div>
  )
}

/** "Shopping with Fahmi" while a seller referral is active, so the shopper knows who gets the credit. */
export function ReferralBanner({ className }: { className?: string }) {
  const { referral, setReferral, store } = useShop()
  if (!referral) return null
  return (
    <div className={cn('gap-2 px-14 py-1 text-sm relative flex items-center justify-center', className)}>
      <span
        aria-hidden="true"
        className="size-7 font-bold flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-[10px] text-[color:var(--sf-on-primary)]"
      >
        {initials(referral.name)}
      </span>
      <p className="min-w-0 truncate">
        Shopping with{' '}
        <Link to={paths.seller(store, referral.slug)} className="font-bold underline underline-offset-4">
          {firstName(referral.name)}
        </Link>
      </p>
      <button
        type="button"
        onClick={() => setReferral(null)}
        className="right-2 size-11 absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full hover:bg-[var(--sf-soft)]"
        aria-label={`Stop shopping with ${referral.name}`}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Every top-level category with its sub-categories, in a side drawer. */
export function CategoryMenu({
  open,
  onOpenChange,
  extra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  extra?: { label: string; to: string }[]
}) {
  const { catalog, store, customer } = useShop()
  const close = () => onOpenChange(false)
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title="All categories"
      description={catalog.tenant.brand.tagline}
    >
      <nav aria-label="Categories">
        <ul className="space-y-1">
          {catalog.topCategories.map((c) => {
            const subs = catalog.childrenOf.get(c.id) ?? []
            return (
              <li key={c.id}>
                <Link
                  to={paths.category(store, c.id)}
                  onClick={close}
                  className="min-h-11 gap-3 px-3 font-semibold flex items-center rounded-[var(--sf-tile-radius)] hover:bg-[var(--sf-soft)]"
                >
                  <CategoryIcon category={c} className="text-[color:var(--sf-primary)]" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-[color:var(--sf-muted)]">
                    {productsIn(catalog, c.id).length}
                  </span>
                </Link>
                {subs.length > 0 && (
                  <ul className="mb-1 ml-11 border-l border-[color:var(--sf-line)]">
                    {subs.map((s) => (
                      <li key={s.id}>
                        <Link
                          to={paths.category(store, s.id)}
                          onClick={close}
                          className="min-h-11 px-3 text-sm flex items-center hover:underline"
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <ul className="mt-4 space-y-1 pt-4 border-t border-[color:var(--sf-line)]">
          {[
            ...(extra ?? []),
            { label: customer ? 'Your account' : 'Sign in', to: paths.account(store) },
            { label: 'Wishlist', to: paths.wishlist(store) },
          ].map((l) => (
            <li key={l.label}>
              <Link
                to={l.to}
                onClick={close}
                className="min-h-11 px-3 text-sm font-semibold flex items-center justify-between hover:underline"
              >
                {l.label}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Drawer>
  )
}

/** Sends a search to the search page, optionally inside one category. */
export function useSearchSubmit() {
  const { store } = useShop()
  const navigate = useNavigate()
  return useCallback(
    (q: string, cat?: string) => navigate(paths.search(store, q.trim(), cat ? { cat } : {})),
    [navigate, store],
  )
}

/** Zero-result help: popular categories and a way back. */
export function SearchSuggestions({ query }: { query: string }) {
  const { catalog, store } = useShop()
  const popular = popularCategories(catalog).slice(0, 6)
  return (
    <div className="sf-card px-5 py-10 text-center">
      <h2 className="sf-display text-xl font-bold">Nothing matches "{query}"</h2>
      <p className="mt-1 max-w-md text-sm mx-auto text-[color:var(--sf-muted)]">
        Check the spelling, use a shorter word, or start from one of the popular categories.
      </p>
      <ul className="mt-5 gap-2 flex flex-wrap justify-center">
        {popular.map((c) => (
          <li key={c.id}>
            <Link
              to={paths.category(store, c.id)}
              className="min-h-11 gap-2 px-4 text-sm font-semibold inline-flex items-center rounded-full border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)]"
            >
              <CategoryIcon category={c} className="size-4" />
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Account entry for headers: avatar initials when signed in. */
export function AccountGlyph({ className }: { className?: string }) {
  const { customer } = useShop()
  if (!customer) return <UserRound className={cn('size-5', className)} aria-hidden="true" />
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-6 font-bold text-white flex items-center justify-center rounded-full text-[10px]',
        className,
      )}
      style={{ background: customer.color }}
    >
      {initials(customer.name)}
    </span>
  )
}
