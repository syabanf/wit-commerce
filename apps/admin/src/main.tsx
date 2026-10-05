import { Toaster, TooltipProvider } from '@rc/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AuthProvider } from './auth/auth'
import './index.css'
import { router } from './router'
import { AppStateProvider } from './state/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </AppStateProvider>
  </StrictMode>,
)
