import { ApiError, type EmailSettings, type EmailTestResult } from '@rc/api'
import { fmtAgo } from '@rc/fixtures'
import {
  Badge,
  type BadgeProps,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PageHeader,
  toast,
} from '@rc/ui'
import { Send } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { useNow, useScoped } from '../../state/scoped'

const SOURCE: Record<
  EmailSettings['source'],
  { label: string; variant: BadgeProps['variant']; about: string }
> = {
  settings: {
    label: 'Saved here',
    variant: 'success',
    about: 'Email goes out with the key and from address saved on this page.',
  },
  env: {
    label: 'Server environment',
    variant: 'info',
    about: 'Email goes out with RESEND_API_KEY and EMAIL_FROM on the server. Saving here replaces them.',
  },
  off: {
    label: 'Off',
    variant: 'warning',
    about: 'No key is set, so password resets, invitations and email confirmations do not go out.',
  },
}

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'The server did not answer.')

/** The platform's Resend setup. The key goes in and never comes back out. */
export function EmailSettingsPage() {
  const { user } = useAuth()
  const { userName } = useScoped()
  const now = useNow(30_000)
  const platform = user?.role === 'platform_admin'
  const [settings, setSettings] = useState<EmailSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [from, setFrom] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<EmailTestResult | null>(null)

  const show = (next: EmailSettings) => {
    setSettings(next)
    setFrom(next.from)
    setKey('')
  }
  const load = useCallback(() => {
    setLoadError(null)
    api.emailSettings
      .get()
      .then(show)
      .catch((err: unknown) => setLoadError(message(err)))
  }, [])
  useEffect(() => {
    if (HTTP && platform) load()
  }, [platform, load])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      show(await api.emailSettings.save({ key: key.trim(), from: from.trim() }))
      setResult(null)
      toast('Email settings saved', { tone: 'success', description: from.trim() })
    } catch (err) {
      setSaveError(message(err))
    }
    setSaving(false)
  }

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await api.emailSettings.test())
    } catch (err) {
      setResult({ ok: false, to: user?.email ?? '', error: message(err) })
    }
    setTesting(false)
  }

  const source = settings ? SOURCE[settings.source] : null
  const keyHint = !settings?.keySet
    ? 'Create a key in Resend under API keys. It is stored encrypted.'
    : settings.source === 'settings'
      ? `Saved ${settings.updatedAt ? fmtAgo(settings.updatedAt, now) : ''} by ${userName(settings.updatedBy ?? '')}. Leave empty to keep it.`
      : 'The server environment holds this key. Enter a key to save one here instead.'

  return (
    <>
      <PageHeader
        title="Email"
        description="How WIT Commerce sends password resets, staff invitations and email confirmations."
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            Email settings live on the server. Build the console with VITE_API_URL to change them.
          </Banner>
        )}
        {HTTP && !platform && (
          <Banner tone="neutral" title="Ask a platform admin">
            Only a platform admin can change how the platform sends email.
          </Banner>
        )}
        {loadError && (
          <Banner
            tone="danger"
            title="Could not load the email settings"
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}

        {HTTP && platform && settings && source && (
          <>
            <Card>
              <CardHeader action={<Badge variant={source.variant}>{source.label}</Badge>}>
                <CardTitle>Status</CardTitle>
                <CardDescription>{source.about}</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resend</CardTitle>
                <CardDescription>
                  WIT Commerce sends through Resend. Nobody can read the key back here, so keep the original in
                  your password manager.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={save} noValidate autoComplete="off" className="gap-4 grid grid-cols-1">
                  {saveError && (
                    <Banner tone="danger" title="Not saved">
                      {saveError}
                    </Banner>
                  )}
                  <FormField label="API key" htmlFor="email-key" required={!settings.keySet} hint={keyHint}>
                    <Input
                      id="email-key"
                      type="password"
                      autoComplete="new-password"
                      placeholder={settings.keySet ? `•••• ${settings.keyLast4}` : 're_…'}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </FormField>
                  <FormField
                    label="From address"
                    htmlFor="email-from"
                    required
                    hint="Its domain must be verified in Resend, under Domains, or Resend refuses every email."
                  >
                    <Input
                      id="email-from"
                      placeholder="WIT Commerce <noreply@your-domain.com>"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </FormField>
                  <div className="gap-2 flex flex-wrap items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      loading={testing}
                      disabled={settings.source === 'off'}
                      onClick={test}
                    >
                      <Send />
                      Send test email
                    </Button>
                    <Button type="submit" loading={saving}>
                      Save
                    </Button>
                  </div>
                  {settings.source === 'off' && (
                    <p className="text-xs text-muted">Save a key first, then send a test email.</p>
                  )}
                  {result && (
                    <Banner
                      tone={result.ok ? 'success' : 'danger'}
                      title={result.ok ? 'Test email sent' : 'The test email did not go out'}
                    >
                      {result.ok ? `Resend accepted it for ${result.to}. Check that inbox.` : result.error}
                    </Banner>
                  )}
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
