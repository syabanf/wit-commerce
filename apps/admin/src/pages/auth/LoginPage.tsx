import type { Tenant, User } from '@rc/types'
import { ROLE_LABEL } from '@rc/types'
import { ApiError } from '@rc/api'
import { Avatar, Banner, Button, Card, FormField, Input } from '@rc/ui'
import { ArrowRight, Lock, Mail, Palette, ShoppingBag, UsersRound } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { LogoMark } from '../../layouts/LogoMark'
import { DEMO_PASSWORD, HTTP, api } from '../../lib/api'
import { useStore } from '../../state/store'

const PILLARS = [
  {
    title: 'Brand experience',
    text: 'One guideline, many storefronts, with brand locks for every seller.',
    Icon: Palette,
  },
  {
    title: 'Commerce',
    text: 'Catalog, stock, checkout and orders across web, WhatsApp and marketplaces.',
    Icon: ShoppingBag,
  },
  {
    title: 'Customers',
    text: 'Customer 360, segments, loyalty and automation built into every order.',
    Icon: UsersRound,
  },
]

const GLOW =
  'radial-gradient(40% 40% at 70% 30%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 70%)' // wit-allow: ambient canvas glow, layouts.md

/** The accounts the page offers: the dataset's users, or the API's demo list before anyone signs in. */
function useAccounts(): { users: User[]; tenants: Tenant[]; offline: boolean } {
  const { state } = useStore()
  const [remote, setRemote] = useState<{ users: User[]; tenants: Tenant[] } | null>(null)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    if (!HTTP) return
    api
      .demoAccounts()
      .then(({ users, tenants }) => setRemote({ users, tenants }))
      .catch((err: unknown) => {
        // A deployment with demo sign-in off answers with a 4xx; only a failure is an outage.
        setOffline(!(err instanceof ApiError) || err.status >= 500)
        setRemote({ users: [], tenants: [] })
      })
  }, [])
  return HTTP ? { ...(remote ?? { users: [], tenants: [] }), offline } : { ...state, offline: false }
}

export function LoginPage() {
  const { users, tenants, offline } = useAccounts()
  const { user, loading, signIn, signInWithPassword, expired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (user || loading) return user ? <Navigate to={from} replace /> : <div className="min-h-dvh bg-surface" />

  const enter = async (candidate: User | null, address: string, pass: string) => {
    if (!HTTP) {
      if (candidate) signIn(candidate.id)
      navigate(from, { replace: true })
      return
    }
    setBusy(true)
    const failed = await signInWithPassword(address, pass)
    setBusy(false)
    if (failed) setError(failed)
    else navigate(from, { replace: true })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null
    if (HTTP ? !email.trim() || !password : !match) {
      setError(
        HTTP ? 'Enter your email and password.' : 'Use one of the demo accounts below. Any password works.',
      )
      return
    }
    void enter(match, email, password)
  }

  const tenantNames = (ids: string[]) =>
    ids.length > 1 ? `${ids.length} brands` : (tenants.find((t) => t.id === ids[0])?.name ?? '')

  return (
    <div className="px-4 py-8 sm:py-12 relative min-h-dvh overflow-hidden bg-surface">
      <div aria-hidden className="inset-0 pointer-events-none absolute overflow-hidden">
        <div
          className="blur-xl absolute -top-[20%] -right-[10%] h-[80%] w-[70%] opacity-70"
          style={{ background: GLOW }}
        />
      </div>
      <div className="max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_1.1fr] relative mx-auto grid w-full grid-cols-1">
        <Card variant="ink" className="gap-10 p-8 flex flex-col justify-between">
          <div className="gap-3 flex items-center">
            <span className="size-11 rounded-2xl bg-white/5 flex items-center justify-center">
              <LogoMark className="size-7" />
            </span>
            <div>
              <p className="font-bold leading-tight text-[0.9375rem]">Commerce OS</p>
              <p className="text-xs text-on-ink-muted">Brand · Commerce · CRM</p>
            </div>
          </div>
          <div>
            <p className="font-semibold tracking-wider text-[0.6875rem] text-on-ink-muted uppercase">
              Unified commerce platform
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Build the brand, run the store, know every customer<span className="text-accent">.</span>
            </h1>
            <div className="mt-8 space-y-3">
              {PILLARS.map(({ title, text, Icon }) => (
                <div key={title} className="gap-3 rounded-2xl bg-white/5 p-3 flex items-start">
                  <span className="mt-0.5 size-8 rounded-xl bg-white/10 flex shrink-0 items-center justify-center">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="text-sm font-semibold block">{title}</span>
                    <span className="text-xs block text-on-ink-muted">{text}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {users.length > 0 && (
            <p className="text-xs text-on-ink-muted">
              Demo data: Lari Running Co., Aruna Beauty and Teknika Industrial, Monday 5 October 2026.
            </p>
          )}
        </Card>

        <Card className="p-6 sm:p-8">
          <h2 className="text-3xl font-bold tracking-tight">
            Sign in<span className="text-accent">.</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {users.length
              ? 'Pick a demo account to see the console from that role.'
              : 'Use your work email and password.'}
          </p>

          {offline && (
            <Banner tone="danger" title="We cannot reach the server" className="mt-6">
              Sign-in is unavailable right now. Try again in a moment.
            </Banner>
          )}
          {expired && !offline && (
            <Banner tone="warning" title="Your session ended" className="mt-6">
              Sign in again to continue where you left off.
            </Banner>
          )}
          <form onSubmit={submit} noValidate className="mt-6 gap-4 grid grid-cols-1">
            <FormField label="Email" htmlFor="login-email" error={error || undefined}>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                leftIcon={<Mail />}
                inputClassName="h-12"
                placeholder={users.length ? 'andi@lari.co.id' : 'you@company.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Password" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                leftIcon={<Lock />}
                inputClassName="h-12"
                placeholder={!HTTP ? 'Any password' : users.length ? 'The demo password' : 'Your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Sign in
              <ArrowRight />
            </Button>
          </form>
          <div className="mt-3 gap-x-6 flex flex-wrap">
            {HTTP && (
              <Link
                to="/reset-password"
                className="text-sm font-semibold min-h-11 inline-flex items-center underline"
              >
                Forgot your password?
              </Link>
            )}
            <Link to="/start" className="text-sm font-semibold min-h-11 inline-flex items-center underline">
              Create your store
            </Link>
          </div>

          {users.length > 0 && (
            <>
              <p className="mb-2 mt-8 font-semibold tracking-wider text-[0.6875rem] text-muted uppercase">
                Demo accounts
              </p>
              <div className="gap-2 sm:grid-cols-2 grid grid-cols-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void enter(u, u.email, DEMO_PASSWORD)}
                    className="gap-3 rounded-2xl p-3 flex items-center bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]"
                  >
                    <Avatar name={u.name} color={u.color} size="md" />
                    <span className="min-w-0">
                      <span className="text-sm font-semibold block truncate">{u.name}</span>
                      <span className="text-xs block truncate text-muted">
                        {ROLE_LABEL[u.role]} · {tenantNames(u.tenantIds)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
