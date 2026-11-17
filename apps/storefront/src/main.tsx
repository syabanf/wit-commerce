import { ApiError } from '@rc/api'
import { Toaster } from '@rc/ui'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { HTTP, api } from './lib/api'
import { HOST_STORE, STORE_ROOT, customDomainHost, setHostStore, storeHostUrl } from './lib/host'

// Builds serve the store under STOREFRONT_BASE (vite.config.ts); dev serves it at the root.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

const render = (node: ReactNode) =>
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)

/** A host no verified custom domain matches. */
function NoStore({ host }: { host: string }) {
  document.title = 'No store at this address'
  return (
    <main className="p-4 flex min-h-dvh items-center justify-center bg-surface">
      <div className="max-w-md p-8 rounded-card bg-card text-center shadow-card">
        <h1 className="text-2xl font-bold">No store at this address</h1>
        <p className="mt-2 text-sm break-all text-muted">
          {host} is not connected to a store, or its owner has not finished setting it up.
        </p>
      </div>
    </main>
  )
}

/** Which store a brand's own domain serves: asked once, before any route loads. */
async function storeForDomain(host: string): Promise<string | null> {
  if (!HTTP) return null
  try {
    return (await api.shop.byHost(host)).store
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

async function boot() {
  // A production build that knows its store root sends old path URLs (/lari/p/1) to the store's own host.
  const moved =
    import.meta.env.PROD && !HOST_STORE && STORE_ROOT
      ? storeHostUrl(window.location.pathname.slice(basename.length), STORE_ROOT)
      : null
  const custom = HOST_STORE
    ? null
    : customDomainHost(window.location.hostname, STORE_ROOT, import.meta.env.BASE_URL)
  if (custom) {
    const store = await storeForDomain(custom)
    if (!store) return render(<NoStore host={custom} />)
    setHostStore(store)
  } else if (moved) {
    return window.location.replace(moved + window.location.search + window.location.hash)
  }
  // The routes and paths read HOST_STORE when they load, so they load after it is settled.
  const [{ RouterProvider, createBrowserRouter }, { routes }, { AppStateProvider }] = await Promise.all([
    import('react-router'),
    import('./router'),
    import('./state/store'),
  ])
  const router = createBrowserRouter(routes, { basename: basename || '/' })
  render(
    <AppStateProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AppStateProvider>,
  )
}

void boot()
