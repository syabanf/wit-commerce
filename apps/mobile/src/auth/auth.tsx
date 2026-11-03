import { ApiError } from '@rc/api'
import type { Seller, Tenant, User } from '@rc/types'
import { type ReactNode, createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react'
import { Navigate, useLocation } from 'react-router'
import { HTTP, api, tokenStore } from '../lib/api'
import { readStorage, writeStorage } from '../lib/storage'
import { useStore } from '../state/store'

const SESSION_KEY = 'rc.mobile.session'

interface Session {
  userId: string
  tenantId: string
  sellerId: string
}

interface AuthValue {
  user: User | null
  seller: Seller | null
  tenant: Tenant | null
  /** True while a signed-in session waits for the API to load its data. */
  loading: boolean
  /**
   * Opens a seller profile. The API needs the seller's email and the password; the local demo
   * needs neither. Resolves to an error sentence, or null when in.
   */
  signIn: (seller: Seller, credentials?: { email: string; password: string }) => Promise<string | null>
  /** The API dropped the token while this browser still held a session. */
  expired: boolean
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/** Seller profiles a user can sign in to: one per brand they sell for, suspended ones left out. */
export const profilesOf = (sellers: readonly Seller[], userId: string) =>
  sellers.filter((s) => s.userId === userId && s.status !== 'suspended')

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state, ready } = useStore()
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, tokenStore.get)
  const [session, setSession] = useState<Session | null>(() => readStorage<Session | null>(SESSION_KEY, null))

  const value = useMemo<AuthValue>(() => {
    const signedIn = HTTP ? !!token && !!session : !!session
    const found =
      signedIn && session ? state.users.find((u) => u.id === session.userId && u.role === 'sales') : undefined
    const seller =
      found && session
        ? (profilesOf(state.sellers, found.id).find((s) => s.id === session.sellerId) ?? null)
        : null
    const tenant = seller ? (state.tenants.find((t) => t.id === seller.tenantId) ?? null) : null
    const user = seller && tenant ? (found ?? null) : null
    const persist = (next: Session | null) => {
      writeStorage(SESSION_KEY, next)
      setSession(next)
    }
    return {
      user,
      seller: user ? seller : null,
      tenant: user ? tenant : null,
      loading: HTTP && !!token && !ready,
      expired: HTTP && !token && !!session,
      signIn: async (s, credentials) => {
        if (!s.userId) return 'This seller has no account yet.'
        if (HTTP) {
          if (!credentials) return 'Enter the email and password.'
          try {
            const { token: issued } = await api.login(credentials.email, credentials.password)
            persist({ userId: s.userId, tenantId: s.tenantId, sellerId: s.id })
            tokenStore.set(issued)
          } catch (err) {
            if (err instanceof ApiError) return err.message
            return 'The sign-in service did not answer. Check that the API is running.'
          }
          return null
        }
        persist({ userId: s.userId, tenantId: s.tenantId, sellerId: s.id })
        return null
      },
      signOut: () => {
        persist(null)
        if (HTTP) tokenStore.set(null)
      },
    }
  }, [session, token, ready, state.users, state.sellers, state.tenants])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="min-h-dvh bg-surface" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}
