import type { Integration, IntegrationLog, SearchTerm } from '../../packages/types/src/index.ts'
import { MINUTE, toIso } from '../../packages/fixtures/src/dates.ts'
import { NOW } from './master.ts'
import { rng } from './rng.ts'

type Spec = Omit<Integration, 'id' | 'tenantId' | 'lastSyncAt'> & { minutesAgo: number | null }

const BASE: Record<string, Spec> = {
  midtrans: {
    provider: 'Midtrans',
    category: 'payment',
    health: 'connected',
    enabled: true,
    endpoint: 'https://api.midtrans.com/v2',
    events24h: 0,
    errors24h: 0,
    note: 'QRIS, VA, cards and e-wallets.',
    minutesAgo: 2,
  },
  xendit: {
    provider: 'Xendit',
    category: 'payment',
    health: 'off',
    enabled: false,
    endpoint: 'https://api.xendit.co',
    events24h: 0,
    errors24h: 0,
    note: 'Backup gateway for PayLater.',
    minutesAgo: null,
  },
  jne: {
    provider: 'JNE',
    category: 'logistics',
    health: 'connected',
    enabled: true,
    endpoint: 'https://apiv2.jne.co.id',
    events24h: 0,
    errors24h: 0,
    note: 'Rates, labels and tracking.',
    minutesAgo: 6,
  },
  sicepat: {
    provider: 'SiCepat',
    category: 'logistics',
    health: 'connected',
    enabled: true,
    endpoint: 'https://api.sicepat.com',
    events24h: 0,
    errors24h: 1,
    note: 'Rates, labels and tracking.',
    minutesAgo: 9,
  },
  gosend: {
    provider: 'GoSend',
    category: 'logistics',
    health: 'degraded',
    enabled: true,
    endpoint: 'https://kilat-api.gojekapi.com',
    events24h: 0,
    errors24h: 14,
    note: 'Instant booking times out at peak hours.',
    minutesAgo: 22,
  },
  accurate: {
    provider: 'Accurate Online',
    category: 'enterprise',
    health: 'connected',
    enabled: true,
    endpoint: 'https://public.accurate.id/api',
    events24h: 0,
    errors24h: 0,
    note: 'Invoices and stock sync every 15 minutes.',
    minutesAgo: 11,
  },
  pos: {
    provider: 'Store POS',
    category: 'enterprise',
    health: 'connected',
    enabled: true,
    endpoint: 'https://pos.internal/api',
    events24h: 0,
    errors24h: 0,
    note: 'Senayan and Kemang stores.',
    minutesAgo: 4,
  },
  wa: {
    provider: 'WhatsApp Business',
    category: 'marketing',
    health: 'connected',
    enabled: true,
    endpoint: 'https://graph.facebook.com/v21.0',
    events24h: 0,
    errors24h: 2,
    note: 'Templates for orders, carts and campaigns.',
    minutesAgo: 1,
  },
  email: {
    provider: 'Email (SMTP relay)',
    category: 'marketing',
    health: 'connected',
    enabled: true,
    endpoint: 'smtp://relay.commerceos.id',
    events24h: 0,
    errors24h: 0,
    note: 'Campaign and transactional email.',
    minutesAgo: 3,
  },
  tokopedia: {
    provider: 'Tokopedia',
    category: 'marketplace',
    health: 'failing',
    enabled: true,
    endpoint: 'https://fs.tokopedia.net',
    events24h: 0,
    errors24h: 61,
    note: 'Access token expired. Reconnect the shop to resume order import.',
    minutesAgo: 340,
  },
  shopee: {
    provider: 'Shopee',
    category: 'marketplace',
    health: 'connected',
    enabled: true,
    endpoint: 'https://partner.shopeemobile.com/api/v2',
    events24h: 0,
    errors24h: 0,
    note: 'Orders and stock every 5 minutes.',
    minutesAgo: 5,
  },
}

