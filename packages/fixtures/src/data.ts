// Apps typecheck this file from their own projects, so the JSON module declaration travels with it.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./json.d.ts" />
import type { AppState } from './store'
import attributes from '../data/attributes.json'
import automations from '../data/automations.json'
import campaigns from '../data/campaigns.json'
import categories from '../data/categories.json'
import collections from '../data/collections.json'
import customerEvents from '../data/customer-events.json'
import customers from '../data/customers.json'
import integrationLogs from '../data/integration-logs.json'
import integrations from '../data/integrations.json'
import leads from '../data/leads.json'
import modifiers from '../data/modifiers.json'
import orders from '../data/orders.json'
import pages from '../data/pages.json'
import paymentTypes from '../data/payment-types.json'
import products from '../data/products.json'
import promotions from '../data/promotions.json'
import searchTerms from '../data/search-terms.json'
import segments from '../data/segments.json'
import sellers from '../data/sellers.json'
import stock from '../data/stock.json'
import stockMoves from '../data/stock-moves.json'
import templates from '../data/templates.json'
import tenants from '../data/tenants.json'
import tickets from '../data/tickets.json'
import traffic from '../data/traffic.json'
import users from '../data/users.json'
import warehouses from '../data/warehouses.json'
import { FIXTURE_NOW } from './clock'

const modifierStock: AppState['modifierStock'] = (modifiers as AppState['modifiers']).flatMap((group) =>
  (warehouses as AppState['warehouses'])
    .filter((warehouse) => warehouse.tenantId === group.tenantId)
    .flatMap((warehouse) =>
      group.options.flatMap((option, index) =>
        option.stockTracked
          ? [
              {
                id: `mstk-${option.id}-${warehouse.id}`,
                tenantId: group.tenantId,
                groupId: group.id,
                optionId: option.id,
                warehouseId: warehouse.id,
                onHand: index === group.options.length - 1 ? 4 : 24 + index * 6,
                reserved: 0,
                safety: 5,
              },
            ]
          : [],
      ),
    ),
)
const modifierStockMoves: AppState['modifierStockMoves'] = modifierStock.map((level) => ({
  id: `mmv-seed-${level.id}`,
  tenantId: level.tenantId,
  groupId: level.groupId,
  optionId: level.optionId,
  warehouseId: level.warehouseId,
  kind: 'receipt',
  qty: level.onHand,
  at: FIXTURE_NOW,
  by: 'system',
  note: 'Opening stock',
}))

const seed = {
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
  stock,
  stockMoves,
  modifierStock,
  modifierStockMoves,
  customers,
  customerEvents,
  orders,
  segments,
  leads,
  tickets,
  campaigns,
  automations,
  promotions,
  paymentTypes,
  integrations,
  integrationLogs,
  traffic,
  searchTerms,
}

/** A fresh, deep copy of the generated seed data (see scripts/generate-fixtures.ts). */
export function seedState(): AppState {
  return structuredClone(seed) as AppState
}
