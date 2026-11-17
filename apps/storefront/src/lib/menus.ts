import { menuEntries } from '@rc/fixtures'
import { useShop } from '../state/shop'
import { paths } from './paths'

/** A store menu link ready for a Link: `to` is under the store's base, or a full link. */
export interface MenuItem {
  label: string
  to: string
  external: boolean
}

/**
 * The store's own header or footer links that shoppers can follow, in order. An empty list means
 * the store has none, and the theme shows its fixed links.
 */
export function useStoreMenu(which: 'header' | 'footer'): MenuItem[] {
  const { catalog, store } = useShop()
  const base = paths.home(store).replace(/\/$/, '')
  return menuEntries(catalog.tenant.menus?.[which], catalog).map((e) => ({
    label: e.label,
    external: e.external,
    to: e.external ? e.path : e.path === '/' ? paths.home(store) : `${base}${e.path}`,
  }))
}
