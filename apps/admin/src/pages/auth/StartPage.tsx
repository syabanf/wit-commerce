import { ApiError, type SubdomainCheck } from '@rc/api'
import { slugify } from '@rc/fixtures'
import { INDUSTRY_LABEL, type Industry } from '@rc/types'
import { Banner, Button, Card, Chip, FormField, Input, Steps, cn } from '@rc/ui'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, Store, UserRound } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { LogoMark } from '../../layouts/LogoMark'
import { HTTP, api } from '../../lib/api'
import { SUBDOMAIN_PATTERN } from '../settings/lib'

/** The domain every store's address sits under. */
const STORE_ROOT =
  (import.meta.env.VITE_STORE_ROOT_DOMAIN as string | undefined)?.trim() || 'commerce.reddie.id'

const STEPS = [
  { key: 'name', label: 'Your store' },
  { key: 'look', label: 'What you sell' },
  { key: 'account', label: 'Your account' },
] as const

type Look = { id: string; name: string; body: string; thumb: ReactNode }

/** The three store templates sign-up offers, with a sketch of each layout. */
const LOOKS: Look[] = [
  {
    id: 'tpl-minimal',
    name: 'Minimal',
    body: 'A clean front page that puts your products first.',
    thumb: (
      <>
        <span className="h-6 rounded-md block bg-ink/80" />
        <span className="gap-1 grid grid-cols-3">
          <span className="h-5 rounded bg-surface-2" />
          <span className="h-5 rounded bg-surface-2" />
          <span className="h-5 rounded bg-surface-2" />
        </span>
        <span className="h-2 rounded block w-2/3 bg-surface-2" />
      </>
    ),
  },
  {
    id: 'tpl-editorial',
    name: 'Editorial',
    body: 'Large pictures and room to tell your story.',
    thumb: (
      <>
        <span className="h-9 rounded-md block bg-accent/70" />
        <span className="h-1.5 rounded block w-3/4 bg-surface-2" />
        <span className="h-1.5 rounded block w-1/2 bg-surface-2" />
        <span className="h-4 rounded block bg-surface-2" />
      </>
    ),
  },
  {
    id: 'tpl-catalog',
    name: 'Catalog',
    body: 'Categories up front, for a store with many products.',
    thumb: (
      <>
        <span className="h-4 rounded-md block bg-ink/80" />
        <span className="gap-1 grid grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="h-3.5 rounded bg-surface-2" />
          ))}
        </span>
      </>
    ),
  },
]

interface Draft {
  storeName: string
  subdomain: string
  /** Once the person types an address, the store name stops rewriting it. */
  subdomainEdited: boolean
  industry: Industry | ''
  templateId: string
  ownerName: string
  email: string
  password: string
  website: string
}

const INITIAL: Draft = {
  storeName: '',
  subdomain: '',
  subdomainEdited: false,
  industry: '',
  templateId: 'tpl-minimal',
  ownerName: '',
  email: '',
  password: '',
  website: '',
}

type Errors = Partial<
  Record<'storeName' | 'subdomain' | 'industry' | 'ownerName' | 'email' | 'password', string>
>

const toSubdomain = (name: string) => slugify(name).slice(0, 30).replace(/-+$/, '')

/** The public sign-up: three short screens, then the new owner lands in the admin, signed in. */
export function StartPage() {
  const { user } = useAuth()
  if (user) return <Navigate to="/" replace />
  return (
    <div className="px-4 py-6 sm:py-12 min-h-[var(--admin-viewport-height)] bg-surface">
      <main className="max-w-lg mx-auto w-full">
        <div className="mb-5 gap-3 flex items-center">
          <span className="size-10 rounded-2xl flex items-center justify-center bg-ink">
            <LogoMark className="size-6" />
          </span>
          <p className="font-bold text-[0.9375rem]">Commerce OS</p>
        </div>
        {HTTP ? <SignUpFlow /> : <NeedsServer />}
        <p className="mt-4 text-sm text-muted">
          Already have a store?{' '}
          <Link
            to="/login"
            className="font-semibold min-h-11 inline-flex items-center text-foreground underline"
          >
            Sign in
          </Link>
        </p>
      </main>
    </div>
  )
}

function NeedsServer() {
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Create your store<span className="text-accent">.</span>
      </h1>
      <Banner tone="info" title="Sign-up needs the server" className="mt-6">
        This demo runs on sample data in your browser. Start the API to create a real store.
      </Banner>
    </Card>
  )
}

/** Debounced availability of the address, or null while it is unchecked. */
function useAvailability(subdomain: string) {
  const [result, setResult] = useState<{ name: string; check: SubdomainCheck } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!SUBDOMAIN_PATTERN.test(subdomain)) return
    let live = true
    const timer = setTimeout(() => {
      setFailed(false)
      api
        .checkSubdomain(subdomain)
        .then((check) => {
          if (live) setResult({ name: subdomain, check })
        })
        .catch(() => live && setFailed(true))
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [subdomain])
  return { check: result?.name === subdomain ? result.check : null, failed }
}

