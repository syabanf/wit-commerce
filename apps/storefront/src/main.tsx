import { Toaster } from '@rc/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import './index.css'
import { routes } from './router'
import { AppStateProvider } from './state/store'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AppStateProvider>
  </StrictMode>,
)
