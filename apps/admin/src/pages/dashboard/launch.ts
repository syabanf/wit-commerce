import { DEFAULT_BRAND_COLORS, sameColors } from '@rc/fixtures'
import type { Page, Tenant } from '@rc/types'

export type LaunchStepKey = 'logo' | 'colors' | 'page' | 'product' | 'email' | 'publish'

export interface LaunchStep {
  key: LaunchStepKey
  label: string
  /** Where the step is done; the email step has no page, its link arrives by email. */
  to?: string
  done: boolean
}

export interface LaunchInput {
  tenant: Pick<Tenant, 'brand' | 'onboarding'>
  pages: readonly Pick<Page, 'kind' | 'status' | 'revisions' | 'publishedAt'>[]
  productCount: number
  /** True while email is on and the signed-in person has not confirmed their address. */
  emailPending: boolean
}

export const EDITOR_PATH = '/store/editor'
export const LOOK_PATH = '/store/brand'
export const PRODUCTS_PATH = '/commerce/products'

/** The storefront opens a store once a home page is published, as the API's storeLive checks. */
export const storeIsLive = (pages: LaunchInput['pages']) =>
  pages.some((p) => p.kind === 'home' && p.status === 'published')

/**
 * The "Get your store live" checklist, from real data. Colours also count as done once the
 * onboarding wizard marked the brand step. A home page counts as edited after any save past the
 * revision it was created with.
 */
export function launchChecklist({ tenant, pages, productCount, emailPending }: LaunchInput) {
  const home = pages.filter((p) => p.kind === 'home')
  const steps: LaunchStep[] = [
    { key: 'logo', label: 'Add your logo', to: LOOK_PATH, done: !!tenant.brand.logoUrl },
    {
      key: 'colors',
      label: 'Pick your colours',
      to: LOOK_PATH,
      done: !sameColors(tenant.brand.colors, DEFAULT_BRAND_COLORS) || tenant.onboarding.includes('brand'),
    },
    {
      key: 'page',
      label: 'Edit your home page',
      to: EDITOR_PATH,
      done: home.some((p) => p.revisions.length > 1 || p.publishedAt !== null),
    },
    { key: 'product', label: 'Add your first product', to: PRODUCTS_PATH, done: productCount > 0 },
  ]
  if (emailPending) steps.push({ key: 'email', label: 'Confirm your email', done: false })
  const live = storeIsLive(pages)
  steps.push({ key: 'publish', label: 'Publish', to: EDITOR_PATH, done: live })
  const done = steps.filter((s) => s.done).length
  return { steps, done, total: steps.length, live }
}
