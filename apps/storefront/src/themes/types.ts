import type { PageSection, Product, Seller, StorefrontTheme } from '@rc/types'
import type { ComponentType, ReactNode } from 'react'
import type { CartView } from '../features/cartView'
import type { HomeData } from '../features/home'
import type { ListingState } from '../features/listing'
import type { ProductDetail } from '../features/product'

export interface ListingChip {
  label: string
  to: string
  active: boolean
  count?: number
}

export interface ListingViewProps {
  title: string
  description?: string
  crumbs: { label: string; to: string }[]
  chips: ListingChip[]
  listing: ListingState
  /** Search pages show the query field above the results. */
  query?: string
  empty: ReactNode
}

export interface SectionsProps {
  sections: PageSection[]
  /** Set on personal stores: the hero shows the seller and CTAs open WhatsApp. */
  seller?: Seller | null
}

/**
 * What a theme supplies. Routes, cart, checkout and data logic are shared; a theme only decides
 * layout and components. Shared pages (checkout, order, account) render inside the theme's Layout
 * and use its ProductGrid.
 */
export interface ThemeModule {
  id: StorefrontTheme
  name: string
  Layout: ComponentType<{ children: ReactNode }>
  Home: ComponentType<{ data: HomeData }>
  Listing: ComponentType<ListingViewProps>
  Product: ComponentType<{ detail: ProductDetail }>
  Cart: ComponentType<{ view: CartView }>
  ProductGrid: ComponentType<{ products: Product[]; className?: string; rail?: boolean }>
  Sections: ComponentType<SectionsProps>
  /** Assistant bubble style: rounded brand bubbles, or hairline bubbles on phones. */
  assistant: 'rounded' | 'hairline'
}
