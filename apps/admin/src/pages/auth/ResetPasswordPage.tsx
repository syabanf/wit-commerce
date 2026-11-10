import { ApiError } from '@rc/api'
import { Banner, Button, Card, FormField, Input, toast } from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../../lib/api'

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.'

/** Asks for an email to send a link to; with a token from that link, sets the new password. */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  return (
    <div className="px-4 py-8 sm:py-12 flex min-h-[var(--admin-viewport-height)] items-start justify-center bg-surface">
      <main className="max-w-md w-full">
        <Card className="p-6 sm:p-8">
          {token ? <NewPassword token={token} invited={params.get('invite') === '1'} /> : <AskForLink />}
        </Card>
      </main>
    </div>
  )
}

function AskForLink() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return setError('Enter your email.')
    setBusy(true)
    setError('')
    try {
      await api.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">
        Reset password<span className="text-accent">.</span>
      </h1>
      {sent ? (
        <Banner tone="success" title="Check your inbox" className="mt-6">
          If this email has an account, a link is on its way. It works for an hour.
        </Banner>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 gap-4 grid grid-cols-1">
          <FormField label="Work email" htmlFor="reset-email" error={error || undefined}>
            <Input
              id="reset-email"
              type="email"
              autoComplete="username"
              inputClassName="h-12"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Email me a link
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-4 text-sm font-semibold min-h-11 inline-flex items-center underline">
        Back to sign in
      </Link>
    </>
  )
}

function NewPassword({ token, invited }: { token: string; invited: boolean }) {
  const navigate = useNavigate()
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 10) return setError('Use a password of 10 or more characters.')
    setBusy(true)
    setError('')
    try {
      await api.resetPassword(token, next)
      toast('Password changed', { tone: 'success', description: 'Sign in with your new password.' })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">
        {invited ? 'Welcome' : 'Choose a new password'}
        <span className="text-accent">.</span>
      </h1>
      {invited && (
        <p className="mt-1 text-sm text-muted">Choose a password to finish setting up your account.</p>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 gap-4 grid grid-cols-1">
        <FormField
          label={invited ? 'Your password' : 'New password'}
          htmlFor="reset-password"
          hint="10 or more characters."
          error={error || undefined}
        >
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            inputClassName="h-12"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Save password
        </Button>
      </form>
    </>
  )
}
