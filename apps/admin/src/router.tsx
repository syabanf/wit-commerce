import type { ComponentType } from 'react'
import { Navigate, createBrowserRouter } from 'react-router'
import { RequireAuth } from './auth/auth'
import { AdminLayout } from './layouts/AdminLayout'
import { LoginPage } from './pages/auth/LoginPage'

/** Loads a page module on first visit, so every feature ships as its own chunk. */
const page =
  <K extends string, M extends Record<K, ComponentType>>(load: () => Promise<M>, name: K) =>
  async () => ({ Component: (await load())[name] })

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
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
      { path: 'commerce/orders', lazy: page(() => import('./pages/orders/OrdersPage'), 'OrdersPage') },
      {
        path: 'commerce/orders/:id',
        lazy: page(() => import('./pages/orders/OrderDetailPage'), 'OrderDetailPage'),
      },
      {
        path: 'commerce/products',
        lazy: page(() => import('./pages/products/ProductsPage'), 'ProductsPage'),
      },
      {
        path: 'commerce/products/:id',
        lazy: page(() => import('./pages/products/ProductDetailPage'), 'ProductDetailPage'),
      },
      {
        path: 'commerce/collections',
        lazy: page(() => import('./pages/collections/CollectionsPage'), 'CollectionsPage'),
      },
      {
        path: 'commerce/categories',
        lazy: page(() => import('./pages/categories/CategoriesPage'), 'CategoriesPage'),
      },
      {
        path: 'commerce/attributes',
        lazy: page(() => import('./pages/attributes/AttributesPage'), 'AttributesPage'),
      },
      {
        path: 'commerce/modifiers',
        lazy: page(() => import('./pages/modifiers/ModifiersPage'), 'ModifiersPage'),
      },
      {
        path: 'commerce/inventory',
        lazy: page(() => import('./pages/inventory/InventoryPage'), 'InventoryPage'),
      },
      { path: 'store/pages', lazy: page(() => import('./pages/store-pages/PagesPage'), 'PagesPage') },
      {
        path: 'store/pages/:id',
        lazy: page(() => import('./pages/store-pages/PageEditorPage'), 'PageEditorPage'),
      },
      {
        path: 'store/templates',
        lazy: page(() => import('./pages/templates/TemplatesPage'), 'TemplatesPage'),
      },
      { path: 'store/brand', lazy: page(() => import('./pages/brand/BrandPage'), 'BrandPage') },
      { path: 'store/domains', lazy: page(() => import('./pages/domains/DomainsPage'), 'DomainsPage') },
      { path: 'customers/all', lazy: page(() => import('./pages/customers/CustomersPage'), 'CustomersPage') },
      {
        path: 'customers/all/:id',
        lazy: page(() => import('./pages/customers/CustomerDetailPage'), 'CustomerDetailPage'),
      },
      {
        path: 'customers/segments',
        lazy: page(() => import('./pages/segments/SegmentsPage'), 'SegmentsPage'),
      },
      {
        path: 'customers/segments/:id',
        lazy: page(() => import('./pages/segments/SegmentDetailPage'), 'SegmentDetailPage'),
      },
      { path: 'customers/leads', lazy: page(() => import('./pages/leads/LeadsPage'), 'LeadsPage') },
      {
        path: 'customers/leads/:id',
        lazy: page(() => import('./pages/leads/LeadDetailPage'), 'LeadDetailPage'),
      },
      { path: 'customers/loyalty', lazy: page(() => import('./pages/loyalty/LoyaltyPage'), 'LoyaltyPage') },
      { path: 'customers/support', lazy: page(() => import('./pages/support/SupportPage'), 'SupportPage') },
      {
        path: 'marketing/campaigns',
        lazy: page(() => import('./pages/campaigns/CampaignsPage'), 'CampaignsPage'),
      },
      {
        path: 'marketing/campaigns/:id',
        lazy: page(() => import('./pages/campaigns/CampaignDetailPage'), 'CampaignDetailPage'),
      },
      {
        path: 'marketing/automations',
        lazy: page(() => import('./pages/automations/AutomationsPage'), 'AutomationsPage'),
      },
      {
        path: 'marketing/automations/:id',
        lazy: page(() => import('./pages/automations/AutomationDetailPage'), 'AutomationDetailPage'),
      },
      {
        path: 'marketing/promotions',
        lazy: page(() => import('./pages/promotions/PromotionsPage'), 'PromotionsPage'),
      },
      { path: 'sales/sellers', lazy: page(() => import('./pages/sellers/SellersPage'), 'SellersPage') },
      {
        path: 'sales/sellers/:id',
        lazy: page(() => import('./pages/sellers/SellerDetailPage'), 'SellerDetailPage'),
      },
      {
        path: 'sales/performance',
        lazy: page(() => import('./pages/performance/PerformancePage'), 'PerformancePage'),
      },
      { path: 'analytics', lazy: page(() => import('./pages/analytics/AnalyticsPage'), 'AnalyticsPage') },
      {
        path: 'integrations',
        lazy: page(() => import('./pages/integrations/IntegrationsPage'), 'IntegrationsPage'),
      },
      {
        path: 'settings/payment-types',
        lazy: page(() => import('./pages/payment-types/PaymentTypesPage'), 'PaymentTypesPage'),
      },
      { path: 'settings/users', lazy: page(() => import('./pages/settings/UsersPage'), 'UsersPage') },
      { path: 'settings/tenants', lazy: page(() => import('./pages/settings/TenantsPage'), 'TenantsPage') },
      {
        path: 'settings/tenants/new',
        lazy: page(() => import('./pages/settings/OnboardingPage'), 'OnboardingPage'),
      },
      { path: 'settings/apps', lazy: page(() => import('./pages/settings/AppsPage'), 'AppsPage') },
      { path: 'commerce', element: <Navigate to="/commerce/orders" replace /> },
      { path: 'store', element: <Navigate to="/store/pages" replace /> },
      { path: 'customers', element: <Navigate to="/customers/all" replace /> },
      { path: 'marketing', element: <Navigate to="/marketing/campaigns" replace /> },
      { path: 'sales', element: <Navigate to="/sales/sellers" replace /> },
      { path: 'settings', element: <Navigate to="/settings/users" replace /> },
      { path: '*', lazy: page(() => import('./pages/NotFoundPage'), 'NotFoundPage') },
    ],
  },
])
