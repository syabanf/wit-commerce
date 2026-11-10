import { ApiError } from '@rc/api'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ProgressBar,
  cn,
  toast,
} from '@rc/ui'
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { storeAddress, storefrontUrl } from '../../lib/storefront'
import type { Scoped } from '../../state/scoped'
import { launchChecklist } from './launch'

/** Asks /auth/me whether email is on, only while the signed-in person is unconfirmed. */
function useEmailPending() {
  const { user } = useAuth()
  const unverified = HTTP && !!user && !user.emailVerifiedAt
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!unverified) return
    let live = true
    api
      .me()
      .then((me) => {
        if (live) setPending(me.emailOn && !me.user.emailVerifiedAt)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [unverified])
  return unverified && pending
}

/** The tenant admin's next steps until the store is live, then its address. */
export function GoLiveCard({ s }: { s: Scoped }) {
  const emailPending = useEmailPending()
  const [busy, setBusy] = useState(false)
  const { steps, done, total, live } = launchChecklist({
    tenant: s.tenant,
    pages: s.pages,
    productCount: s.products.length,
    // The server asks for a confirmed email before publishing only for stores made at sign-up.
    emailPending: emailPending && s.tenant.source === 'signup',
  })
  const url = storefrontUrl(s.tenant.subdomain)

  if (live) {
    return (
      <Card className="gap-3 px-5 py-4 flex flex-wrap items-center justify-between">
        <p className="text-sm min-w-0">
          Your store is live at <span className="font-semibold break-all">{storeAddress(s.tenant)}</span>
        </p>
        <div className="gap-2 flex items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(url).catch(() => undefined)
              toast('Link copied', { tone: 'success', description: url })
            }}
          >
            <Copy />
            Copy
          </Button>
          <Button size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open
            </a>
          </Button>
        </div>
      </Card>
    )
  }

  const resend = async () => {
    setBusy(true)
    try {
      const { message } = await api.resendVerifyEmail()
      toast('Link sent', { tone: 'success', description: message })
    } catch (err) {
      toast('The link did not go out', {
        tone: 'danger',
        description:
          err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.',
      })
    } finally {
      setBusy(false)
    }
  }
  const next = steps.find((step) => !step.done)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get your store live</CardTitle>
        <CardDescription>
          {done} of {total} done. Shoppers see your store once you publish.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={done / total} aria-label={`${done} of ${total} steps done`} />
        <ol className="gap-1 sm:grid-cols-2 grid grid-cols-1">
          {steps.map((step) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'size-5 flex shrink-0 items-center justify-center rounded-full',
                    step.done ? 'text-white bg-success' : 'ring-1 ring-border ring-inset',
                  )}
                >
                  {step.done && <Check className="size-3" />}
                </span>
                <span className={cn('min-w-0 text-sm flex-1', step.done && 'text-muted line-through')}>
                  {step.label}
                  <span className="sr-only">{step.done ? ', done' : ', to do'}</span>
                </span>
                {step === next && <ArrowRight className="size-4 shrink-0" aria-hidden />}
              </>
            )
            const row = cn(
              'gap-3 rounded-xl px-3 py-2 flex items-center',
              step === next ? 'bg-surface-2 font-semibold' : '',
            )
            return (
              <li key={step.key}>
                {step.to ? (
                  <Link to={step.to} className={cn(row, 'hover:bg-surface-2')}>
                    {body}
                  </Link>
                ) : (
                  <div className={row}>
                    {body}
                    <Button size="sm" variant="outline" loading={busy} onClick={() => void resend()}>
                      Resend link
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
