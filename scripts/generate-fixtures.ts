// Seeded, deterministic fixture generator. Writes JSON into packages/fixtures/data.
// Run with: pnpm gen:fixtures
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { categories, collections, popularity, products } from './seed/catalog.ts'
import { attributes, fillAttributes, modifiers } from './seed/catalog-setup.ts'
import { buildCommerce } from './seed/commerce.ts'
import {
  automations,
  buildCampaigns,
  buildTickets,
  finishGrowth,
  leads,
  promotions,
  segments,
} from './seed/growth.ts'
import { buildSellers, templates, tenants, users, warehouses } from './seed/master.ts'
import { paymentTypes } from './seed/payments.ts'
import { integrationLogs, integrations, searchTerms } from './seed/platform.ts'
import { buildPages } from './seed/storefront.ts'

// Each seller features the tenant's best sellers, rotated so pages differ.
const sellers = buildSellers((tenantId, index) => {
  const ranked = products
    .filter((p) => p.tenantId === tenantId && p.status === 'active' && (popularity.get(p.id) ?? 0) > 0)
    .sort((a, b) => popularity.get(b.id)! - popularity.get(a.id)!)
  return Array.from({ length: 4 }, (_, k) => ranked[(index * 2 + k) % ranked.length]!.id)
})

fillAttributes(products, (id) => categories.find((c) => c.id === id)?.parentId ?? null)
const commerce = buildCommerce(tenants, sellers)
const tickets = buildTickets(commerce.orders, commerce.events)
const campaigns = buildCampaigns(commerce.orders, commerce.customers, commerce.events)
finishGrowth(commerce.orders)
const pages = buildPages(sellers)
for (const p of pages) {
  if (p.sellerId)
    p.views30d = commerce.traffic
      .filter((t) => t.sellerId === p.sellerId)
      .slice(-30)
      .reduce((s, t) => s + t.pageViews, 0)
}
commerce.events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

const files: Record<string, unknown> = {
  tenants,
  users,
  sellers,
  templates,
  pages,
  categories,
  attributes,
  modifiers,
  collections,
  products,
  warehouses,
  stock: commerce.stock,
  'stock-moves': commerce.stockMoves,
  customers: commerce.customers,
  'customer-events': commerce.events,
  orders: commerce.orders,
  segments,
  leads,
  tickets,
  campaigns,
  automations,
  promotions,
  'payment-types': paymentTypes,
  integrations,
  'integration-logs': integrationLogs,
  traffic: commerce.traffic,
  'search-terms': searchTerms,
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '../packages/fixtures/data')
mkdirSync(dir, { recursive: true })
for (const [name, value] of Object.entries(files)) {
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(value)}\n`)
}
console.log(
  Object.entries(files)
    .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.length : 1}`)
    .join('\n'),
)
