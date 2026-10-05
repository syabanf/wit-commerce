import type { IntegrationCategory, Tenant, WebhookEvent } from '@rc/types'

export const CATEGORY_ORDER: IntegrationCategory[] = [
  'payment',
  'logistics',
  'enterprise',
  'marketing',
  'marketplace',
]

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'order.created',
  'order.paid',
  'order.shipped',
  'customer.created',
  'customer.updated',
  'product.updated',
  'inventory.updated',
]

/** Sync is a request to the provider; the demo resolves it after this delay. */
export const SYNC_DELAY_MS = 600

export const apiBaseUrl = (tenant: Pick<Tenant, 'subdomain'>) =>
  `https://api.commerceos.id/v1/stores/${tenant.subdomain}`
