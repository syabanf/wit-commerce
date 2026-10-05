import type { Seller, Tenant, User } from '@rc/types'
import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
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
  signIn: (seller: Seller) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/** Seller profiles a user can sign in to: one per brand they sell for, suspended ones left out. */
export const profilesOf = (sellers: readonly Seller[], userId: string) =>
  sellers.filter((s) => s.userId === userId && s.status !== 'suspended')

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state } = useStore()
  const [session, setSession] = useState<Session | null>(() => readStorage<Session | null>(SESSION_KEY, null))

  const value = useMemo<AuthValue>(() => {
    const found = session ? state.users.find((u) => u.id === session.userId && u.role === 'sales') : undefined
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
      signIn: (s) => {
        if (s.userId) persist({ userId: s.userId, tenantId: s.tenantId, sellerId: s.id })
      },
      signOut: () => persist(null),
    }
  }, [session, state.users, state.sellers, state.tenants])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}
