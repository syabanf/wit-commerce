// apps/admin/src/routes/marketingRoutes.ts
import { page } from '../router';
import { useI18n } from '../hooks/useI18n';

const { t } = useI18n();

export const marketingRoutes = [
  { path: 'marketing/campaigns', breadcrumb: t.breadcrumb.campaigns, lazy: page(() => import('../pages/campaigns/CampaignsPage'), 'CampaignsPage') },
  { path: 'marketing/campaigns/:id', breadcrumb: ({ params }) => t.breadcrumb.campaignDetail(params.id), lazy: page(() => import('../pages/campaigns/CampaignDetailPage'), 'CampaignDetailPage') },
  { path: 'marketing/automations', breadcrumb: t.breadcrumb.automations, lazy: page(() => import('../pages/automations/AutomationsPage'), 'AutomationsPage') },
  { path: 'marketing/automations/:id', breadcrumb: ({ params }) => t.breadcrumb.automationDetail(params.id), lazy: page(() => import('../pages/automations/AutomationDetailPage'), 'AutomationDetailPage') },
  { path: 'marketing/promotions', breadcrumb: t.breadcrumb.promotions, lazy: page(() => import('../pages/promotions/PromotionsPage'), 'PromotionsPage') },
];
