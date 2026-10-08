// apps/admin/src/routes/settingsRoutes.ts
import { page } from '../router';
import { useI18n } from '../hooks/useI18n';
import { Navigate } from 'react-router';

const { t } = useI18n();

export const settingsRoutes = [
  { path: 'settings/payment-types', breadcrumb: t.breadcrumb.paymentTypes, lazy: page(() => import('../pages/payment-types/PaymentTypesPage'), 'PaymentTypesPage') },
  { path: 'settings/users', breadcrumb: t.breadcrumb.users, lazy: page(() => import('../pages/settings/UsersPage'), 'UsersPage') },
  { path: 'settings/tenants', breadcrumb: t.breadcrumb.tenants, lazy: page(() => import('../pages/settings/TenantsPage'), 'TenantsPage') },
  { path: 'settings/tenants/new', breadcrumb: t.breadcrumb.newTenant, lazy: page(() => import('../pages/settings/OnboardingPage'), 'OnboardingPage') },
  { path: 'settings/apps', breadcrumb: t.breadcrumb.apps, lazy: page(() => import('../pages/settings/AppsPage'), 'AppsPage') },
];

// Miscellaneous redirects and wildcard
export const miscRoutes = [
  // Shortcut: `/commerce` → default to the orders list.
  { path: 'commerce', element: <Navigate to="/commerce/orders" replace /> },
  // Shortcut: `/store` → page management start.
  { path: 'store', element: <Navigate to="/store/pages" replace /> },
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
];
