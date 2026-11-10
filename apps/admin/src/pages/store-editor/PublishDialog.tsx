import { ApiError } from '@rc/api'
import { pagePublishChecks } from '@rc/fixtures'
import type { Page } from '@rc/types'
import {
  Banner,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  cn,
  toast,
} from '@rc/ui'
import { CircleCheck, CircleDashed, Copy, ExternalLink, Rocket } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { storeAddress } from '../../lib/storefront'
import { useScoped } from '../../state/scoped'

/**
 * The big Publish: a checklist in plain words, then one button. The server may still ask the owner of a
 * new store to confirm their email first. Success shows the address with Copy and Open.
 */
export function PublishDialog({
  page,
  saved,
  changes,
  save,
  liveUrl,
  onClose,
}: {
  /** The page as edited, unsaved changes included. */
  page: Page
  /** The page as the server holds it, its unpublished changes laid over it. */
  saved: Page
  /** The page is live and has changes shoppers do not see yet. */
  changes: boolean
  save: (force?: boolean) => Promise<boolean>
  liveUrl: string
  onClose: () => void
}) {
  const s = useScoped()
  const { user } = useAuth()
  const [live, setLive] = useState(saved.status === 'published' && !changes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const email = useEmailCheck(page)
  const checks = pagePublishChecks(page)
  // A waiting email does not disable the button: the owner may have confirmed in another tab.
  const ready = checks.every((c) => !c.problem)
  const address = `${storeAddress(s.tenant)}${page.kind === 'home' ? '' : page.slug}`
  const what = page.kind === 'home' ? 'Your store' : page.title

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      const seoChanged = page.seo.title !== saved.seo.title || page.seo.description !== saved.seo.description
      if (!(await save(seoChanged))) return
      await s.dispatchAsync({ type: 'pages/publish', id: page.id })
      setLive(true)
      toast(`${what} is live`, { tone: 'success', description: address })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_UNVERIFIED') email.waiting()
      else setError(err instanceof Error ? err.message : 'The server did not answer. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = () =>
    navigator.clipboard
      ?.writeText(liveUrl)
      .then(() => toast('Address copied', { tone: 'success', description: liveUrl }))
      .catch(() => toast('Copy did not work', { tone: 'danger', description: `Select and copy ${liveUrl}.` }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        {live ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {what} is live at {address}
              </DialogTitle>
              <DialogDescription>
                Share the address with your customers. Changes you make from now on stay private until you
                publish them.
              </DialogDescription>
            </DialogHeader>
            <p className="p-3 text-sm font-medium rounded-2xl bg-surface break-all">{liveUrl}</p>
            <DialogFooter>
              <Button variant="outline" onClick={copy}>
                <Copy />
                Copy
              </Button>
              <Button asChild>
                <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Open
                </a>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {changes ? 'Publish changes' : `Publish ${page.kind === 'home' ? 'your store' : page.title}`}
              </DialogTitle>
              <DialogDescription>
                {changes
                  ? `Shoppers keep seeing the current page at ${address} until you publish your changes.`
                  : `Shoppers see it at ${address} as soon as you publish.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2">
              {checks.map((c) => (
                <Check key={c.key} ok={!c.problem} label={c.label} problem={c.problem} />
              ))}
              {email.state !== 'none' && (
                <Check
                  ok={email.state === 'ok'}
                  label="Your email is confirmed"
                  problem={
                    email.state === 'waiting'
                      ? `Open the link we sent to ${user?.email ?? 'your email'}, then publish again.`
                      : null
                  }
                  action={
                    email.state === 'waiting' && (
                      <Button variant="outline" size="sm" loading={email.sending} onClick={email.resend}>
                        Send the link again
                      </Button>
                    )
                  }
                />
              )}
            </ul>
            {error && (
              <Banner tone="danger" title="Not published">
                {error}
              </Banner>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Not yet
              </Button>
              <Button size="lg" onClick={() => void publish()} disabled={!ready} loading={busy}>
                <Rocket />
                {changes ? 'Publish changes' : 'Publish now'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Check({
  ok,
  label,
  problem,
  action,
}: {
  ok: boolean
  label: string
  problem: string | null
  action?: ReactNode
}) {
  const Icon = ok ? CircleCheck : CircleDashed
  return (
    <li className="gap-3 p-3 rounded-2xl flex items-start bg-surface">
      <Icon
        className={cn('mt-0.5 size-5 shrink-0', ok ? 'text-success' : 'text-warning')}
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">
          {label}
          <span className="sr-only">{ok ? ': done' : ': to do'}</span>
        </p>
        {problem && <p className="text-sm text-muted">{problem}</p>}
        {action}
      </div>
    </li>
  )
}

/**
 * Whether publishing waits for the owner's email: only a home page of a store made at sign-up, while the
 * server sends email and the owner has not confirmed. 'none' when the check does not apply.
 */
function useEmailCheck(page: Page) {
  const { user, tenant } = useAuth()
  const applies = HTTP && page.kind === 'home' && tenant?.source === 'signup' && !user?.emailVerifiedAt
  const [state, setState] = useState<'none' | 'ok' | 'waiting'>('none')
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (!applies) return
    let live = true
    api
      .me()
      .then((me) => live && setState(me.emailOn && !me.user.emailVerifiedAt ? 'waiting' : 'none'))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [applies])
  const resend = async () => {
    setSending(true)
    try {
      const { message } = await api.resendVerifyEmail()
      toast('Link sent', { tone: 'success', description: message })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_VERIFIED') setState('ok')
      else
        toast('The link did not go out', {
          tone: 'danger',
          description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
        })
    } finally {
      setSending(false)
    }
  }
  return { state, sending, resend: () => void resend(), waiting: () => setState('waiting') }
}
