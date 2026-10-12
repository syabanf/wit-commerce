import type { RouteObject } from 'react-router'
import { t } from '../i18n'
import { type CrumbArgs, page } from './page'
export const commerceRoutes: RouteObject[] = [
  {
    path: 'commerce/orders',
    handle: { breadcrumb: t.breadcrumb.orders },
    lazy: page(() => import('../pages/orders/OrdersPage'), 'OrdersPage'),
  },
  {
    path: 'commerce/orders/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.orderDetail(params.id ?? '') },
    lazy: page(() => import('../pages/orders/OrderDetailPage'), 'OrderDetailPage'),
  },
  {
    path: 'commerce/payments',
    handle: { breadcrumb: t.breadcrumb.payments },
    lazy: page(() => import('../pages/payments/PaymentHistoryPage'), 'PaymentHistoryPage'),
  },
  {
    path: 'commerce/agents',
    handle: { breadcrumb: t.breadcrumb.agents },
    lazy: page(() => import('../pages/agents/AgentCommercePage'), 'AgentCommercePage'),
  },
  {
    path: 'commerce/products',
    handle: { breadcrumb: t.breadcrumb.products },
    lazy: page(() => import('../pages/products/ProductsPage'), 'ProductsPage'),
  },
  {
    path: 'commerce/products/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.productDetail(params.id ?? '') },
    lazy: page(() => import('../pages/products/ProductDetailPage'), 'ProductDetailPage'),
  },
  {
    path: 'commerce/collections',
    handle: { breadcrumb: t.breadcrumb.collections },
    lazy: page(() => import('../pages/collections/CollectionsPage'), 'CollectionsPage'),
  },
  {
    path: 'commerce/categories',
    handle: { breadcrumb: t.breadcrumb.categories },
    lazy: page(() => import('../pages/categories/CategoriesPage'), 'CategoriesPage'),
  },
  {
    path: 'commerce/attributes',
    handle: { breadcrumb: t.breadcrumb.attributes },
    lazy: page(() => import('../pages/attributes/AttributesPage'), 'AttributesPage'),
  },
  {
    path: 'commerce/modifiers',
    handle: { breadcrumb: t.breadcrumb.modifiers },
    lazy: page(() => import('../pages/modifiers/ModifiersPage'), 'ModifiersPage'),
  },
  {
    path: 'commerce/inventory',
    handle: { breadcrumb: t.breadcrumb.inventory },
    lazy: page(() => import('../pages/inventory/InventoryPage'), 'InventoryPage'),
  },
]
