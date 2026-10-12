import { Navigate, type RouteObject } from 'react-router'
import { t } from '../i18n'
import { page } from './page'
export const settingsRoutes: RouteObject[] = [
  {
    path: 'settings/payment-types',
    handle: { breadcrumb: t.breadcrumb.paymentTypes },
    lazy: page(() => import('../pages/payment-types/PaymentTypesPage'), 'PaymentTypesPage'),
  },
  {
    path: 'settings/users',
    handle: { breadcrumb: t.breadcrumb.users },
    lazy: page(() => import('../pages/settings/UsersPage'), 'UsersPage'),
  },
  {
    path: 'settings/tenants',
    handle: { breadcrumb: t.breadcrumb.tenants },
    lazy: page(() => import('../pages/settings/TenantsPage'), 'TenantsPage'),
  },
  {
    path: 'settings/tenants/new',
    handle: { breadcrumb: t.breadcrumb.newTenant },
    lazy: page(() => import('../pages/settings/OnboardingPage'), 'OnboardingPage'),
  },
  {
    path: 'settings/apps',
    handle: { breadcrumb: t.breadcrumb.apps },
    lazy: page(() => import('../pages/settings/AppsPage'), 'AppsPage'),
  },
]

// Miscellaneous redirects and wildcard
export const miscRoutes: RouteObject[] = [
  // Shortcut: `/commerce` → default to the orders list.
  { path: 'commerce', element: <Navigate to="/commerce/orders" replace /> },
  // Shortcut: `/store` → brand guideline.
  { path: 'store', element: <Navigate to="/store/brand" replace /> },
  // Shortcut: `/customers` → all‑customers view.
  { path: 'customers', element: <Navigate to="/customers/all" replace /> },
  // Shortcut: `/marketing` → campaign list.
  { path: 'marketing', element: <Navigate to="/marketing/campaigns" replace /> },
  // Shortcut: `/sales` → sellers list.
  { path: 'sales', element: <Navigate to="/sales/sellers" replace /> },
  // Shortcut: `/settings` → users page.
  { path: 'settings', element: <Navigate to="/settings/users" replace /> },
  // Wildcard 404
  { path: '*', lazy: page(() => import('../pages/NotFoundPage'), 'NotFoundPage') },
]
