import { ApiError } from '@rc/api'
import { type Permission, can } from '@rc/fixtures'
import type { Tenant, User } from '@rc/types'
import {
  type ReactNode,
  Suspense,
  createContext,
  lazy,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { Navigate, useLocation } from 'react-router'
import { HTTP, api, tokenStore } from '../lib/api'
import { readStorage, writeStorage } from '../lib/storage'
import { useStore } from '../state/store'
import { hasEntered, markEntered } from './entry'

const PublicHome = lazy(() => import('../pages/site/HomePage').then((m) => ({ default: m.PublicHome })))

export const SESSION_KEY = 'rc.admin.session'

interface Session {
  userId: string
  tenantId: string
}

interface AuthValue {
  user: User | null
  tenant: Tenant | null
  tenants: Tenant[]
  /** True while a signed-in session waits for the API to load its data. */
  loading: boolean
  /** The API dropped the token while this browser still held a session. */
  expired: boolean
  /** Local mode: sign in as a demo user by id. */
  signIn: (userId: string) => void
  /** API mode: sign in with email and password; resolves to an error sentence, or null when in. */
  signInWithPassword: (email: string, password: string) => Promise<string | null>
  /** API mode: keep a token the server just issued, as after sign-up. */
  startSession: (token: string, user: User) => void
  signOut: () => void
  switchTenant: (tenantId: string) => void
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state, ready } = useStore()
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, tokenStore.get)
  const [session, setSession] = useState<Session | null>(() => readStorage<Session | null>(SESSION_KEY, null))

  const value = useMemo<AuthValue>(() => {
    const signedIn = HTTP ? !!token && !!session : !!session
    const user = signedIn && session ? (state.users.find((u) => u.id === session.userId) ?? null) : null
    const tenants = user
      ? state.tenants.filter((t) => user.role === 'platform_admin' || user.tenantIds.includes(t.id))
      : []
    const tenant = user ? (tenants.find((t) => t.id === session?.tenantId) ?? tenants[0] ?? null) : null
    const persist = (next: Session | null) => {
      if (next) markEntered()
      writeStorage(SESSION_KEY, next)
      setSession(next)
    }
    const startSession = (issued: string, u: User) => {
      persist({ userId: u.id, tenantId: u.tenantIds[0] ?? '' })
      tokenStore.set(issued)
    }
    return {
      user,
      tenant,
      tenants,
      loading: HTTP && !!token && !ready,
      expired: HTTP && !token && !!session,
      signIn: (userId) => {
        const u = state.users.find((x) => x.id === userId)
        if (u) persist({ userId, tenantId: u.tenantIds[0]! })
      },
      signInWithPassword: async (email, password) => {
        try {
          const { token: issued, user: u } = await api.login(email, password)
          startSession(issued, u)
          return null
        } catch (err) {
          if (err instanceof ApiError) return err.message
          return 'The sign-in service did not answer. Check that the API is running.'
        }
      },
      startSession,
      signOut: () => {
        persist(null)
        if (HTTP) tokenStore.set(null)
      },
      switchTenant: (tenantId) => session && persist({ ...session, tenantId }),
      can: (permission) => !!user && can(user.role, permission),
    }
  }, [session, token, ready, state.users, state.tenants])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, tenant, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="h-[var(--admin-viewport-height)] bg-surface" />
  const atRoot = location.pathname === '/'
  // The root shows the public site first in every tab, signed in or not; other pages ask to sign in.
  if (atRoot && (!user || !tenant || !hasEntered())) {
    return (
      <Suspense fallback={<div className="h-dvh bg-surface" />}>
        <PublicHome />
      </Suspense>
    )
  }
  if (!user || !tenant) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  // A deep link into the console counts as entering it, so Home from there stays in the console.
  if (!atRoot) markEntered()
  return children
}
