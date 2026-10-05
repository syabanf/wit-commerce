import type { StorefrontTheme, Tenant } from '@rc/types'
import { STOREFRONT_THEME_LABEL } from '@rc/types'
import { theme1 } from './theme1'
import { theme2 } from './theme2'
import type { ThemeModule } from './types'
import { usePersisted } from '../lib/storage'
import { useShop } from '../state/shop'

/** Theme metadata. Add a theme here and in THEME_MODULES; tenants pick one in brand.theme. */
export const THEMES: Record<StorefrontTheme, { id: StorefrontTheme; name: string }> = {
  theme1: { id: 'theme1', name: STOREFRONT_THEME_LABEL.theme1 },
  theme2: { id: 'theme2', name: STOREFRONT_THEME_LABEL.theme2 },
}

const THEME_MODULES: Record<StorefrontTheme, ThemeModule> = { theme1, theme2 }

export const DEFAULT_THEME: StorefrontTheme = 'theme1'

export const isTheme = (value: string | null | undefined): value is StorefrontTheme =>
  !!value && value in THEMES

/** The theme to render: a preview when one is set, else the tenant's choice, else Theme 1. */
export function themeFor(tenant: Tenant, preview?: StorefrontTheme | null): ThemeModule {
  const id = preview ?? (tenant.brand.theme as StorefrontTheme | undefined)
  return (id && THEME_MODULES[id]) || THEME_MODULES[DEFAULT_THEME]
}

/** The theme on screen and the visit's preview override (`?theme=`), kept per tenant for the session. */
export function useThemeChoice() {
  const { tenant } = useShop()
  const [preview, setPreview] = usePersisted<StorefrontTheme | null>(
    'session',
    `rc.storefront.preview.${tenant.id}`,
    null,
  )
  const valid = isTheme(preview) && preview !== tenant.brand.theme ? preview : null
  return { theme: themeFor(tenant, valid), preview: valid, setPreview }
}

/** The active theme of the store being browsed. */
export const useTheme = () => useThemeChoice().theme
