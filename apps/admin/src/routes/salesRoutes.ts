// apps/admin/src/routes/salesRoutes.ts
import { page } from '../router';
import { useI18n } from '../hooks/useI18n';

const { t } = useI18n();

export const salesRoutes = [
  { path: 'sales/sellers', breadcrumb: t.breadcrumb.sellers, lazy: page(() => import('../pages/sellers/SellersPage'), 'SellersPage') },
  { path: 'sales/sellers/:id', breadcrumb: ({ params }) => t.breadcrumb.sellerDetail(params.id), lazy: page(() => import('../pages/sellers/SellerDetailPage'), 'SellerDetailPage') },
  { path: 'sales/performance', breadcrumb: t.breadcrumb.performance, lazy: page(() => import('../pages/performance/PerformancePage'), 'PerformancePage') },
];
