import { ApiError } from '@rc/api'
import { Banner, Button, Card, Spinner } from '@rc/ui'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { HTTP, api } from '../../lib/api'

type Outcome = { tone: 'success' | 'danger'; title: string; body: string }

/** Spends the confirmation link from the sign-up email. */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // A link works once, so a second run of the effect must not spend it again.
  const sent = useRef(false)

  useEffect(() => {
    if (!HTTP || !token || sent.current) return
    sent.current = true
    api
      .verifyEmail(token)
      .then(() =>
        setOutcome({
          tone: 'success',
          title: 'Your email is confirmed',
          body: 'You can publish your store whenever it is ready.',
        }),
      )
      .catch((err: unknown) =>
        setOutcome({
          tone: 'danger',
          title: 'This link did not work',
          body: !(err instanceof ApiError)
            ? 'The server did not answer. Try again in a moment.'
            : err.code === 'LINK_EXPIRED'
              ? 'It has expired or was already used. Send a new one from the banner in your admin.'
              : err.message,
        }),
      )
  }, [token])

  const missing: Outcome | null = !HTTP
    ? { tone: 'danger', title: 'Confirming needs the server', body: 'This demo runs without the API.' }
    : !token
      ? { tone: 'danger', title: 'This link is incomplete', body: 'Open the link from your email again.' }
      : null
  const shown = missing ?? outcome

  return (
    <div className="px-4 py-8 sm:py-12 flex min-h-[var(--admin-viewport-height)] items-start justify-center bg-surface">
      <main className="max-w-md w-full">
        <Card className="p-6 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Confirm your email<span className="text-accent">.</span>
          </h1>
          {shown ? (
            <Banner tone={shown.tone} title={shown.title} className="mt-6">
              {shown.body}
            </Banner>
          ) : (
            <Spinner />
          )}
          <Button asChild size="lg" className="mt-6 w-full">
            <Link to="/">Open your admin</Link>
          </Button>
        </Card>
      </main>
    </div>
  )
}
