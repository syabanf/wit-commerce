import { fmtDate, fmtIdr, initials } from '@rc/fixtures'
import { LIFECYCLE_STAGE_LABEL, LOYALTY_TIER_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
import { Package } from 'lucide-react'
import { ApiError } from '@rc/api'
import { type ChangeEvent, type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, ButtonLink, EmptyState, Field, describedBy, inputClass } from '../components/ui'
import { HTTP, api } from '../lib/api'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'

/** Sign in and see points and orders. The demo without an API signs in by email alone. */
export function AccountPage() {
  const { customer, customers, orders, signIn, signOut, store, tenant } = useShop()
  const id = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const joining = params.get('join') === '1'
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

  const resetToken = HTTP ? params.get('reset') : null
  if (resetToken) return <ResetForm token={resetToken} />

  if (!customer)
    return (
      <div className="max-w-md space-y-6 md:pt-12 mx-auto">
        {!HTTP && (
          <h1 className="sf-display text-3xl font-bold">{joining ? `Join ${tenant.name}` : 'Sign in'}</h1>
        )}
        {HTTP && <VerifyNotice />}
        {HTTP && <AccountForm joining={joining} />}
        {!HTTP && joining && (
          <p className="text-[color:var(--sf-muted)]">
            Your member account is created with your first order, and you earn points from day one. Already
            shop with us? Sign in below.
          </p>
        )}
        {!HTTP && (
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
        )}
        {demo.length > 0 && (
          <section className="sf-card p-6" aria-labelledby="demo-h">
            <h2 id="demo-h" className="text-sm font-bold">
              Demo accounts
            </h2>
            <ul className="mt-3 -mx-2 space-y-2">
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
      {HTTP && <VerifyNotice />}
      {HTTP && <ConfirmEmailCard />}
      {HTTP && <PasswordCard />}
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

/** A next path from the URL, kept inside this site. */
const safeNext = (next: string | null) => (next?.startsWith('/') && !next.startsWith('//') ? next : null)

/** API mode: sign in or create an account with a password. */
function AccountForm({ joining }: { joining: boolean }) {
  const { signInWithPassword, register, store, tenant } = useShop()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = useId()
  const [creating, setCreating] = useState(joining)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if ((creating && !form.name.trim()) || !form.email.trim() || !form.password) {
      setError(creating ? 'Enter your name, email and password.' : 'Enter your email and password.')
      return
    }
    setBusy(true)
    const failed = creating ? await register(form) : await signInWithPassword(form.email, form.password)
    setBusy(false)
    setError(failed)
    if (!failed) navigate(safeNext(params.get('next')) ?? paths.account(store), { replace: true })
  }

  return (
    <>
      <h1 className="sf-display text-3xl font-bold">{creating ? `Join ${tenant.name}` : 'Sign in'}</h1>
      <form onSubmit={(e) => void submit(e)} noValidate className="sf-card space-y-4 p-6">
        {creating && (
          <Field id={`${id}-name`} label="Full name">
            <input
              id={`${id}-name`}
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              className={inputClass}
            />
          </Field>
        )}
        <Field id={`${id}-email`} label="Email">
          <input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete={creating ? 'email' : 'username'}
            value={form.email}
            onChange={set('email')}
            className={inputClass}
          />
        </Field>
        {creating && (
          <Field id={`${id}-phone`} label="Phone">
            <input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set('phone')}
              className={inputClass}
            />
          </Field>
        )}
        <Field
          id={`${id}-password`}
          label="Password"
          error={error}
          hint={creating ? '10 or more characters.' : undefined}
        >
          <input
            id={`${id}-password`}
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={form.password}
            onChange={set('password')}
            className={inputClass}
            {...describedBy(`${id}-password`, error, 'hint')}
          />
        </Field>
        <Button type="submit" size="lg" full disabled={busy}>
          {creating ? 'Create account' : 'Sign in'}
        </Button>
        {!creating && <ForgotButton email={form.email} />}
        <button
          type="button"
          onClick={() => {
            setCreating((c) => !c)
            setError(null)
          }}
          className="min-h-11 text-sm font-semibold w-full underline underline-offset-4"
        >
          {creating ? 'I already have an account' : 'Create an account'}
        </button>
      </form>
    </>
  )
}

/** API mode: a guest from checkout sets a first password here; a member changes theirs. */
function PasswordCard() {
  const { hasPassword, setPassword } = useShop()
  const id = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    if (next.length < 10) return setError('Use a password of 10 or more characters.')
    setBusy(true)
    const failed = await setPassword(current, next)
    setBusy(false)
    setError(failed)
    if (!failed) {
      setSaved(true)
      setCurrent('')
      setNext('')
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="sf-card space-y-4 p-6">
      <h2 className="sf-display text-xl font-bold">{hasPassword ? 'Change password' : 'Set a password'}</h2>
      {!hasPassword && (
        <p className="text-sm text-[color:var(--sf-muted)]">
          Set one to sign in on other devices and see your orders.
        </p>
      )}
      {hasPassword && (
        <Field id={`${id}-current`} label="Current password">
          <input
            id={`${id}-current`}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      <Field id={`${id}-new`} label="New password" error={error} hint="10 or more characters.">
        <input
          id={`${id}-new`}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputClass}
          {...describedBy(`${id}-new`, error, 'hint')}
        />
      </Field>
      {saved && (
        <p role="status" className="text-sm font-semibold">
          Password saved.
        </p>
      )}
      <Button type="submit" variant="outline" disabled={busy}>
        Save password
      </Button>
    </form>
  )
}

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'The store did not answer. Try again in a moment.'

/** Emails a link to the address typed above it. */
function ForgotButton({ email }: { email: string }) {
  const { store } = useShop()
  const [note, setNote] = useState<string | null>(null)

  const send = async () => {
    if (!email.trim()) return setNote('Enter your email above, and we will send a link to it.')
    try {
      const { message } = await api.shop.forgotPassword(store, email)
      setNote(message)
    } catch (err) {
      setNote(messageOf(err))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void send()}
        className="min-h-11 text-sm font-semibold w-full underline underline-offset-4"
      >
        Forgot your password?
      </button>
      {note && (
        <p role="status" className="text-sm text-center">
          {note}
        </p>
      )}
    </>
  )
}

/** Sets a new password with the token from an email link. */
function ResetForm({ token }: { token: string }) {
  const { store } = useShop()
  const navigate = useNavigate()
  const id = useId()
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 10) return setError('Use a password of 10 or more characters.')
    setBusy(true)
    setError(null)
    try {
      await api.shop.resetPassword(store, token, next)
      navigate(paths.account(store), { replace: true })
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md space-y-6 md:pt-12 mx-auto">
      <h1 className="sf-display text-3xl font-bold">Choose a new password</h1>
      <form onSubmit={(e) => void submit(e)} noValidate className="sf-card space-y-4 p-6">
        <Field id={id} label="New password" error={error} hint="10 or more characters.">
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputClass}
            {...describedBy(id, error, 'hint')}
          />
        </Field>
        <Button type="submit" size="lg" full disabled={busy}>
          Save password
        </Button>
      </form>
    </div>
  )
}

/** Spends a confirmation link from the URL once and says how it went. */
function VerifyNotice() {
  const { store, reloadAccount } = useShop()
  const [params, setParams] = useSearchParams()
  const token = params.get('verify')
  const spent = useRef(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!token || spent.current) return
    spent.current = true
    setParams({}, { replace: true })
    api.shop
      .verifyEmail(store, token)
      .then(() => {
        setNote('Your email is confirmed. Earlier guest orders with this email are in your account now.')
        reloadAccount()
      })
      .catch((err: unknown) => setNote(messageOf(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spends the link once
  }, [token])

  if (!note) return null
  return (
    <p role="status" className="sf-card p-4 text-sm font-semibold">
      {note}
    </p>
  )
}

/** Offers a confirmation link until the inbox is proven. */
function ConfirmEmailCard() {
  const { customer, emailOn, emailVerified, store } = useShop()
  const [note, setNote] = useState<string | null>(null)
  if (!emailOn || emailVerified || !customer) return null

  const send = async () => {
    try {
      await api.shop.sendVerifyEmail(store)
      setNote(`We sent a link to ${customer.email}.`)
    } catch (err) {
      setNote(messageOf(err))
    }
  }

  return (
    <section className="sf-card gap-4 p-6 flex flex-wrap items-center justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold">Confirm your email</h2>
        <p role="status" className="text-sm text-[color:var(--sf-muted)]">
          {note ?? 'Confirming brings your earlier guest orders into this account.'}
        </p>
      </div>
      <Button variant="outline" onClick={() => void send()}>
        Send link
      </Button>
    </section>
  )
}
