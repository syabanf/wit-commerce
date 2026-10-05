import type { AppState } from '@rc/fixtures'
import { useSearchParams } from 'react-router'

/**
 * Embed mode: the admin console shows this storefront in an iframe and sends the state it is editing
 * (brand, pages, templates, catalog) by postMessage, so its preview is the real theme. The console
 * frames the store or opens it in a new tab (then it is the opener). Fixed at load, so it survives
 * navigation inside the page.
 */
export const EMBED_HOST: Window | null =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1'
    ? window.parent !== window
      ? window.parent
      : window.opener
    : null

export const EMBED = !!EMBED_HOST

/** Origins allowed to send preview state: the admin dev and preview servers unless configured. */
export const ADMIN_ORIGINS = (
  (import.meta.env.VITE_ADMIN_ORIGINS as string | undefined) ?? 'http://localhost:5373,http://localhost:4373'
)
  .split(',')
  .map((o) => o.trim())

/** Slices of the dataset the admin may replace while previewing. */
export const PREVIEW_KEYS = [
  'tenants',
  'sellers',
  'templates',
  'pages',
  'categories',
  'attributes',
  'modifiers',
  'collections',
  'products',
  'promotions',
  'paymentTypes',
] as const satisfies readonly (keyof AppState)[]

export type PreviewState = Partial<Pick<AppState, (typeof PREVIEW_KEYS)[number]>>

/** Keeps only known slices that arrived as arrays. */
export function cleanPreview(data: unknown): PreviewState | null {
  if (!data || typeof data !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const key of PREVIEW_KEYS) {
    const value = (data as Record<string, unknown>)[key]
    if (Array.isArray(value)) out[key] = value
  }
  return Object.keys(out).length ? (out as PreviewState) : null
}

/** In embed mode, `?page=<id>` shows that page even while it is a draft or scheduled. */
export function usePreviewPageId(): string | null {
  const [params] = useSearchParams()
  return EMBED ? params.get('page') : null
}
