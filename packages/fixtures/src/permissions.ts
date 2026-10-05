import type { Role } from '@rc/types'

export type Permission =
  | 'tenant.manage'
  | 'brand.manage'
  | 'store.manage'
  | 'product.manage'
  | 'inventory.manage'
  | 'order.fulfil'
  | 'order.refund'
  | 'customer.manage'
  | 'segment.manage'
  | 'lead.manage'
  | 'ticket.manage'
  | 'campaign.manage'
  | 'automation.manage'
  | 'promotion.manage'
  | 'seller.manage'
  | 'integration.manage'
  | 'analytics.view'

const ALL: Permission[] = [
  'tenant.manage',
  'brand.manage',
  'store.manage',
  'product.manage',
  'inventory.manage',
  'order.fulfil',
  'order.refund',
  'customer.manage',
  'segment.manage',
  'lead.manage',
  'ticket.manage',
  'campaign.manage',
  'automation.manage',
  'promotion.manage',
  'seller.manage',
  'integration.manage',
  'analytics.view',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  platform_admin: ALL,
  tenant_admin: ALL.filter((p) => p !== 'tenant.manage'),
  marketing: [
    'store.manage',
    'segment.manage',
    'campaign.manage',
    'automation.manage',
    'promotion.manage',
    'analytics.view',
  ],
  operations: ['product.manage', 'inventory.manage', 'order.fulfil', 'order.refund', 'analytics.view'],
  service: ['customer.manage', 'ticket.manage', 'order.refund', 'lead.manage'],
  sales: ['lead.manage', 'customer.manage'],
}

export const can = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission)

/** One line per role for the users and roles screen. */
export const ROLE_SUMMARY: Record<Role, string> = {
  platform_admin: 'Creates tenants, owns global templates, feature flags and the app marketplace.',
  tenant_admin: 'Runs one brand: guideline, store, catalog, CRM, campaigns, users and integrations.',
  marketing: 'Builds segments, campaigns, automations, promotions and landing pages.',
  operations: 'Keeps the catalog and stock right, ships orders and handles refunds.',
  service: 'Answers tickets, handles returns and refunds, keeps customer records tidy.',
  sales: 'Works assigned leads and customers and runs a personal storefront.',
}
