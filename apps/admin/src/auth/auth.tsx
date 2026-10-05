import { type Permission, can } from '@rc/fixtures'
import type { Tenant, User } from '@rc/types'
import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { readStorage, writeStorage } from '../lib/storage'
import { useStore } from '../state/store'

export const SESSION_KEY = 'rc.admin.session'

interface Session {
  userId: string
  tenantId: string
}

interface AuthValue {
  user: User | null
  tenant: Tenant | null
  tenants: Tenant[]
  signIn: (userId: string) => void
  signOut: () => void
  switchTenant: (tenantId: string) => void
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state } = useStore()
  const [session, setSession] = useState<Session | null>(() => readStorage<Session | null>(SESSION_KEY, null))

  const value = useMemo<AuthValue>(() => {
    const user = session ? (state.users.find((u) => u.id === session.userId) ?? null) : null
    const tenants = user
      ? state.tenants.filter((t) => user.role === 'platform_admin' || user.tenantIds.includes(t.id))
      : []
    const tenant = user ? (tenants.find((t) => t.id === session?.tenantId) ?? tenants[0] ?? null) : null
    const persist = (next: Session | null) => {
      writeStorage(SESSION_KEY, next)
      setSession(next)
    }
    return {
      user,
      tenant,
      tenants,
      signIn: (userId) => {
        const u = state.users.find((x) => x.id === userId)
        if (u) persist({ userId, tenantId: u.tenantIds[0]! })
      },
      signOut: () => persist(null),
      switchTenant: (tenantId) => session && persist({ ...session, tenantId }),
      can: (permission) => !!user && can(user.role, permission),
    }
  }, [session, state.users, state.tenants])

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, tenant } = useAuth()
  const location = useLocation()
  if (!user || !tenant) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
