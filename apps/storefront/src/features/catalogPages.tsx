import { attributesFor, lookFor, nowMs } from '@rc/fixtures'
import type { AttributeDef, Category, Collection, Product } from '@rc/types'
import { Heart, PackageSearch } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'
import { NotFound } from '../components/NotFound'
import { sellerPromotion } from '../components/sections'
import { TemplateLookProvider } from '../components/templateLook'
import { SearchSuggestions } from '../components/shell'
import { Button, ButtonLink, EmptyState } from '../components/ui'
import {
  categoryIdsUnder,
  collectionItems,
  compareAtPct,
  featuredCollections,
  giftable,
  isSortKey,
  matchesQuery,
  productsIn,
  promoFor,
  SORT_LABEL,
} from '../lib/catalog'
import { EMBED, usePreviewPageId } from '../lib/embed'
import { RESERVED_SEGMENTS, paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'
import { useTheme } from '../themes/registry'
import type { ListingChip } from '../themes/types'
import { useCartView } from './cartView'
import { useHomeData } from './home'
import { type ListingState, useListing } from './listing'
import { useProductDetail } from './product'

export function HomePage() {
  const theme = useTheme()
  const data = useHomeData()
  useTitle(`${useShop().tenant.name} · ${useShop().tenant.brand.tagline}`)
  return (
    <TemplateLookProvider templateId={data.page?.templateId}>
      <theme.Home data={data} />
    </TemplateLookProvider>
  )
}

function NoResults({ listing }: { listing: ListingState }) {
  const { store } = useShop()
  return listing.activeCount ? (
    <EmptyState
      icon={<PackageSearch aria-hidden="true" />}
      title="No products match these filters"
      text="Remove a filter or two to see more products."
      action={
        <Button variant="dark" onClick={listing.clear}>
          Clear all filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<PackageSearch aria-hidden="true" />}
      title="Nothing here yet"
      text="New products land here soon. Browse the rest of the store in the meantime."
      action={<ButtonLink to={paths.search(store)}>Browse all products</ButtonLink>}
    />
  )
}

// --- category ---

function CategoryListing({ category }: { category: Category }) {
  const theme = useTheme()
  const { catalog, store } = useShop()
  const top = (category.parentId && catalog.categoryMap.get(category.parentId)) || category
  const products = useMemo(() => productsIn(catalog, category.id), [catalog, category.id])
  const defs = useMemo(
    () => attributesFor(category.id, catalog.attributes, catalog.categories),
    [catalog, category.id],
  )
  const listing = useListing(products, defs)
  useTitle(`${category.name} · ${catalog.tenant.name}`)
  const subs = catalog.childrenOf.get(top.id) ?? []
  const chips: ListingChip[] = subs.length
    ? [
        {
          label: 'All',
          to: paths.category(store, top.id),
          active: category.id === top.id,
          count: productsIn(catalog, top.id).length,
        },
        ...subs.map((s) => ({
          label: s.name,
          to: paths.category(store, s.id),
          active: s.id === category.id,
          count: productsIn(catalog, s.id).length,
        })),
      ]
    : []
  return (
    <theme.Listing
      title={category.name}
      description={category.description}
      crumbs={[
        { label: 'Home', to: paths.home(store) },
        ...(top.id !== category.id ? [{ label: top.name, to: paths.category(store, top.id) }] : []),
        { label: category.name, to: paths.category(store, category.id) },
      ]}
      chips={chips}
      listing={listing}
      empty={<NoResults listing={listing} />}
    />
  )
}

export function CategoryPage() {
  const { categoryId = '' } = useParams()
  const { catalog } = useShop()
  const category = catalog.categoryMap.get(categoryId)
  if (!category) return <NotFound title="We could not find that category" />
  return <CategoryListing key={category.id} category={category} />
}

// --- collection ---

/** Filterable attributes that at least one listed product carries. */
const defsOn = (products: readonly Product[], defs: readonly AttributeDef[]) =>
  defs.filter((d) => products.some((p) => p.attributes[d.id]))

function CollectionListing({ collection }: { collection: Collection }) {
  const theme = useTheme()
  const { catalog, store } = useShop()
  const products = useMemo(() => collectionItems(catalog, collection), [catalog, collection])
  const defs = useMemo(() => defsOn(products, catalog.attributes), [products, catalog.attributes])
  const listing = useListing(products, defs)
  useTitle(`${collection.name} · ${catalog.tenant.name}`)
  const others = featuredCollections(catalog)
  const chips: ListingChip[] = (
    others.some((c) => c.id === collection.id) ? others : [collection, ...others]
  ).map((c) => ({
    label: c.name,
    to: paths.collection(store, c.slug),
    active: c.id === collection.id,
  }))
  return (
    <theme.Listing
      title={collection.name}
      description={collection.description}
      crumbs={[{ label: 'Home', to: paths.home(store) }]}
      chips={chips}
      listing={listing}
      empty={<NoResults listing={listing} />}
    />
  )
}

export function CollectionPage() {
  const { slug = '' } = useParams()
  const { catalog } = useShop()
  const collection = catalog.collections.find((c) => c.slug === slug)
  if (!collection) return <NotFound title="We could not find that collection" />
  return <CollectionListing key={collection.id} collection={collection} />
}

// --- search ---

function SearchListing() {
  const theme = useTheme()
  const { catalog, store } = useShop()
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const cat = params.get('cat') ?? ''
  const sortParam = params.get('sort')
  const deals = params.get('deals') === '1'
  const gifts = params.get('gifts') === '1'
  const products = useMemo(() => {
    const now = nowMs()
    const within = cat && catalog.categoryMap.has(cat) ? categoryIdsUnder(catalog, cat) : null
    return catalog.products.filter(
      (p) =>
        matchesQuery(catalog, p, q) &&
        (!within || within.has(p.categoryId)) &&
        (!deals || !!compareAtPct(p) || !!promoFor(catalog, p, now)) &&
        (!gifts || giftable(catalog, p)),
    )
  }, [catalog, q, cat, deals, gifts])
  const defs = useMemo(
    () => (cat ? attributesFor(cat, catalog.attributes, catalog.categories) : []),
    [cat, catalog],
  )
  const listing = useListing(products, defs, isSortKey(sortParam) ? sortParam : q ? 'featured' : 'best')
  const title = q
    ? `Results for "${q}"`
    : deals
      ? 'Hot offers'
      : gifts
        ? 'Gift ideas'
        : isSortKey(sortParam) && sortParam !== 'featured'
          ? SORT_LABEL[sortParam]
          : 'All products'
  useTitle(`${title} · ${catalog.tenant.name}`)
  const all: ListingChip = { label: 'All', to: paths.search(store, q), active: !cat }
  const chips: ListingChip[] = [
    all,
    ...catalog.topCategories.map((c) => ({
      label: c.name,
      to: paths.search(store, q, { cat: c.id }),
      active: cat === c.id,
      count: catalog.products.filter(
        (p) => matchesQuery(catalog, p, q) && categoryIdsUnder(catalog, c.id).has(p.categoryId),
      ).length,
    })),
  ].filter((c) => c.active || c.count !== 0)
  return (
    <theme.Listing
      title={title}
      crumbs={[{ label: 'Home', to: paths.home(store) }]}
      chips={chips}
      listing={listing}
      query={q}
      empty={q && !listing.activeCount ? <SearchSuggestions query={q} /> : <NoResults listing={listing} />}
    />
  )
}

export function SearchPage() {
  const { search } = useLocation()
  return <SearchListing key={search} />
}

// --- product ---

function ProductView({ product }: { product: Product }) {
  const theme = useTheme()
  const detail = useProductDetail(product)
  useTitle(`${product.name} · ${useShop().tenant.name}`)
  return <theme.Product detail={detail} />
}

export function ProductPage() {
  const { productId = '' } = useParams()
  const { catalog } = useShop()
  const product = catalog.productMap.get(productId)
  if (!product || product.status !== 'active')
    return (
      <NotFound
        title="This product is not on sale"
        text="It may have sold out for good or moved. Search the store for something similar."
      />
    )
  return <ProductView key={product.id} product={product} />
}

// --- cart and wishlist ---

export function CartPage() {
  const theme = useTheme()
  const view = useCartView()
  useTitle(`Cart · ${useShop().tenant.name}`)
  return <theme.Cart view={view} />
}

export function WishlistPage() {
  const theme = useTheme()
  const { wishlist, catalog, store } = useShop()
  useTitle(`Wishlist · ${catalog.tenant.name}`)
  const products = wishlist.ids
    .map((id) => catalog.productMap.get(id))
    .filter((p): p is Product => !!p && p.status === 'active')
  return (
    <div className="space-y-6">
      <h1 className="sf-display text-3xl font-bold md:text-4xl">Wishlist</h1>
      {products.length ? (
        <theme.ProductGrid products={products} />
      ) : (
        <EmptyState
          icon={<Heart aria-hidden="true" />}
          title="Nothing saved yet"
          text="Tap the heart on any product to keep it here for later."
          action={<ButtonLink to={paths.search(store, '', { sort: 'best' })}>See best sellers</ButtonLink>}
        />
      )}
    </div>
  )
}

// --- personal store ---

export function PersonalStorePage() {
  const theme = useTheme()
  const { sellerSlug = '' } = useParams()
  const { catalog, setReferral } = useShop()
  const previewId = usePreviewPageId()
  const slug = sellerSlug.toLowerCase()
  const seller = RESERVED_SEGMENTS.has(slug)
    ? undefined
    : catalog.sellers.find((s) => s.slug === slug && (s.status === 'active' || !!previewId))
  const own = seller ? catalog.pages.filter((p) => p.kind === 'personal' && p.sellerId === seller.id) : []
  const page = own.find((p) => p.id === previewId) ?? own.find((p) => p.status === 'published')
  useTitle(seller ? `${seller.name} · ${catalog.tenant.name}` : catalog.tenant.name)
  useEffect(() => {
    if (seller && page) setReferral(seller.id)
  }, [seller, page, setReferral])
  if (!seller || !page)
    return (
      <NotFound
        title="This page is not open"
        text="The store you are looking for is not published yet, or the link has a typo."
      />
    )
  const visible = page.sections.filter((s) => !s.hidden && s.kind !== 'footer')
  // A seller's own code shows even when their template has no promotion section.
  const promo = sellerPromotion(catalog, seller)
  const sections =
    promo && !visible.some((s) => s.kind === 'promotion')
      ? [
          ...visible.slice(0, 1),
          {
            id: `${page.id}-promo`,
            kind: 'promotion' as const,
            rule: 'optional' as const,
            hidden: false,
            headline: promo.code,
            body: promo.name,
            productIds: [],
            ctaLabel: '',
          },
          ...visible.slice(1),
        ]
      : visible
  return (
    <TemplateLookProvider templateId={page.templateId}>
      <theme.Sections sections={sections} seller={seller} />
    </TemplateLookProvider>
  )
}

export function StoreNotFoundPage() {
  useTitle(`Page not found · ${useShop().tenant.name}`)
  return <NotFound />
}

/** `/:store/preview/:pageId`, embed only: any page the admin is editing, in the store's theme. */
export function PagePreviewPage() {
  const theme = useTheme()
  const { pageId = '' } = useParams()
  const { catalog } = useShop()
  const page = EMBED ? catalog.pages.find((p) => p.id === pageId) : undefined
  const seller = page?.sellerId ? catalog.sellers.find((s) => s.id === page.sellerId) : null
  useTitle(page ? `${page.title} · ${catalog.tenant.name}` : catalog.tenant.name)
  if (!page) return <NotFound title="Nothing to preview" text="Open this page from the admin console." />
  const sections = page.sections.filter((s) => !s.hidden && s.kind !== 'footer')
  const heroShown =
    sections.some((s) => s.kind === 'hero') &&
    (!!seller || theme.id === 'theme1' || lookFor(page.templateId).hero !== 'theme')
  return (
    <TemplateLookProvider templateId={page.templateId}>
      {!heroShown && <h1 className="sr-only">{page.title}</h1>}
      <theme.Sections sections={sections} seller={seller} />
    </TemplateLookProvider>
  )
}
