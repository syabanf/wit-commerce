import { Toaster } from '@rc/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import './index.css'
import { HOST_STORE, STORE_ROOT, storeHostUrl } from './lib/host'
import { routes } from './router'
import { AppStateProvider } from './state/store'

// Builds serve the store under STOREFRONT_BASE (vite.config.ts); dev serves it at the root.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

// A production build that knows its store root sends old path URLs (/lari/p/1) to the store's own host.
const moved =
  import.meta.env.PROD && !HOST_STORE && STORE_ROOT
    ? storeHostUrl(window.location.pathname.slice(basename.length), STORE_ROOT)
    : null

if (moved) {
  window.location.replace(moved + window.location.search + window.location.hash)
} else {
  const router = createBrowserRouter(routes, { basename: basename || '/' })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppStateProvider>
        <RouterProvider router={router} />
        <Toaster />
      </AppStateProvider>
    </StrictMode>,
  )
}
