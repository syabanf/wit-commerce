import type { TenantPlan } from '@rc/types'

/** What one plan allows. The keys match the API's limit keys. */
export interface PlanLimits {
  products: number
  staff: number
  sellers: number
  warehouses: number
  assistantPerDay: number
  currencies: number
  mediaMb: number
}

export type PlanLimitKey = keyof PlanLimits

export interface PlanDefinition {
  id: TenantPlan
  name: string
  /** Rupiah a month; 0 means free, and the plan gets no invoices. */
  price: number
  limits: PlanLimits
}

export const PLAN_IDS: TenantPlan[] = ['starter', 'growth', 'enterprise']

/**
 * The plans a fresh installation starts with. A platform admin changes prices and limits in
 * Settings, Plans; the API keeps those overrides. billing.Defaults in apps/api mirrors this table,
 * and a Go test compares the two.
 */
export const PLAN_DEFAULTS: Record<TenantPlan, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 0,
    limits: {
      products: 50,
      staff: 3,
      sellers: 5,
      warehouses: 1,
      assistantPerDay: 50,
      currencies: 2,
      mediaMb: 500,
    },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 750_000,
    limits: {
      products: 500,
      staff: 15,
      sellers: 25,
      warehouses: 3,
      assistantPerDay: 500,
      currencies: 5,
      mediaMb: 5_000,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 3_500_000,
    limits: {
      products: 5_000,
      staff: 100,
      sellers: 200,
      warehouses: 20,
      assistantPerDay: 2_000,
      currencies: 9,
      mediaMb: 50_000,
    },
  },
}

/** The limits in the order the console lists them. */
export const PLAN_LIMIT_KEYS: PlanLimitKey[] = [
  'products',
  'staff',
  'sellers',
  'warehouses',
  'assistantPerDay',
  'currencies',
  'mediaMb',
]

export const PLAN_LIMIT_LABEL: Record<PlanLimitKey, string> = {
  products: 'Products',
  staff: 'Staff accounts',
  sellers: 'Sellers',
  warehouses: 'Warehouses',
  assistantPerDay: 'Assistant questions a day',
  currencies: 'Display currencies',
  mediaMb: 'Media storage (MB)',
}

/** The plan after this one, or null on the largest. */
export const nextPlan = (plan: TenantPlan): TenantPlan | null => PLAN_IDS[PLAN_IDS.indexOf(plan) + 1] ?? null

/** Share of a limit in use, 0 to 1; a limit of 0 reads as full. */
export const planUsageShare = (used: number, limit: number) => (limit <= 0 ? 1 : Math.min(1, used / limit))