const PER_TENANT: Record<string, string[]> = {
  'ten-lari': [
    'midtrans',
    'xendit',
    'jne',
    'sicepat',
    'gosend',
    'accurate',
    'pos',
    'wa',
    'email',
    'tokopedia',
    'shopee',
  ],
  'ten-aruna': ['midtrans', 'jne', 'sicepat', 'accurate', 'wa', 'email', 'shopee'],
  'ten-teknika': ['midtrans', 'accurate', 'email'],
}

export const integrations: Integration[] = Object.entries(PER_TENANT).flatMap(([tenantId, keys]) =>
  keys.map((key) => {
    const { minutesAgo, ...spec } = BASE[key]!
    return {
      ...spec,
      id: `int-${tenantId.slice(4)}-${key}`,
      tenantId,
      events24h: spec.enabled
        ? rng.int(tenantId === 'ten-teknika' ? 10 : 120, tenantId === 'ten-teknika' ? 60 : 1800)
        : 0,
      lastSyncAt: minutesAgo === null ? null : toIso(NOW - minutesAgo * MINUTE),
    }
  }),
)

const LOG_SHAPES: Record<string, [IntegrationLog['direction'], string, string, string][]> = {
  payment: [
    ['inbound', 'order.paid', '/webhooks/midtrans', 'Payment settled by QRIS'],
    ['outbound', 'charge.create', '/v2/charge', 'Virtual account issued'],
  ],
  logistics: [
    ['outbound', 'shipment.create', '/tracing/api/generatecnote', 'Label created'],
    ['inbound', 'order.shipped', '/webhooks/tracking', 'Picked up by courier'],
  ],
  enterprise: [
    ['outbound', 'invoice.create', '/sales-invoice/save.do', 'Invoice posted'],
    ['inbound', 'inventory.updated', '/webhooks/stock', 'Stock synced'],
  ],
  marketing: [
    ['outbound', 'message.send', '/messages', 'Template message sent'],
    ['inbound', 'message.status', '/webhooks/wa', 'Message read'],
  ],
  marketplace: [
    ['inbound', 'order.created', '/v2/order/get_order_list', 'Order imported'],
    ['outbound', 'inventory.updated', '/v2/product/update_stock', 'Stock pushed'],
  ],
}

export const integrationLogs: IntegrationLog[] = integrations
  .filter((i) => i.enabled)
  .flatMap((i) =>
    Array.from({ length: i.tenantId === 'ten-lari' ? 8 : 3 }, (_, n) => {
      const [direction, event, path, summary] = rng.pick(LOG_SHAPES[i.category]!)
      const failing = i.health === 'failing' || (i.health === 'degraded' && rng.chance(0.4))
      return {
        id: `log-${i.id}-${n}`,
        tenantId: i.tenantId,
        integrationId: i.id,
        at: toIso(NOW - rng.int(1, 600) * MINUTE),
        direction,
        event,
        path,
        ok: !failing,
        ms: failing ? rng.int(5000, 30000) : rng.int(80, 900),
        summary: failing
          ? i.health === 'failing'
            ? '401 Unauthorized: token expired'
            : '504 Gateway timeout'
          : summary,
      }
    }),
  )
  .sort((a, b) => (a.at < b.at ? 1 : -1))

export const searchTerms: SearchTerm[] = [
  ['ten-lari', 'sepatu lari 10k', 412, 18],
  ['ten-lari', 'carbon plate', 266, 3],
  ['ten-lari', 'wide fit', 141, 0],
  ['ten-lari', 'sepatu lari wanita', 128, 22],
  ['ten-lari', 'kaos kaki compression', 96, 1],
  ['ten-lari', 'ultra trail', 88, 0],
  ['ten-lari', 'jam gps murah', 61, 0],
  ['ten-lari', 'hydration vest', 54, 1],
  ['ten-aruna', 'serum jerawat', 233, 0],
  ['ten-aruna', 'sunscreen', 410, 2],
  ['ten-aruna', 'parfum melati', 77, 1],
  ['ten-aruna', 'retinol', 90, 0],
].map(([tenantId, term, count30d, results], i) => ({
  id: `srch-${i + 1}`,
  tenantId: tenantId as string,
  term: term as string,
  count30d: count30d as number,
  results: results as number,
}))
