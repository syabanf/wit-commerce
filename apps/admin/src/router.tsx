// apps/admin/src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router';
import { RequireAuth } from './auth/auth';
import { AdminLayout } from './layouts/AdminLayout';
import { page } from './router'; // unchanged helper
import { commerceRoutes } from './routes/commerceRoutes';
import { storeRoutes } from './routes/storeRoutes';
import { customersRoutes } from './routes/customersRoutes';
import { marketingRoutes } from './routes/marketingRoutes';
import { salesRoutes } from './routes/salesRoutes';
import { settingsRoutes, miscRoutes } from './routes/settingsRoutes';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, lazy: page(() => import('./pages/dashboard/DashboardPage'), 'DashboardPage') },
      // Domain groups
      ...commerceRoutes,
      ...storeRoutes,
      ...customersRoutes,
      ...marketingRoutes,
      ...salesRoutes,
      ...settingsRoutes,
      // Miscellaneous (redirects + 404)
      ...miscRoutes,
    ],
  },
]);
