import type { Seller, User } from '@rc/types'
import { Avatar, Button, Kicker, toast } from '@rc/ui'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { profilesOf, useAuth } from '../../auth/auth'
import { firstName } from '../../lib/seller'
import { useStore } from '../../state/store'

const rowClass =
  'flex min-h-12 w-full items-center gap-3 rounded-[20px] bg-card p-3 text-left shadow-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98]'

export function LoginPage() {
  const { state } = useStore()
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [picking, setPicking] = useState<User | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (user) return <Navigate to={from} replace />

  const sellers = state.users.filter((u) => u.role === 'sales' && profilesOf(state.sellers, u.id).length > 0)
  const tenantName = (id: string) => state.tenants.find((t) => t.id === id)?.name ?? 'Unknown brand'

  const enter = (seller: Seller) => {
    signIn(seller)
    toast(`Welcome, ${firstName(seller.name)}`, {
      tone: 'success',
      description: `Signed in to your ${tenantName(seller.tenantId)} store.`,
    })
    navigate(from, { replace: true })
  }

  const choose = (u: User) => {
    const profiles = profilesOf(state.sellers, u.id)
    if (profiles.length === 1) enter(profiles[0]!)
    else setPicking(u)
  }

  return (
    <div className="max-w-md px-6 pb-10 mx-auto min-h-dvh w-full bg-surface pt-[max(env(safe-area-inset-top),4rem)]">
      <div className="gap-3 flex items-center">
        <span className="size-11 rounded-2xl text-white flex items-center justify-center bg-ink shadow-float">
          <svg viewBox="0 0 64 64" aria-hidden="true" className="size-7">
            <path
              d="M14 26h36l-3-10H17z"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M17 30v18h30V30"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="40" r="5" fill="var(--color-accent)" />
          </svg>
        </span>
        <div>
          <p className="font-bold leading-tight text-[15px]">Commerce OS Seller</p>
          <p className="text-xs text-muted">Your store, leads and customers</p>
        </div>
      </div>

      {picking ? (
        <>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">
            Pick a brand<span className="text-accent">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {picking.name} sells for more than one brand. Each has its own store, leads and customers.
          </p>
          <div className="mt-8 space-y-2">
            {profilesOf(state.sellers, picking.id).map((s) => (
              <button key={s.id} type="button" className={rowClass} onClick={() => enter(s)}>
                <Avatar name={tenantName(s.tenantId)} color={s.color} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">{tenantName(s.tenantId)}</span>
                  <span className="text-xs block truncate text-muted">
                    <span className="font-mono">{s.code}</span> · /{s.slug}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
              </button>
            ))}
          </div>
          <Button variant="ghost" size="lg" className="mt-4 w-full" onClick={() => setPicking(null)}>
            <ArrowLeft />
            Choose another seller
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">
            Sign in<span className="text-accent">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Pick a demo seller to open their store, leads and customers.
          </p>
          <section className="mt-8">
            <Kicker className="mb-2">Demo sellers</Kicker>
            <div className="space-y-2">
              {sellers.map((u) => {
                const brands = profilesOf(state.sellers, u.id).map((s) => tenantName(s.tenantId))
                return (
                  <button key={u.id} type="button" className={rowClass} onClick={() => choose(u)}>
                    <Avatar name={u.name} color={u.color} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold block truncate">{u.name}</span>
                      <span className="text-xs block truncate text-muted">
                        {u.title} · {brands.length > 1 ? `${brands.length} brands` : brands[0]}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}
      <p className="mt-8 text-xs text-muted">
        Demo accounts, no password. Data as of Monday 5 October 2026, 09:41 WIB.
      </p>
    </div>
  )
}
