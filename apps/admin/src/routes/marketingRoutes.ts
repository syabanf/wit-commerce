import type { RouteObject } from 'react-router'
import { t } from '../i18n'
import { type CrumbArgs, page } from './page'
export const marketingRoutes: RouteObject[] = [
  {
    path: 'marketing/campaigns',
    handle: { breadcrumb: t.breadcrumb.campaigns },
    lazy: page(() => import('../pages/campaigns/CampaignsPage'), 'CampaignsPage'),
  },
  {
    path: 'marketing/campaigns/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.campaignDetail(params.id ?? '') },
    lazy: page(() => import('../pages/campaigns/CampaignDetailPage'), 'CampaignDetailPage'),
  },
  {
    path: 'marketing/automations',
    handle: { breadcrumb: t.breadcrumb.automations },
    lazy: page(() => import('../pages/automations/AutomationsPage'), 'AutomationsPage'),
  },
  {
    path: 'marketing/automations/:id',
    handle: { breadcrumb: ({ params }: CrumbArgs) => t.breadcrumb.automationDetail(params.id ?? '') },
    lazy: page(() => import('../pages/automations/AutomationDetailPage'), 'AutomationDetailPage'),
  },
  {
    path: 'marketing/promotions',
    handle: { breadcrumb: t.breadcrumb.promotions },
    lazy: page(() => import('../pages/promotions/PromotionsPage'), 'PromotionsPage'),
  },
]
