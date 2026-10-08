// apps/admin/src/routes/commerceRoutes.ts
import { page } from '../router';
import { useI18n } from '../hooks/useI18n';

const { t } = useI18n();

export const commerceRoutes = [
  {
    path: 'commerce/orders',
    breadcrumb: t.breadcrumb.orders,
    lazy: page(() => import('../pages/orders/OrdersPage'), 'OrdersPage'),
  },
  {
    path: 'commerce/orders/:id',
    breadcrumb: ({ params }) => t.breadcrumb.orderDetail(params.id),
    lazy: page(() => import('../pages/orders/OrderDetailPage'), 'OrderDetailPage'),
  },
  {
    path: 'commerce/payments',
    breadcrumb: t.breadcrumb.payments,
    lazy: page(() => import('../pages/payments/PaymentHistoryPage'), 'PaymentHistoryPage'),
  },
  {
    path: 'commerce/products',
    breadcrumb: t.breadcrumb.products,
    lazy: page(() => import('../pages/products/ProductsPage'), 'ProductsPage'),
  },
  {
    path: 'commerce/products/:id',
    breadcrumb: ({ params }) => t.breadcrumb.productDetail(params.id),
    lazy: page(() => import('../pages/products/ProductDetailPage'), 'ProductDetailPage'),
  },
  {
    path: 'commerce/collections',
    breadcrumb: t.breadcrumb.collections,
    lazy: page(() => import('../pages/collections/CollectionsPage'), 'CollectionsPage'),
  },
  {
    path: 'commerce/categories',
    breadcrumb: t.breadcrumb.categories,
    lazy: page(() => import('../pages/categories/CategoriesPage'), 'CategoriesPage'),
  },
  {
    path: 'commerce/attributes',
    breadcrumb: t.breadcrumb.attributes,
    lazy: page(() => import('../pages/attributes/AttributesPage'), 'AttributesPage'),
  },
  {
    path: 'commerce/modifiers',
    breadcrumb: t.breadcrumb.modifiers,
    lazy: page(() => import('../pages/modifiers/ModifiersPage'), 'ModifiersPage'),
  },
  {
    path: 'commerce/inventory',
    breadcrumb: t.breadcrumb.inventory,
    lazy: page(() => import('../pages/inventory/InventoryPage'), 'InventoryPage'),
  },
];
