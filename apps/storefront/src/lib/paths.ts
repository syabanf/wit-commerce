import type { SortKey } from './catalog'
import { HOST_STORE } from './host'

/**
 * Every storefront URL. A store host serves its store at the root ("/p/1"); a single host serves each
 * store under its subdomain ("/lari/p/1"). `hostMode` picks one, and `store` is ignored on a store host.
 */
export function makePaths(hostMode: boolean) {
  const base = (store: string) => (hostMode ? '' : `/${store}`)
  return {
    chooser: () => '/',
    home: (store: string) => base(store) || '/',
    category: (store: string, id: string) => `${base(store)}/c/${id}`,
    product: (store: string, id: string) => `${base(store)}/p/${id}`,
    search: (
      store: string,
      q = '',
      extra: { cat?: string; sort?: SortKey; deals?: boolean; gifts?: boolean } = {},
    ) => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (extra.cat) params.set('cat', extra.cat)
      if (extra.sort) params.set('sort', extra.sort)
      if (extra.deals) params.set('deals', '1')
      if (extra.gifts) params.set('gifts', '1')
      const qs = params.toString()
      return `${base(store)}/search${qs ? `?${qs}` : ''}`
    },
    cart: (store: string) => `${base(store)}/cart`,
    checkout: (store: string) => `${base(store)}/checkout`,
    order: (store: string, id: string) => `${base(store)}/order/${id}`,
    collection: (store: string, slug: string) => `${base(store)}/collections/${slug}`,
    account: (store: string) => `${base(store)}/account`,
    wishlist: (store: string) => `${base(store)}/wishlist`,
    agent: (store: string) => `${base(store)}/agent`,
    seller: (store: string, slug: string) => `${base(store)}/${slug}`,
  }
}

export const paths = makePaths(HOST_STORE !== null)

/** Route segments a seller slug may not take, so personal stores never shadow them. */
export const RESERVED_SEGMENTS = new Set([
  'c',
  'p',
  'search',
  'cart',
  'checkout',
  'order',
  'account',
  'wishlist',
  'collections',
  'preview',
  'agent',
])

/** "6281210002001" from "+62 812 1000 2001", for wa.me links. */
export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`

/** "Fahmi" from "Fahmi Rahman"; company names keep their first real word ("Presisi" from "PT Presisi Logam"). */
export const firstName = (name: string) =>
  name
    .trim()
    .replace(/^(PT|CV|UD)\.?\s+/i, '')
    .split(/\s+/)[0] ?? name
