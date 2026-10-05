import type { SortKey } from './catalog'

/** Every storefront URL, built from the tenant subdomain. */
export const paths = {
  chooser: () => '/',
  home: (store: string) => `/${store}`,
  category: (store: string, id: string) => `/${store}/c/${id}`,
  product: (store: string, id: string) => `/${store}/p/${id}`,
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
    return `/${store}/search${qs ? `?${qs}` : ''}`
  },
  cart: (store: string) => `/${store}/cart`,
  checkout: (store: string) => `/${store}/checkout`,
  order: (store: string, id: string) => `/${store}/order/${id}`,
  collection: (store: string, slug: string) => `/${store}/collections/${slug}`,
  account: (store: string) => `/${store}/account`,
  wishlist: (store: string) => `/${store}/wishlist`,
  seller: (store: string, slug: string) => `/${store}/${slug}`,
}

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
