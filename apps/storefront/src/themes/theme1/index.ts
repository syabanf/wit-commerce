import { STOREFRONT_THEME_LABEL } from '@rc/types'
import type { ThemeModule } from '../types'
import { Cart } from './Cart'
import { Home } from './Home'
import { Layout } from './Layout'
import { Listing } from './Listing'
import { Product } from './Product'
import { ProductGrid } from './ProductCard'
import { Sections } from './Sections'

/** Theme 1 · Marketplace: search-first, category sidebar, deals countdown, dense product rows. */
export const theme1: ThemeModule = {
  id: 'theme1',
  name: STOREFRONT_THEME_LABEL.theme1,
  Layout,
  Home,
  Listing,
  Product,
  Cart,
  ProductGrid,
  Sections,
  assistant: 'rounded',
}
