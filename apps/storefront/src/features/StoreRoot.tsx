import type { StorefrontTheme } from '@rc/types'
import { useEffect } from 'react'
import { Link, Outlet, useLocation, useParams, useSearchParams } from 'react-router'
import { Assistant } from '../components/Assistant'
import { BrandRoot } from '../components/BrandRoot'
import { ADMIN_ORIGINS, EMBED } from '../lib/embed'
import { HOST_STORE } from '../lib/host'
import { paths } from '../lib/paths'
import { usePersisted } from '../lib/storage'
import { useIsPhone } from '../lib/useIsPhone'
import { useTitle } from '../lib/useTitle'
import { HTTP } from '../lib/api'
import { AgentChatProvider } from '../state/agentChat'
import { ShopProvider, useShop } from '../state/shop'
import { useStore } from '../state/store'
import { DemoBar } from '../components/DemoBar'
import { isTheme, useThemeChoice } from '../themes/registry'

/** Remembers `?ref=<slug>` on any store URL, so later orders credit that seller. */
function useReferralParam() {
  const { catalog, setReferral } = useShop()
  const [params] = useSearchParams()
  const ref = params.get('ref')?.toLowerCase() ?? null
  useEffect(() => {
    if (!ref) return
    const seller = catalog.sellers.find((s) => s.slug === ref && s.status === 'active')
    if (seller) setReferral(seller.id)
  }, [ref, catalog.sellers, setReferral])
}

/** `?theme=theme2` previews the store in another theme for the rest of the visit. */
function useThemeParam(setPreview: (theme: StorefrontTheme | null) => void) {
  const [params] = useSearchParams()
  const requested = params.get('theme')
  useEffect(() => {
    if (isTheme(requested)) setPreview(requested)
  }, [requested, setPreview])
}

function ThemedStore() {
  const { tenant } = useShop()
  const { theme, setPreview } = useThemeChoice()
  useThemeParam(setPreview)
  useReferralParam()
  useTitle(tenant.name)
  const { pathname } = useLocation()
  const isPhone = useIsPhone()
  const [introSeen] = usePersisted<boolean>('local', `rc.storefront.intro.${tenant.id}`, false)
  // Keep the launcher off forms, totals and the agent chat, and off Theme 2's first-visit intro on phones.
  const quiet =
    /\/(cart|checkout|account|order|agent)(\/|$)/.test(pathname) ||
    (isPhone && /\/p\/[^/]+/.test(pathname)) ||
    (theme.id === 'theme2' && isPhone && !introSeen && pathname === paths.home(tenant.subdomain))
  return (
    <BrandRoot brand={tenant.brand} theme={theme.id}>
      {!EMBED && <DemoBar />}
      <theme.Layout>
        <Outlet />
      </theme.Layout>
      <Assistant look={theme.assistant} hidden={quiet || EMBED} />
    </BrandRoot>
  )
}

/** `/:store`, or `/` on a store host: finds the tenant by subdomain and renders its store in its theme. */
export function StoreRoot() {
  const params = useParams()
  const store = HOST_STORE ?? params.store
  const { state } = useStore()
  const tenant = state.tenants.find((t) => t.subdomain === store)
  const live =
    tenant &&
    (EMBED ||
      HTTP ||
      state.pages.some((p) => p.tenantId === tenant.id && p.kind === 'home' && p.status === 'published'))
  // The API lists live stores only, so on a store host a missing tenant is one that has not opened yet.
  if (!live) return HOST_STORE ? <ComingSoon name={tenant?.name} /> : <UnknownStore />
  return (
    <ShopProvider key={tenant.id} tenant={tenant}>
      <AgentChatProvider>
        <ThemedStore />
      </AgentChatProvider>
    </ShopProvider>
  )
}

export function UnknownStore() {
  useTitle('Store not found · Commerce OS Store')
  return (
    <main className="p-4 flex min-h-dvh items-center justify-center bg-surface">
      <div className="max-w-md p-8 rounded-card bg-card text-center shadow-card">
        <h1 className="text-2xl font-bold">We could not find that store</h1>
        <p className="mt-2 text-sm text-muted">
          Check the address, or pick one of the stores on Commerce OS.
        </p>
        <Link
          to={paths.chooser()}
          className="mt-6 min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-full bg-ink text-on-ink"
        >
          See all stores
        </Link>
      </div>
    </main>
  )
}

/** A store host whose store is not published yet, or does not exist. */
function ComingSoon({ name }: { name?: string }) {
  useTitle(name ? `${name} · Coming soon` : 'Coming soon · Commerce OS Store')
  return (
    <main className="p-4 flex min-h-dvh items-center justify-center bg-surface">
      <div className="max-w-md p-8 rounded-card bg-card text-center shadow-card">
        <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Coming soon</p>
        <h1 className="mt-2 text-2xl font-bold">{name ?? 'This store'} opens soon</h1>
        <p className="mt-2 text-sm text-muted">
          The owner is still setting it up. Come back in a little while.
        </p>
        <p className="mt-6 text-sm text-muted">
          Are you the owner?{' '}
          <a
            href={`${ADMIN_ORIGINS[0]}/login`}
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Sign in
          </a>
        </p>
      </div>
    </main>
  )
}
