import { fmtDate, fmtIdr, initials } from '@rc/fixtures'
import { LIFECYCLE_STAGE_LABEL, LOYALTY_TIER_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
import { Package } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, ButtonLink, EmptyState, Field, describedBy, inputClass } from '../components/ui'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'

/** Sign in by email (demo customers, no password) and see points and orders. */
export function AccountPage() {
  const { customer, customers, orders, signIn, signOut, store, tenant } = useShop()
  const id = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const joining = useSearchParams()[0].get('join') === '1'
  useTitle(`${customer ? 'Your account' : 'Sign in'} · ${tenant.name}`)
  const demo = useMemo(
    () =>
      [
        customers.find((c) => c.stage === 'vip'),
        customers.find((c) => c.stage === 'repeat_buyer'),
        customers.find((c) => c.stage === 'first_buyer'),
      ].filter((c): c is NonNullable<typeof c> => !!c),
    [customers],
  )
  const mine = useMemo(
    () =>
      customer
        ? orders
            .filter((o) => o.customerId === customer.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 10)
        : [],
    [customer, orders],
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const match = customers.find((c) => c.email.toLowerCase() === email.trim().toLowerCase())
    if (!match) {
      setError(
        'We could not find an account with that email. Check the spelling, or place an order as a guest to create one.',
      )
      return
    }
    setError(null)
    signIn(match.id)
  }

  if (!customer)
    return (
      <div className="max-w-md space-y-6 md:pt-12 mx-auto">
        <h1 className="sf-display text-3xl font-bold">{joining ? `Join ${tenant.name}` : 'Sign in'}</h1>
        {joining && (
          <p className="text-[color:var(--sf-muted)]">
            Your member account is created with your first order, and you earn points from day one. Already
            shop with us? Sign in below.
          </p>
        )}
        <form onSubmit={submit} noValidate className="sf-card space-y-4 p-6">
          <Field
            id={id}
            label="Email"
            error={error}
            hint="Use the email you shop with. This demo store has no passwords."
          >
            <input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              {...describedBy(id, error, 'hint')}
            />
          </Field>
          <Button type="submit" size="lg" full>
            Sign in
          </Button>
        </form>
        {demo.length > 0 && (
          <section className="sf-card p-6" aria-labelledby="demo-h">
            <h2 id="demo-h" className="text-sm font-bold">
              Demo accounts
            </h2>
            <ul className="mt-3 space-y-2">
              {demo.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => signIn(c.id)}
                    className="min-h-12 gap-3 px-2 flex w-full items-center rounded-[var(--sf-tile-radius)] text-left hover:bg-[var(--sf-soft)]"
                  >
                    <span
                      aria-hidden="true"
                      className="size-9 text-xs font-bold text-white flex shrink-0 items-center justify-center rounded-full"
                      style={{ background: c.color }}
                    >
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold block truncate">Sign in as {c.name}</span>
                      <span className="text-xs block truncate text-[color:var(--sf-muted)]">
                        {LIFECYCLE_STAGE_LABEL[c.stage]} · {LOYALTY_TIER_LABEL[c.tier]}
                      </span>
                      <span className="text-xs block truncate text-[color:var(--sf-muted)]">{c.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    )

  return (
    <div className="max-w-3xl space-y-6 md:pt-12 mx-auto">
      <section className="sf-card gap-4 p-6 flex flex-wrap items-center">
        <span
          aria-hidden="true"
          className="size-16 text-xl font-bold text-white flex shrink-0 items-center justify-center rounded-full"
          style={{ background: customer.color }}
        >
          {initials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="sf-display text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-[color:var(--sf-muted)]">
            {LOYALTY_TIER_LABEL[customer.tier]} member · {customer.points} points ·{' '}
            {LIFECYCLE_STAGE_LABEL[customer.stage]}
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </section>
      <section className="sf-card p-6" aria-labelledby="orders-h">
        <h2 id="orders-h" className="sf-display mb-3 text-xl font-bold">
          Your orders
        </h2>
        {mine.length ? (
          <ul className="divide-y divide-[color:var(--sf-line)]">
            {mine.map((o) => (
              <li key={o.id}>
                <Link
                  to={paths.order(store, o.id)}
                  className="min-h-14 gap-2 py-3 flex flex-wrap items-center justify-between hover:underline"
                >
                  <span>
                    <span className="text-sm font-semibold block font-mono">{o.code}</span>
                    <span className="text-xs text-[color:var(--sf-muted)]">
                      {fmtDate(o.createdAt)} · {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </span>
                  <span className="font-semibold">{fmtIdr(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Package aria-hidden="true" />}
            title="No orders yet"
            text="Your orders show here once you check out."
            action={<ButtonLink to={paths.home(store)}>Start shopping</ButtonLink>}
            className="shadow-none"
          />
        )}
      </section>
    </div>
  )
}
