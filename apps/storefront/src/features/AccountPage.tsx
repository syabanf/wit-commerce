import { fmtIdr, initials } from '@rc/fixtures'
import { Package } from 'lucide-react'
import { Turnstile } from '@rc/ui'
import { type ChangeEvent, type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, ButtonLink, EmptyState, Field, describedBy, inputClass } from '../components/ui'
import { HTTP, api } from '../lib/api'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'
import { t } from '../i18n'
import { problemText } from '../i18n/refusals'
import { fmtDate } from '../i18n/format'
import { MarketingCard, PrivacyRequestsCard } from './AccountPrivacy'
import { orderStatusLabel, stageLabel, tierLabel } from './accountLabels'

/** Sign in and see points and orders. The demo without an API signs in by email alone. */
export function AccountPage() {
  const { customer, customers, orders, signIn, signOut, store, tenant } = useShop()
  const id = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const joining = params.get('join') === '1'
  useTitle(`${customer ? t('account.yourAccount') : t('account.signIn')} · ${tenant.name}`)
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
      setError(t('account.demo.notFound'))
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
          <h1 className="sf-display text-3xl font-bold">
            {joining ? t('account.join', { store: tenant.name }) : t('account.signIn')}
          </h1>
        )}
        {HTTP && <VerifyNotice />}
        {HTTP && <AccountForm joining={joining} />}
        {!HTTP && joining && <p className="text-[color:var(--sf-muted)]">{t('account.demo.firstOrder')}</p>}
        {!HTTP && (
          <form onSubmit={submit} noValidate className="sf-card space-y-4 p-6">
            <Field id={id} label={t('account.email')} error={error} hint={t('account.demo.emailHint')}>
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
              {t('account.signIn')}
            </Button>
          </form>
        )}
        {demo.length > 0 && (
          <section className="sf-card p-6" aria-labelledby="demo-h">
            <h2 id="demo-h" className="text-sm font-bold">
              {t('account.demo.accounts')}
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
                      <span className="text-sm font-semibold block truncate">
                        {t('account.demo.signInAs', { name: c.name })}
                      </span>
                      <span className="text-xs block truncate text-[color:var(--sf-muted)]">
                        {stageLabel(c.stage)} · {tierLabel(c.tier)}
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
            {t('account.memberLine', {
              tier: tierLabel(customer.tier),
              points: customer.points,
              stage: stageLabel(customer.stage),
            })}
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          {t('account.signOut')}
        </Button>
      </section>
      {HTTP && <VerifyNotice />}
      {HTTP && <ConfirmEmailCard />}
      {HTTP && <PasswordCard />}
      <MarketingCard />
      {HTTP && <PrivacyRequestsCard />}
      <section className="sf-card p-6" aria-labelledby="orders-h">
        <h2 id="orders-h" className="sf-display mb-3 text-xl font-bold">
          {t('account.orders')}
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
                      {fmtDate(o.createdAt)} · {orderStatusLabel(o.status)}
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
            title={t('account.noOrders')}
            text={t('account.noOrdersText')}
            action={<ButtonLink to={paths.home(store)}>{t('account.startShopping')}</ButtonLink>}
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
  const [siteKey, setSiteKey] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  // A token works once, so a refused registration renders a fresh widget.
  const [captchaRound, setCaptchaRound] = useState(0)
  useEffect(() => {
    let live = true
    api
      .config()
      .then((c) => live && setSiteKey(c.turnstileSiteKey))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  const needsCaptcha = creating && !!siteKey

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if ((creating && !form.name.trim()) || !form.email.trim() || !form.password) {
      setError(creating ? t('account.form.missingJoin') : t('account.form.missing'))
      return
    }
    if (needsCaptcha && !captchaToken) {
      setError(t('account.form.captcha'))
      return
    }
    setBusy(true)
    const failed = creating
      ? await register(needsCaptcha ? { ...form, captchaToken } : form)
      : await signInWithPassword(form.email, form.password)
    setBusy(false)
    setError(failed)
    if (failed && needsCaptcha) {
      setCaptchaToken('')
      setCaptchaRound((n) => n + 1)
    }
    if (!failed) navigate(safeNext(params.get('next')) ?? paths.account(store), { replace: true })
  }

  return (
    <>
      <h1 className="sf-display text-3xl font-bold">
        {creating ? t('account.join', { store: tenant.name }) : t('account.signIn')}
      </h1>
      <form onSubmit={(e) => void submit(e)} noValidate className="sf-card space-y-4 p-6">
        {creating && (
          <Field id={`${id}-name`} label={t('account.form.name')}>
            <input
              id={`${id}-name`}
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              className={inputClass}
            />
          </Field>
        )}
        <Field id={`${id}-email`} label={t('account.email')}>
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
          <Field id={`${id}-phone`} label={t('account.form.phone')}>
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
          label={t('account.form.password')}
          error={error}
          hint={creating ? t('account.form.passwordHint') : undefined}
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
        {needsCaptcha && <Turnstile key={captchaRound} siteKey={siteKey} onToken={setCaptchaToken} />}
        <Button type="submit" size="lg" full disabled={busy}>
          {creating ? t('account.form.create') : t('account.signIn')}
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
          {creating ? t('account.form.haveAccount') : t('account.form.createAccount')}
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
    if (next.length < 10) return setError(t('account.password.tooShort'))
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
      <h2 className="sf-display text-xl font-bold">
        {hasPassword ? t('account.password.change') : t('account.password.set')}
      </h2>
      {!hasPassword && (
        <p className="text-sm text-[color:var(--sf-muted)]">{t('account.password.setIntro')}</p>
      )}
      {hasPassword && (
        <Field id={`${id}-current`} label={t('account.password.current')}>
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
      <Field
        id={`${id}-new`}
        label={t('account.password.new')}
        error={error}
        hint={t('account.form.passwordHint')}
      >
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
          {t('account.password.saved')}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={busy}>
        {t('account.password.save')}
      </Button>
    </form>
  )
}

/** Emails a link to the address typed above it. */
function ForgotButton({ email }: { email: string }) {
  const { store } = useShop()
  const [note, setNote] = useState<string | null>(null)

  const send = async () => {
    if (!email.trim()) return setNote(t('account.forgot.needEmail'))
    try {
      const { message } = await api.shop.forgotPassword(store, email)
      setNote(message)
    } catch (err) {
      setNote(problemText(err))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void send()}
        className="min-h-11 text-sm font-semibold w-full underline underline-offset-4"
      >
        {t('account.forgot')}
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
    if (next.length < 10) return setError(t('account.password.tooShort'))
    setBusy(true)
    setError(null)
    try {
      await api.shop.resetPassword(store, token, next)
      navigate(paths.account(store), { replace: true })
    } catch (err) {
      setError(problemText(err))
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md space-y-6 md:pt-12 mx-auto">
      <h1 className="sf-display text-3xl font-bold">{t('account.reset.title')}</h1>
      <form onSubmit={(e) => void submit(e)} noValidate className="sf-card space-y-4 p-6">
        <Field id={id} label={t('account.password.new')} error={error} hint={t('account.form.passwordHint')}>
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
          {t('account.password.save')}
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
        setNote(t('account.verified'))
        reloadAccount()
      })
      .catch((err: unknown) => setNote(problemText(err)))
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
      setNote(t('account.confirm.sent', { email: customer.email }))
    } catch (err) {
      setNote(problemText(err))
    }
  }

  return (
    <section className="sf-card gap-4 p-6 flex flex-wrap items-center justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold">{t('account.confirm.title')}</h2>
        <p role="status" className="text-sm text-[color:var(--sf-muted)]">
          {note ?? t('account.confirm.text')}
        </p>
      </div>
      <Button variant="outline" onClick={() => void send()}>
        {t('account.confirm.send')}
      </Button>
    </section>
  )
}
