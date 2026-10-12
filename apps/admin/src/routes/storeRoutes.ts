import type { RouteObject } from 'react-router'
import { t } from '../i18n'
import { page } from './page'
export const storeRoutes: RouteObject[] = [
  {
    path: 'store/brand',
    handle: { breadcrumb: t.breadcrumb.brand },
    lazy: page(() => import('../pages/brand/BrandPage'), 'BrandPage'),
  },
  {
    path: 'store/domains',
    handle: { breadcrumb: t.breadcrumb.domains },
    lazy: page(() => import('../pages/domains/DomainsPage'), 'DomainsPage'),
  },
]
