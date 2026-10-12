import type { RouteObject } from 'react-router'
import { t } from '../i18n'
import { type CrumbArgs, page } from './page'
export const storeRoutes: RouteObject[] = [
  {
    path: 'store/pages',
    handle: { breadcrumb: t.breadcrumb.pages },
    lazy: page(() => import('../pages/store-pages/PagesPage'), 'PagesPage'),
  },
  {
    path: 'store/pages/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.pageDetail(params.id ?? '') },
    lazy: page(() => import('../pages/store-pages/PageEditorPage'), 'PageEditorPage'),
  },
  {
    path: 'store/templates',
    handle: { breadcrumb: t.breadcrumb.templates },
    lazy: page(() => import('../pages/templates/TemplatesPage'), 'TemplatesPage'),
  },
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
