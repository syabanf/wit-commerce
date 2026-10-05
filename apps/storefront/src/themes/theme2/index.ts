import { STOREFRONT_THEME_LABEL } from '@rc/types'
import type { ThemeModule } from '../types'
import { Cart } from './Cart'
import { Home } from './Home'
import { Layout } from './Layout'
import { Listing } from './Listing'
import { Product } from './Product'
import { ProductGrid } from './ProductCard'
import { Sections } from './Sections'

/** Theme 2 · Showcase: bold rounded showcase on desktop, editorial serif on phones. */
export const theme2: ThemeModule = {
  id: 'theme2',
  name: STOREFRONT_THEME_LABEL.theme2,
  Layout,
  Home,
  Listing,
  Product,
  Cart,
  ProductGrid,
  Sections,
  assistant: 'hairline',
}
