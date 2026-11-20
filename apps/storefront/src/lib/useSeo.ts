import type { Product } from '@rc/types'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useShop } from '../state/shop'
import { categoryPath, productAvailable } from './catalog'
import { HOST_STORE, STORE_ROOT } from './host'
import { absoluteUrl, canonicalOrigin, productJsonLd } from './seo'

/** Sets a <meta> by property or name, adding it once. */
export function setMeta(key: string, content: string) {
  const attr = key.startsWith('og:') ? 'property' : 'name'
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

/** The page's address on the store's canonical origin, without its query. */
export function useCanonicalUrl(): string {
  const { tenant, store } = useShop()
  const { pathname } = useLocation()
  // Path mode routes start with /{store}; a store host routes from the root.
  const path = HOST_STORE ? pathname : pathname.slice(store.length + 1) || '/'
  const pathOrigin = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/${store}`
  return canonicalOrigin(tenant, STORE_ROOT, pathOrigin) + path
}

/** Canonical link and Open Graph tags every store page carries. Product pages add their own on top. */
export function useStoreSeo() {
  const { tenant } = useShop()
  const url = useCanonicalUrl()
  useEffect(() => {
    setCanonical(url)
    setMeta('og:url', url)
    setMeta('og:site_name', tenant.name)
    setMeta('og:type', 'website')
    setMeta('description', tenant.brand.tagline)
    setMeta('og:description', tenant.brand.tagline)
    if (tenant.brand.logoUrl) setMeta('og:image', absoluteUrl(tenant.brand.logoUrl, window.location.origin))
  }, [url, tenant])
}

/** A product page's Open Graph tags and schema.org Product data, removed when the page closes. */
export function useProductSeo(product: Product) {
  const { catalog, tenant } = useShop()
  const url = useCanonicalUrl()
  const available = productAvailable(catalog, product)
  const category = categoryPath(catalog, product.categoryId).at(-1)?.name
  useEffect(() => {
    const image = product.imageUrl ? absoluteUrl(product.imageUrl, window.location.origin) : undefined
    const description = product.description || tenant.brand.tagline
    setMeta('og:type', 'product')
    setMeta('description', description)
    setMeta('og:description', description)
    if (image) setMeta('og:image', image)
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(
      productJsonLd({ product, brand: tenant.name, category, url, image, available }),
    ).replace(/</g, '\\u003c')
    document.head.appendChild(script)
    return () => {
      script.remove()
      if (image) document.head.querySelector('meta[property="og:image"]')?.remove()
      setMeta('og:type', 'website')
      setMeta('description', tenant.brand.tagline)
      setMeta('og:description', tenant.brand.tagline)
    }
  }, [product, tenant, category, url, available])
}
