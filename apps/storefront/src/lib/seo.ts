import { customDomain, subdomainOrigin } from '@rc/fixtures'
import type { Product, Tenant } from '@rc/types'

type StoreTenant = Pick<Tenant, 'subdomain' | 'domain' | 'domainVerified' | 'domainVerifiedAt'>

/**
 * Where search engines should index a store, as the API's sitemap does: its verified custom domain,
 * else its own host under the store root, else its path on this site (`pathOrigin`, such as
 * https://commerce.reddie.id/shop/lari).
 */
export function canonicalOrigin(tenant: StoreTenant, root: string | null, pathOrigin: string): string {
  const custom = customDomain(tenant)
  if (custom) return `https://${custom}`
  return root ? subdomainOrigin(tenant, root) : pathOrigin
}

/** A URL the page names (an uploaded image) made absolute against the page's own origin. */
export const absoluteUrl = (url: string, origin: string) => new URL(url, origin).toString()

/**
 * schema.org Product for a product page: name, SKU, brand, image, rating, and an offer in rupiah (one
 * price, or the range over variants). Talk-to-sales products carry no offer, since they have no price.
 */
export function productJsonLd(input: {
  product: Pick<
    Product,
    'name' | 'code' | 'description' | 'price' | 'variants' | 'assisted' | 'rating' | 'reviewCount'
  >
  brand: string
  category?: string
  url: string
  image?: string
  /** Units a shopper can buy now; null means no stock limit. */
  available: number | null
}): Record<string, unknown> {
  const { product, url, image, available } = input
  const prices = product.variants.length ? product.variants.map((v) => v.price) : [product.price]
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const availability = `https://schema.org/${available === null || available > 0 ? 'InStock' : 'OutOfStock'}`
  const offers = product.assisted
    ? undefined
    : low === high
      ? { '@type': 'Offer', url, priceCurrency: 'IDR', price: low, availability }
      : {
          '@type': 'AggregateOffer',
          url,
          priceCurrency: 'IDR',
          lowPrice: low,
          highPrice: high,
          offerCount: prices.length,
          availability,
        }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.code,
    ...(product.description ? { description: product.description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(input.category ? { category: input.category } : {}),
    brand: { '@type': 'Brand', name: input.brand },
    url,
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
    ...(offers ? { offers } : {}),
  }
}
