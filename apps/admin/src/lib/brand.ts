/**
 * Hex mirror of the theme tokens in packages/tailwind-config/theme.css, for code that classes cannot
 * reach (inline styles, SVG fills). Keep the two files in sync when the palette changes.
 * Tenant storefront colours are data (Tenant.brand) and never come from here.
 */
export const BRAND = {
  accent: '#ed1c24',
  ink: '#101112',
  info: '#2f6db5',
  border: '#e6e5e7',
  muted: '#686868',
  chartMuted: '#d4d3d6',
} as const
