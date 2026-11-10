import { ApiError } from '@rc/api'
import { Banner, Button, toast } from '@rc/ui'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth'
import { HTTP, api } from '../lib/api'

/**
 * Asks the owner of a store made at sign-up to confirm their email, which publishing waits for.
 * Shown only while email is on and the person has not confirmed.
 */
export function VerifyEmailBanner() {
  const { user, tenant } = useAuth()
  const waiting = HTTP && !!user && !user.emailVerifiedAt && tenant?.source === 'signup'
  const [emailOn, setEmailOn] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!waiting) return
    let live = true
    api
      .me()
      .then((me) => {
        if (live) setEmailOn(me.emailOn && !me.user.emailVerifiedAt)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [waiting])

  if (!waiting || !emailOn || dismissed) return null

  const resend = async () => {
    setBusy(true)
    try {
      const { message } = await api.resendVerifyEmail()
      toast('Link sent', { tone: 'success', description: message })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_VERIFIED') return setDismissed(true)
      toast('The link did not go out', {
        tone: 'danger',
        description:
          err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Banner
      tone="warning"
      title="Confirm your email to publish your store"
      className="mb-4"
      onDismiss={() => setDismissed(true)}
      action={
        <Button size="sm" variant="outline" loading={busy} onClick={() => void resend()}>
          Send the link again
        </Button>
      }
    >
      We sent a link to {user.email}. Open it to confirm this address.
    </Banner>
  )
}
