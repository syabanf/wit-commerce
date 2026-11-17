import type { BrandLockKey, Category, Collection, MenuLink, Page, Seller, StoreMenus } from '@rc/types'

/** Limits on the copy a seller writes and on a store's menus; the API holds the same numbers. */
export const SELLER_HEADLINE_MAX = 80
export const SELLER_BIO_MAX = 400
export const MENU_LABEL_MAX = 40
export const HEADER_LINKS_MAX = 8
export const FOOTER_LINKS_MAX = 12

const FULL_LINK = /^https?:\/\/\S+$/i
const STORE_PATH = /^\/(?:[^/\s]\S*)?$/

/** A full http or https link, or a store path that starts with one slash. */
export const validLink = (href: string) => FULL_LINK.test(href) || STORE_PATH.test(href)

const chars = (text: string) => [...text].length

// --- seller profile ---

/** The part of a seller record the seller writes themselves. */
export interface SellerProfile {
  headline: string
  bio: string
  photoUrl: string
}

export const sellerProfileOf = (seller: Seller): SellerProfile => ({
  headline: seller.headline,
  bio: seller.bio,
  photoUrl: seller.photoUrl ?? '',
})

export const cleanSellerProfile = (profile: SellerProfile): SellerProfile => ({
  headline: profile.headline.trim(),
  bio: profile.bio.trim(),
  photoUrl: profile.photoUrl.trim(),
})

/**
 * Why a profile cannot be saved, or null. `bound` is true when the brand's locks apply: the seller
 * edits their own profile and does not manage sellers.
 */
export function sellerProfileBlocker(
  seller: Seller,
  profile: SellerProfile,
  locks: Record<BrandLockKey, boolean>,
  bound: boolean,
): string | null {
  if (chars(profile.headline) > SELLER_HEADLINE_MAX) return 'Keep the headline to 80 characters.'
  if (chars(profile.bio) > SELLER_BIO_MAX) return 'Keep the bio to 400 characters.'
  if (profile.photoUrl && !validLink(profile.photoUrl))
    return 'Upload the photo again. Its address is not a valid link.'
  const current = sellerProfileOf(seller)
  if (bound && locks.headline && (profile.headline !== current.headline || profile.bio !== current.bio))
    return 'Your brand team locked the headline and bio.'
  if (bound && locks.hero_image && profile.photoUrl !== current.photoUrl)
    return 'Your brand team locked the photo.'
  return null
}

// --- menus ---

const MENU_KINDS = new Set(['page', 'category', 'collection', 'catalog', 'url'])

/** Labels trimmed, and each target keeps only the field its kind uses. */
export function cleanMenus(menus: StoreMenus): StoreMenus {
  const clean = (links: readonly MenuLink[]): MenuLink[] =>
    links.map(({ label, target }) => ({
      label: label.trim(),
      target:
        target.kind === 'url'
          ? { kind: 'url', url: target.url.trim() }
          : target.kind === 'page' || target.kind === 'category' || target.kind === 'collection'
            ? { kind: target.kind, id: target.id.trim() }
            : { kind: target.kind },
    }))
  return { header: clean(menus.header), footer: clean(menus.footer) }
}

/** Why menus cannot be saved, or null. Reads menus that cleanMenus has been through. */
export function menusBlocker(menus: StoreMenus): string | null {
  if (menus.header.length > HEADER_LINKS_MAX) return 'The header holds up to 8 links.'
  if (menus.footer.length > FOOTER_LINKS_MAX) return 'The footer holds up to 12 links.'
  for (const { label, target } of [...menus.header, ...menus.footer]) {
    if (!label) return 'Give every link a label.'
    if (chars(label) > MENU_LABEL_MAX) return 'Keep link labels to 40 characters.'
    if (!MENU_KINDS.has(target.kind)) return `Choose where the link ${label} goes.`
    if (target.kind === 'url') {
      if (!validLink(target.url))
        return `The link ${label} needs a full https address or a store path that starts with /.`
    } else if (target.kind !== 'catalog' && !target.id) return `Choose where the link ${label} goes.`
  }
  return null
}

/** The pages a menu may link to: the store's own, not a seller's personal page. */
export const isMenuPage = (page: Page) =>
  !page.sellerId && page.kind !== 'product' && page.kind !== 'collection'

/** A menu link as a store shows it: `path` is a store path ("/about", "/c/cat-1") or a full link. */
export interface MenuEntry {
  label: string
  path: string
  external: boolean
}

/**
 * The links of one menu that shoppers can follow, in order. A link to a page that is not published,
 * or to a page, category or collection that no longer exists, is left out. An empty answer means the
 * theme shows its own fixed links.
 */
export function menuEntries(
  links: readonly MenuLink[] | undefined,
  store: {
    pages: readonly Page[]
    categories: readonly Category[]
    collections: readonly Collection[]
  },
): MenuEntry[] {
  const pathOf = ({ target }: MenuLink): string | null => {
    switch (target.kind) {
      case 'catalog':
        return '/search'
      case 'url':
        return validLink(target.url) ? target.url : null
      case 'page': {
        const page = store.pages.find((p) => p.id === target.id && isMenuPage(p) && p.status === 'published')
        return page ? (page.kind === 'home' ? '/' : page.slug) : null
      }
      case 'category':
        return store.categories.some((c) => c.id === target.id) ? `/c/${target.id}` : null
      case 'collection': {
        const collection = store.collections.find((c) => c.id === target.id)
        return collection ? `/collections/${collection.slug}` : null
      }
    }
  }
  return (links ?? []).flatMap((link) => {
    const path = pathOf(link)
    return path === null ? [] : [{ label: link.label, path, external: FULL_LINK.test(path) }]
  })
}
