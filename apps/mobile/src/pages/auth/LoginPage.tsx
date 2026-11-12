import type { Seller, Tenant, User } from '@rc/types'
import { ApiError } from '@rc/api'
import { Avatar, Banner, Button, FormField, Input, Kicker, toast } from '@rc/ui'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { profilesOf, useAuth } from '../../auth/auth'
import { DEMO_PASSWORD, HTTP, api } from '../../lib/api'
import { firstName } from '../../lib/seller'
import { useStore } from '../../state/store'

const rowClass =
  'flex min-h-12 w-full items-center gap-3 rounded-[20px] bg-card p-3 text-left shadow-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98]'

/** The accounts the page offers: the dataset's, or the API's demo list before anyone signs in. */
function useAccounts(): { users: User[]; sellers: Seller[]; tenants: Tenant[]; offline: boolean } {
  const { state } = useStore()
  const [remote, setRemote] = useState<{ users: User[]; sellers: Seller[]; tenants: Tenant[] } | null>(null)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    if (!HTTP) return
    api
      .demoAccounts()
      .then(({ users, sellers, tenants }) => setRemote({ users, sellers, tenants }))
      .catch((err: unknown) => {
        // A deployment with demo sign-in off answers with a 4xx; only a failure is an outage.
        setOffline(!(err instanceof ApiError) || err.status >= 500)
        setRemote({ users: [], sellers: [], tenants: [] })
      })
  }, [])
  return HTTP
    ? { ...(remote ?? { users: [], sellers: [], tenants: [] }), offline }
    : { ...state, offline: false }
}

export function LoginPage() {
  const state = useAccounts()
  const { user, loading, signIn, expired, checkPassword, openProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [picking, setPicking] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Signed in with a password and holding more than one brand: the profiles wait for a choice.
  const [profiles, setProfiles] = useState<{ token: string; sellers: Seller[] } | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (user || loading) return user ? <Navigate to={from} replace /> : <div className="min-h-dvh bg-surface" />

  const sellers = state.users.filter((u) => u.role === 'sales' && profilesOf(state.sellers, u.id).length > 0)
  const tenantName = (id: string) => state.tenants.find((t) => t.id === id)?.name ?? 'Unknown brand'

  const enter = async (seller: Seller) => {
    const email = state.users.find((u) => u.id === seller.userId)?.email ?? ''
    const failed = await signIn(seller, { email, password: DEMO_PASSWORD })
    if (failed) {
      toast('Could not sign in', { tone: 'danger', description: failed })
      return
    }
    toast(`Welcome, ${firstName(seller.name)}`, {
      tone: 'success',
      description: `Signed in to your ${tenantName(seller.tenantId)} store.`,
    })
    navigate(from, { replace: true })
  }

  const open = (seller: Seller, token: string) => {
    openProfile(seller, token)
    navigate(from, { replace: true })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return setError('Enter your email and password.')
    setBusy(true)
    const result = await checkPassword(email, password)
    setBusy(false)
    if ('error' in result) return setError(result.error)
    if (!result.sellers.length) return setError('This account has no active seller profile.')
    setError('')
    if (result.sellers.length === 1) open(result.sellers[0]!, result.token)
    else setProfiles(result)
  }

  const forgot = async () => {
    if (!email.trim()) return setError('Enter your email first, and we will send a link to it.')
    setError('')
    try {
      await api.forgotPassword(email)
      toast('Check your inbox', {
        tone: 'success',
        description: 'If this email has an account, a link is on its way.',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.')
    }
  }

  const choose = (u: User) => {
    const profiles = profilesOf(state.sellers, u.id)
    if (profiles.length === 1) void enter(profiles[0]!)
    else setPicking(u)
  }

  return (
    <div className="max-w-md px-6 pb-10 mx-auto min-h-dvh w-full bg-surface pt-[max(env(safe-area-inset-top),4rem)]">
      <div className="gap-3 flex items-center">
        <span className="size-11 rounded-2xl text-white flex items-center justify-center bg-ink shadow-float">
          <svg viewBox="0 0 64 64" aria-hidden="true" className="size-7">
            <path
              d="M14 26h36l-3-10H17z"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M17 30v18h30V30"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="40" r="5" fill="var(--color-accent)" />
          </svg>
        </span>
        <div>
          <p className="font-bold leading-tight text-[15px]">WIT Commerce Seller</p>
          <p className="text-xs text-muted">Your store, leads and customers</p>
        </div>
      </div>

      {profiles ? (
        <>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">
            Pick a store<span className="text-accent">.</span>
          </h1>
          <div className="mt-8 space-y-2">
            {profiles.sellers.map((s) => (
              <button key={s.id} type="button" className={rowClass} onClick={() => open(s, profiles.token)}>
                <Avatar name={s.name} color={s.color} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">/{s.slug}</span>
                  <span className="text-xs block truncate font-mono text-muted">{s.code}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </>
      ) : picking ? (
        <>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">
            Pick a brand<span className="text-accent">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {picking.name} sells for more than one brand. Each has its own store, leads and customers.
          </p>
          <div className="mt-8 space-y-2">
            {profilesOf(state.sellers, picking.id).map((s) => (
              <button key={s.id} type="button" className={rowClass} onClick={() => void enter(s)}>
                <Avatar name={tenantName(s.tenantId)} color={s.color} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">{tenantName(s.tenantId)}</span>
                  <span className="text-xs block truncate text-muted">
                    <span className="font-mono">{s.code}</span> · /{s.slug}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
              </button>
            ))}
          </div>
          <Button variant="ghost" size="lg" className="mt-4 w-full" onClick={() => setPicking(null)}>
            <ArrowLeft />
            Choose another seller
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">
            Sign in<span className="text-accent">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {sellers.length
              ? 'Pick a demo seller to open their store, leads and customers.'
              : 'Use your seller email and password.'}
          </p>
          {state.offline && (
            <Banner tone="danger" title="We cannot reach the server" className="mt-6">
              Sign-in is unavailable right now. Try again in a moment.
            </Banner>
          )}
          {expired && !state.offline && (
            <Banner tone="warning" title="Your session ended" className="mt-6">
              Sign in again to continue where you left off.
            </Banner>
          )}
          {HTTP && (
            <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 gap-4 grid grid-cols-1">
              <FormField label="Email" htmlFor="login-email" error={error || undefined}>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  inputClassName="h-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
              <FormField label="Password" htmlFor="login-password">
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  inputClassName="h-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormField>
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Sign in
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={() => void forgot()}
              >
                Forgot your password?
              </Button>
            </form>
          )}
          {sellers.length > 0 && (
            <section className="mt-8">
              <Kicker className="mb-2">Demo sellers</Kicker>
              <div className="space-y-2">
                {sellers.map((u) => {
                  const brands = profilesOf(state.sellers, u.id).map((s) => tenantName(s.tenantId))
                  return (
                    <button key={u.id} type="button" className={rowClass} onClick={() => choose(u)}>
                      <Avatar name={u.name} color={u.color} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold block truncate">{u.name}</span>
                        <span className="text-xs block truncate text-muted">
                          {u.title} · {brands.length > 1 ? `${brands.length} brands` : brands[0]}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
      {sellers.length > 0 && (
        <p className="mt-8 text-xs text-muted">
          {HTTP ? 'Demo accounts share one password.' : 'Demo accounts, no password.'} Data as of Monday 5
          October 2026, 09:41 WIB.
        </p>
      )}
    </div>
  )
}
