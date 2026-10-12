import type { RouteObject } from 'react-router'
import { t } from '../i18n'
import { type CrumbArgs, page } from './page'
export const salesRoutes: RouteObject[] = [
  {
    path: 'sales/sellers',
    handle: { breadcrumb: t.breadcrumb.sellers },
    lazy: page(() => import('../pages/sellers/SellersPage'), 'SellersPage'),
  },
  {
    path: 'sales/sellers/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.sellerDetail(params.id ?? '') },
    lazy: page(() => import('../pages/sellers/SellerDetailPage'), 'SellerDetailPage'),
  },
  {
    path: 'sales/performance',
    handle: { breadcrumb: t.breadcrumb.performance },
    lazy: page(() => import('../pages/performance/PerformancePage'), 'PerformancePage'),
  },
]