function SignUpFlow() {
  const { startSession } = useAuth()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(INITIAL)
  const [step, setStep] = useState(0)
  const [tried, setTried] = useState(false)
  const [serverErrors, setServerErrors] = useState<Errors>({})
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { check, failed } = useAvailability(draft.subdomain)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setServerErrors((e) => ({ ...e, [key]: undefined }))
  }

  const errors: Errors = { ...localErrors(step, draft, check), ...serverErrors }
  const shown = (field: keyof Errors) => (tried || serverErrors[field] ? errors[field] : undefined)
  const blocked = Object.values(errors).some(Boolean) || (step === 0 && !check?.available)

  const next = () => {
    setTried(true)
    if (blocked) return
    setTried(false)
    setStep(step + 1)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (step < STEPS.length - 1) return next()
    setTried(true)
    if (blocked || busy) return
    setBusy(true)
    setFailure('')
    try {
      const { token, user } = await api.signUp({
        storeName: draft.storeName.trim(),
        subdomain: draft.subdomain,
        industry: draft.industry as Industry,
        templateId: draft.templateId,
        ownerName: draft.ownerName.trim(),
        email: draft.email.trim(),
        password: draft.password,
        website: draft.website,
      })
      startSession(token, user)
      navigate('/', { replace: true })
    } catch (err) {
      setBusy(false)
      if (!(err instanceof ApiError)) {
        setFailure('The server did not answer. Try again in a moment.')
        return
      }
      if (err.code === 'SUBDOMAIN_TAKEN') {
        setServerErrors({ subdomain: 'Someone took this address a moment ago. Pick another one.' })
        setStep(0)
      } else if (err.code === 'EMAIL_TAKEN') {
        setServerErrors({
          email: 'This email already has an account. Sign in instead, or use another email.',
        })
      } else if (err.code === 'WEAK_PASSWORD') {
        setServerErrors({ password: err.message })
      } else {
        setFailure(err.message)
      }
    }
  }

  const address = `${draft.subdomain || 'your-store'}.${STORE_ROOT}`

  return (
    <Card className="p-5 sm:p-8">
      <Steps
        steps={STEPS.map((s, i) => ({
          key: s.key,
          label: s.label,
          state: i < step ? 'done' : i === step ? 'current' : 'upcoming',
        }))}
      />
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-4">
        {step === 0 && (
          <section className="gap-4 grid grid-cols-1">
            <Heading
              title="Name your store"
              lead="You can change the name later. The address stays with the store."
            />
            <FormField label="Store name" htmlFor="start-name" error={shown('storeName')}>
              <Input
                id="start-name"
                autoFocus
                autoComplete="organization"
                leftIcon={<Store />}
                inputClassName="h-12"
                placeholder="Kopi Senja"
                value={draft.storeName}
                onChange={(e) => {
                  const storeName = e.target.value
                  setDraft((d) => ({
                    ...d,
                    storeName,
                    subdomain: d.subdomainEdited ? d.subdomain : toSubdomain(storeName),
                  }))
                  setServerErrors({})
                }}
              />
            </FormField>
            <FormField
              label="Store address"
              htmlFor="start-subdomain"
              error={check && !check.available ? errors.subdomain : shown('subdomain')}
              hint={<span className="break-all">{address}</span>}
            >
              <Input
                id="start-subdomain"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                inputClassName="h-12"
                value={draft.subdomain}
                onChange={(e) => {
                  set('subdomain', e.target.value.toLowerCase().trim())
                  set('subdomainEdited', true)
                }}
              />
            </FormField>
            {!serverErrors.subdomain && (
              <Availability
                subdomain={draft.subdomain}
                check={check}
                failed={failed}
                onPick={(name) => {
                  set('subdomain', name)
                  set('subdomainEdited', true)
                }}
              />
            )}
          </section>
        )}

        {step === 1 && (
          <section className="gap-5 grid grid-cols-1">
            <Heading
              title="What do you sell?"
              lead="We set your store up to suit it. Pick a look to start from."
            />
            <div role="group" aria-label="What you sell">
              <div className="gap-2 flex flex-wrap">
                {(Object.keys(INDUSTRY_LABEL) as Industry[]).map((industry) => (
                  <Chip
                    key={industry}
                    active={draft.industry === industry}
                    onClick={() => set('industry', industry)}
                  >
                    {INDUSTRY_LABEL[industry]}
                  </Chip>
                ))}
              </div>
              {shown('industry') && <p className="mt-2 text-xs text-danger">{shown('industry')}</p>}
            </div>
            <div role="group" aria-label="Store look" className="gap-3 sm:grid-cols-3 grid grid-cols-1">
              {LOOKS.map((look) => (
                <LookCard
                  key={look.id}
                  look={look}
                  selected={draft.templateId === look.id}
                  onSelect={() => set('templateId', look.id)}
                />
              ))}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="gap-4 grid grid-cols-1">
            <Heading
              title="Create your account"
              lead={`You will manage ${draft.storeName.trim()} with this email.`}
            />
            <FormField label="Your name" htmlFor="start-owner" error={shown('ownerName')}>
              <Input
                id="start-owner"
                autoFocus
                autoComplete="name"
                leftIcon={<UserRound />}
                inputClassName="h-12"
                value={draft.ownerName}
                onChange={(e) => set('ownerName', e.target.value)}
              />
            </FormField>
            <FormField label="Email" htmlFor="start-email" error={shown('email')}>
              <Input
                id="start-email"
                type="email"
                autoComplete="email"
                leftIcon={<Mail />}
                inputClassName="h-12"
                placeholder="you@example.com"
                value={draft.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </FormField>
            <FormField
              label="Password"
              htmlFor="start-password"
              hint="10 or more characters."
              error={shown('password')}
            >
              <Input
                id="start-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                leftIcon={<Lock />}
                inputClassName="h-12"
                value={draft.password}
                onChange={(e) => set('password', e.target.value)}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="size-9 flex items-center justify-center rounded-full hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                }
              />
            </FormField>
            {/* Hidden from people and screen readers; only a bot fills it. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-px w-px opacity-0"
              value={draft.website}
              onChange={(e) => set('website', e.target.value)}
            />
            {failure && (
              <Banner tone="danger" title="We could not create your store">
                {failure}
              </Banner>
            )}
          </section>
        )}

        <div className="mt-6 gap-2 flex items-center">
          {step > 0 && (
            <Button type="button" variant="ghost" size="lg" onClick={() => setStep(step - 1)} disabled={busy}>
              <ArrowLeft />
              Back
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" loading={busy}>
            {step < STEPS.length - 1 ? 'Continue' : 'Create my store'}
            <ArrowRight />
          </Button>
        </div>
      </form>
    </Card>
  )
}

function localErrors(step: number, draft: Draft, check: SubdomainCheck | null): Errors {
  const e: Errors = {}
  if (step === 0) {
    if (!draft.storeName.trim()) e.storeName = 'Enter a name for your store.'
    else if (draft.storeName.trim().length > 80) e.storeName = 'Keep the name to 80 characters.'
    if (!SUBDOMAIN_PATTERN.test(draft.subdomain))
      e.subdomain =
        'Use 3 to 30 lowercase letters, numbers or dashes, starting and ending with a letter or number.'
    else if (check && !check.available) e.subdomain = check.reason
  }
  if (step === 1 && !draft.industry) e.industry = 'Choose what you sell.'
  if (step === 2) {
    if (!draft.ownerName.trim()) e.ownerName = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) e.email = 'Enter a valid email address.'
    if (draft.password.length < 10) e.password = 'Use a password of 10 or more characters.'
  }
  return e
}

function Heading({ title, lead }: { title: string; lead: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
        {!title.endsWith('?') && <span className="text-accent">.</span>}
      </h1>
      <p className="mt-1 text-sm text-muted">{lead}</p>
    </div>
  )
}

function Availability({
  subdomain,
  check,
  failed,
  onPick,
}: {
  subdomain: string
  check: SubdomainCheck | null
  failed: boolean
  onPick: (name: string) => void
}) {
  if (!SUBDOMAIN_PATTERN.test(subdomain)) return null
  if (!check) {
    return (
      <p role="status" className="text-sm text-muted">
        {failed ? 'We could not check this address. Keep typing to try again.' : 'Checking the address…'}
      </p>
    )
  }
  if (check.available) {
    return (
      <p role="status" className="gap-2 text-sm font-semibold flex items-center text-success">
        <Check className="size-4" aria-hidden />
        This address is yours to take.
      </p>
    )
  }
  if (!check.suggestions.length) return null
  return (
    <div role="group" aria-label="Free addresses">
      <p className="text-sm text-muted">These are free:</p>
      <div className="mt-2 gap-2 flex flex-wrap">
        {check.suggestions.map((name) => (
          <Chip key={name} onClick={() => onPick(name)}>
            {name}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function LookCard({ look, selected, onSelect }: { look: Look; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'rounded-2xl p-3 flex flex-col items-stretch bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        selected && 'bg-card shadow-card ring-2 ring-ink hover:bg-card',
      )}
    >
      <span aria-hidden className="gap-1.5 rounded-xl p-2 flex flex-col bg-card">
        {look.thumb}
      </span>
      <span className="mt-3 text-sm font-semibold">{look.name}</span>
      <span className="mt-0.5 text-xs text-muted">{look.body}</span>
    </button>
  )
}
