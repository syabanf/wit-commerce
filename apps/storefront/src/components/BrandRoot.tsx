import type { BrandConfig, StorefrontTheme } from '@rc/types'
import { loadFonts } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react'
import { type SfStyle, brandVars } from '../lib/brand'

interface BrandValue {
  style: SfStyle
  theme: StorefrontTheme
}

const BrandContext = createContext<BrandValue>({ style: {}, theme: 'theme1' })

/**
 * The storefront root: brand tokens as inline CSS variables plus the theme's surface variables
 * (index.css, keyed by data-theme). Overlays read the same values so they render in the brand too.
 */
export function BrandRoot({
  brand,
  theme,
  className,
  children,
}: {
  brand: BrandConfig
  theme: StorefrontTheme
  className?: string
  children: ReactNode
}) {
  const value = useMemo(() => ({ style: brandVars(brand), theme }), [brand, theme])
  const heading = brand.fonts?.heading
  const body = brand.fonts?.body
  // Google Fonts for the chosen pair; DM Sans comes with index.html.
  useEffect(() => {
    loadFonts([heading, body])
  }, [heading, body])
  return (
    <BrandContext value={value}>
      <div className={cn('sf-root min-h-dvh', className)} data-theme={theme} style={value.style}>
        {children}
      </div>
    </BrandContext>
  )
}

export const useBrand = () => useContext(BrandContext)
