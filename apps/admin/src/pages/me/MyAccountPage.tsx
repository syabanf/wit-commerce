import { ApiError } from '@rc/api'
import { fmtDate, listOf } from '@rc/fixtures'
import { ROLE_LABEL } from '@rc/types'
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChangePasswordDialog,
  KeyValue,
  PageHeader,
  toast,
} from '@rc/ui'
import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api, tokenStore } from '../../lib/api'
import { useScoped } from '../../state/scoped'

/** Asks /auth/me whether this deployment sends email, so the page knows if confirming applies. */
function useEmailOn() {
  const [emailOn, setEmailOn] = useState(false)
  useEffect(() => {
    if (!HTTP) return
    let live = true
    api
      .me()
      .then((me) => {
        if (live) setEmailOn(me.emailOn)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return emailOn
}

/** The signed-in person's own details and password. */
export function MyAccountPage() {
  const { user } = useScoped()
  const { tenants } = useAuth()
  const emailOn = useEmailOn()
  const [changing, setChanging] = useState(false)

  const changePassword = async (current: string, next: string) => {
    try {
      const { token } = await api.changePassword(current, next)
      tokenStore.set(token)
      toast('Password changed', { tone: 'success', description: 'Your other devices signed out.' })
      return null
    } catch (err) {
      return err instanceof ApiError ? err.message : 'The server did not answer. Try again in a moment.'
    }
  }

  return (
    <>
      <PageHeader title="My account" description="Your details at work and the password you sign in with." />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            Passwords live on the server. Build the console with VITE_API_URL to change yours.
          </Banner>
        )}
        <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
          <Card>
            <CardHeader>
              <div className="gap-3 flex items-center">
                <Avatar name={user.name} color={user.color} size="md" />
                <div className="min-w-0">
                  <CardTitle className="truncate">{user.name}</CardTitle>
                  <CardDescription className="truncate">
                    {user.title || ROLE_LABEL[user.role]}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                items={[
                  { label: 'Email', value: user.email },
                  { label: 'Role', value: ROLE_LABEL[user.role] },
                  { label: 'Brands', value: listOf(tenants.map((t) => t.name)) },
                  {
                    label: 'Email check',
                    // The API reports this only where it sends email; elsewhere the row stays out.
                    hidden: !user.emailVerifiedAt && !emailOn,
                    value: user.emailVerifiedAt ? (
                      <span className="gap-2 inline-flex flex-wrap items-center">
                        <Badge variant="success">Confirmed</Badge>
                        <span className="text-muted">{fmtDate(user.emailVerifiedAt)}</span>
                      </span>
                    ) : (
                      <Badge variant="warning">Not confirmed yet</Badge>
                    ),
                  },
                ]}
              />
              <p className="mt-3 text-xs text-muted">
                An admin of your brand changes your name, role and brands in Users and roles.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Changing it needs your current password and signs your other devices out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" disabled={!HTTP} onClick={() => setChanging(true)}>
                <KeyRound />
                Change password
              </Button>
              {!HTTP && <p className="mt-2 text-xs text-muted">The demo has no passwords to change.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} onChange={changePassword} />
    </>
  )
}
