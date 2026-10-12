import { Toaster } from '@rc/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import './index.css'
import { routes } from './router'
import { AppStateProvider } from './state/store'

// `vite build --base /shop/` serves the store under /shop (production); dev serves it at the root.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AppStateProvider>
  </StrictMode>,
)
