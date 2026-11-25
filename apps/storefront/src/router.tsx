import type { ComponentType } from 'react'
import { Outlet, type RouteObject, ScrollRestoration } from 'react-router'
import { AccountPage } from './features/AccountPage'
import { AgentPage } from './features/AgentPage'
import { BrandChooserPage } from './features/BrandChooserPage'
import {
  CartPage,
  CategoryPage,
  CollectionPage,
  HomePage,
  PagePreviewPage,
  PersonalStorePage,
  ProductPage,
  SearchPage,
  StoreNotFoundPage,
  WishlistPage,
} from './features/catalogPages'
import { CheckoutPage } from './features/CheckoutPage'
import { HelpPage } from './features/HelpPage'
import { PrivacyPage } from './features/PrivacyPage'
import { TermsPage } from './features/TermsPage'
import { OrderPage } from './features/OrderPage'
import { StoreRoot } from './features/StoreRoot'
import { HOST_STORE } from './lib/host'
import { useLang } from './i18n'

/**
 * A route's page, rendered again when the shopper switches language. Routes keep their elements from
 * load, so a page would otherwise stay in the old language. Rendering again, rather than mounting anew,
 * keeps what the page holds, such as a half-filled checkout.
 */
function Localized({ page: Page }: { page: ComponentType }) {
  useLang()
  return <Page />
}

const page = (Page: ComponentType) => <Localized page={Page} />

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

// Fixed segments (c, p, search, cart, checkout, order, account, wishlist, collections) rank above the
// dynamic `:sellerSlug`, so a personal store never shadows them.
const storePages: RouteObject[] = [
  { index: true, element: page(HomePage) },
  { path: 'c/:categoryId', element: page(CategoryPage) },
  { path: 'collections/:slug', element: page(CollectionPage) },
  { path: 'search', element: page(SearchPage) },
  { path: 'p/:productId', element: page(ProductPage) },
  { path: 'cart', element: page(CartPage) },
  { path: 'checkout', element: page(CheckoutPage) },
  { path: 'order/:orderId', element: page(OrderPage) },
  { path: 'account', element: page(AccountPage) },
  { path: 'wishlist', element: page(WishlistPage) },
  { path: 'agent', element: page(AgentPage) },
  { path: 'help', element: page(HelpPage) },
  { path: 'terms', element: page(TermsPage) },
  { path: 'privacy', element: page(PrivacyPage) },
  { path: 'preview/:pageId', element: page(PagePreviewPage) },
  { path: ':sellerSlug', element: page(PersonalStorePage) },
  { path: '*', element: page(StoreNotFoundPage) },
]

// A store host (lari.commerce.reddie.id) mounts its store at the root. A single host keeps the demo hub
// at / and every store under /:store.
export const routes: RouteObject[] = [
  {
    element: page(Root),
    children: HOST_STORE
      ? [{ path: '/', element: page(StoreRoot), children: storePages }]
      : [
          { path: '/', element: page(BrandChooserPage) },
          { path: '/:store', element: page(StoreRoot), children: storePages },
        ],
  },
]
