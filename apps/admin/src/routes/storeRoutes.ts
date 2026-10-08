// apps/admin/src/routes/storeRoutes.ts
import { page } from '../router';
import { useI18n } from '../hooks/useI18n';

const { t } = useI18n();

export const storeRoutes = [
  { path: 'store/pages', breadcrumb: t.breadcrumb.pages, lazy: page(() => import('../pages/store-pages/PagesPage'), 'PagesPage') },
  { path: 'store/pages/:id', breadcrumb: ({ params }) => t.breadcrumb.pageDetail(params.id), lazy: page(() => import('../pages/store-pages/PageEditorPage'), 'PageEditorPage') },
  { path: 'store/templates', breadcrumb: t.breadcrumb.templates, lazy: page(() => import('../pages/templates/TemplatesPage'), 'TemplatesPage') },
  { path: 'store/brand', breadcrumb: t.breadcrumb.brand, lazy: page(() => import('../pages/brand/BrandPage'), 'BrandPage') },
  { path: 'store/domains', breadcrumb: t.breadcrumb.domains, lazy: page(() => import('../pages/domains/DomainsPage'), 'DomainsPage') },
];
