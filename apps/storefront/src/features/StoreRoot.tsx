import type { StorefrontTheme } from '@rc/types'
import { useEffect } from 'react'
import { Link, Outlet, useLocation, useParams, useSearchParams } from 'react-router'
import { Assistant } from '../components/Assistant'
import { BrandRoot } from '../components/BrandRoot'
import { EMBED } from '../lib/embed'
import { usePersisted } from '../lib/storage'
import { useIsPhone } from '../lib/useIsPhone'
import { useTitle } from '../lib/useTitle'
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
  // Keep the launcher off forms and totals, and off Theme 2's first-visit intro on phones.
  const quiet =
    /\/(cart|checkout|account|order)(\/|$)/.test(pathname) ||
    (theme.id === 'theme2' && isPhone && !introSeen && pathname === `/${tenant.subdomain}`)
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

/** `/:store`: finds the tenant by subdomain and renders its store in its theme. */
export function StoreRoot() {
  const { store } = useParams()
  const { state } = useStore()
  const tenant = state.tenants.find((t) => t.subdomain === store)
  if (!tenant) return <UnknownStore />
  return (
    <ShopProvider key={tenant.id} tenant={tenant}>
      <ThemedStore />
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
          to="/"
          className="mt-6 min-h-11 px-5 text-sm font-semibold inline-flex items-center rounded-full bg-ink text-on-ink"
        >
          See all stores
        </Link>
      </div>
    </main>
  )
}
