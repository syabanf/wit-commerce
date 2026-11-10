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
import { OrderPage } from './features/OrderPage'
import { StoreRoot } from './features/StoreRoot'
import { HOST_STORE } from './lib/host'

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
  { index: true, element: <HomePage /> },
  { path: 'c/:categoryId', element: <CategoryPage /> },
  { path: 'collections/:slug', element: <CollectionPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'p/:productId', element: <ProductPage /> },
  { path: 'cart', element: <CartPage /> },
  { path: 'checkout', element: <CheckoutPage /> },
  { path: 'order/:orderId', element: <OrderPage /> },
  { path: 'account', element: <AccountPage /> },
  { path: 'wishlist', element: <WishlistPage /> },
  { path: 'agent', element: <AgentPage /> },
  { path: 'preview/:pageId', element: <PagePreviewPage /> },
  { path: ':sellerSlug', element: <PersonalStorePage /> },
  { path: '*', element: <StoreNotFoundPage /> },
]

// A store host (lari.commerce.reddie.id) mounts its store at the root. A single host keeps the demo hub
// at / and every store under /:store.
export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: HOST_STORE
      ? [{ path: '/', element: <StoreRoot />, children: storePages }]
      : [
          { path: '/', element: <BrandChooserPage /> },
          { path: '/:store', element: <StoreRoot />, children: storePages },
        ],
  },
]
