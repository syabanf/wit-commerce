import { createBrowserRouter } from 'react-router'
import { RequireAuth } from './auth/auth'
import { t } from './i18n'
import { AdminLayout } from './layouts/AdminLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { commerceRoutes } from './routes/commerceRoutes'
import { customersRoutes } from './routes/customersRoutes'
import { marketingRoutes } from './routes/marketingRoutes'
import { page } from './routes/page'
import { salesRoutes } from './routes/salesRoutes'
import { miscRoutes, settingsRoutes } from './routes/settingsRoutes'
import { storeRoutes } from './routes/storeRoutes'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    HydrateFallback: () => <div className="h-dvh bg-surface" />,
    children: [
      { index: true, lazy: page(() => import('./pages/dashboard/DashboardPage'), 'DashboardPage') },
      ...commerceRoutes,
      ...storeRoutes,
      ...customersRoutes,
      ...marketingRoutes,
      ...salesRoutes,
      {
        path: 'analytics',
        handle: { breadcrumb: t.breadcrumb.analytics },
        lazy: page(() => import('./pages/analytics/AnalyticsPage'), 'AnalyticsPage'),
      },
      {
        path: 'integrations',
        handle: { breadcrumb: t.breadcrumb.integrations },
        lazy: page(() => import('./pages/integrations/IntegrationsPage'), 'IntegrationsPage'),
      },
      {
        path: 'integrations/credentials',
        handle: { breadcrumb: t.breadcrumb.credentials },
        lazy: page(() => import('./pages/integrations/CredentialsPage'), 'CredentialsPage'),
      },
      ...settingsRoutes,
      // Section shortcuts and the not-found page come last.
      ...miscRoutes,
    ],
  },
])
