import type { AppState } from '@rc/fixtures'
import { useSyncExternalStore } from 'react'
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
  'warehouses',
  'stock',
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

/** True inside the admin editor's frame (not a tab it opened): sections there are picked by clicking. */
export const EMBED_FRAME = !!EMBED_HOST && EMBED_HOST === window.parent

// The section the editor has selected, outlined in the frame. The admin's origin is learned from its
// first message, so `rc:select` goes back to that origin only.
let adminOrigin: string | null = null
let focused: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The id of the section the editor has selected, or null. */
export const useFocusedSection = () =>
  useSyncExternalStore(
    subscribe,
    () => focused,
    () => null,
  )

const OUTLINE_CSS = `
[data-section-id] { cursor: pointer; border-radius: 12px; outline-offset: 6px; transition: outline-color 0.15s; }
[data-section-id]:hover { outline: 2px dashed var(--sf-accent); }
[data-section-id][data-selected] { outline: 2px solid var(--sf-accent); }
`

function installSectionPicker() {
  const style = document.createElement('style')
  style.textContent = OUTLINE_CSS
  document.head.append(style)
  window.addEventListener('message', (e) => {
    if (!ADMIN_ORIGINS.includes(e.origin)) return
    adminOrigin = e.origin
    if (e.data?.type !== 'rc:focus') return
    const id = typeof e.data.sectionId === 'string' ? e.data.sectionId : null
    focused = id
    for (const listener of listeners) listener()
    // Scroll this window only: scrollIntoView would scroll the admin page around the frame too.
    if (id && e.data.scroll)
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-section-id="${CSS.escape(id)}"]`)
        if (el)
          window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: 'smooth' })
      })
  })
  // Capture, so a click on a link or button inside a section selects it instead of acting.
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest('[data-section-id]') : null
      if (!el || !adminOrigin) return
      e.preventDefault()
      e.stopPropagation()
      EMBED_HOST?.postMessage(
        { type: 'rc:select', sectionId: el.getAttribute('data-section-id') },
        adminOrigin,
      )
    },
    true,
  )
}

if (EMBED_FRAME) installSectionPicker()
