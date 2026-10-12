import type { RouteObject } from 'react-router'
import { t } from '../i18n'
import { type CrumbArgs, page } from './page'
export const customersRoutes: RouteObject[] = [
  {
    path: 'customers/all',
    handle: { breadcrumb: t.breadcrumb.allCustomers },
    lazy: page(() => import('../pages/customers/CustomersPage'), 'CustomersPage'),
  },
  {
    path: 'customers/all/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.customerDetail(params.id ?? '') },
    lazy: page(() => import('../pages/customers/CustomerDetailPage'), 'CustomerDetailPage'),
  },
  {
    path: 'customers/segments',
    handle: { breadcrumb: t.breadcrumb.segments },
    lazy: page(() => import('../pages/segments/SegmentsPage'), 'SegmentsPage'),
  },
  {
    path: 'customers/segments/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.segmentDetail(params.id ?? '') },
    lazy: page(() => import('../pages/segments/SegmentDetailPage'), 'SegmentDetailPage'),
  },
  {
    path: 'customers/leads',
    handle: { breadcrumb: t.breadcrumb.leads },
    lazy: page(() => import('../pages/leads/LeadsPage'), 'LeadsPage'),
  },
  {
    path: 'customers/leads/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.leadDetail(params.id ?? '') },
    lazy: page(() => import('../pages/leads/LeadDetailPage'), 'LeadDetailPage'),
  },
  {
    path: 'customers/loyalty',
    handle: { breadcrumb: t.breadcrumb.loyalty },
    lazy: page(() => import('../pages/loyalty/LoyaltyPage'), 'LoyaltyPage'),
  },
  {
    path: 'customers/support',
    handle: { breadcrumb: t.breadcrumb.support },
    lazy: page(() => import('../pages/support/SupportPage'), 'SupportPage'),
  },
]
