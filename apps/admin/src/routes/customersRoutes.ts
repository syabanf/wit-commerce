// apps/admin/src/routes/customersRoutes.ts
import { page } from '../router';
import { useI18n } from '../hooks/useI18n';

const { t } = useI18n();

export const customersRoutes = [
  { path: 'customers/all', breadcrumb: t.breadcrumb.allCustomers, lazy: page(() => import('../pages/customers/CustomersPage'), 'CustomersPage') },
  { path: 'customers/all/:id', breadcrumb: ({ params }) => t.breadcrumb.customerDetail(params.id), lazy: page(() => import('../pages/customers/CustomerDetailPage'), 'CustomerDetailPage') },
  { path: 'customers/segments', breadcrumb: t.breadcrumb.segments, lazy: page(() => import('../pages/segments/SegmentsPage'), 'SegmentsPage') },
  { path: 'customers/segments/:id', breadcrumb: ({ params }) => t.breadcrumb.segmentDetail(params.id), lazy: page(() => import('../pages/segments/SegmentDetailPage'), 'SegmentDetailPage') },
  { path: 'customers/leads', breadcrumb: t.breadcrumb.leads, lazy: page(() => import('../pages/leads/LeadsPage'), 'LeadsPage') },
  { path: 'customers/leads/:id', breadcrumb: ({ params }) => t.breadcrumb.leadDetail(params.id), lazy: page(() => import('../pages/leads/LeadDetailPage'), 'LeadDetailPage') },
  { path: 'customers/loyalty', breadcrumb: t.breadcrumb.loyalty, lazy: page(() => import('../pages/loyalty/LoyaltyPage'), 'LoyaltyPage') },
  { path: 'customers/support', breadcrumb: t.breadcrumb.support, lazy: page(() => import('../pages/support/SupportPage'), 'SupportPage') },
];
