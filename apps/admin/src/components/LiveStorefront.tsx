import type { AppState } from '@rc/fixtures'
import type { BrandConfig, Device, Page, Tenant } from '@rc/types'
import { ExternalLink } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { STOREFRONT_ORIGIN, storefrontUrl } from '../lib/storefront'
import { useStore } from '../state/store'

/** The viewport each device preview renders at before it is scaled into the card. */
const FRAME_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 768, mobile: 390 }
const READY_TIMEOUT_MS = 6000

type PreviewState = Pick<
  AppState,
  | 'tenants'
  | 'sellers'
  | 'templates'
  | 'pages'
  | 'categories'
  | 'attributes'
  | 'modifiers'
  | 'collections'
  | 'products'
  | 'promotions'
  | 'paymentTypes'
>

const replace = <T extends { id: string }>(list: readonly T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

/**
 * The real storefront in its tenant theme, inside the console. The frame runs the storefront app in
 * embed mode and receives this console's state (plus an unsaved brand or page) by postMessage, so the
 * preview is the page shoppers get. When the storefront app does not answer, `fallback` renders.
 */
export function LiveStorefront({
  tenant,
  device,
  page,
  brand,
  height = 640,
  fallback,
  className,
}: {
  tenant: Tenant
  device: Device
  /** The page to show with its current content and template; home when left out. */
  page?: Page | null
  /** An unsaved brand guideline to show instead of the saved one. */
  brand?: BrandConfig
  height?: number
  fallback: ReactNode
  className?: string
}) {
  const { state } = useStore()
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [failed, setFailed] = useState(false)

  const seller = page?.sellerId ? state.sellers.find((s) => s.id === page.sellerId) : undefined
  const path =
    !page || page.kind === 'home'
      ? ''
      : page.kind === 'personal' && seller
        ? `/${seller.slug}`
        : `/preview/${page.id}`
  const src = `${storefrontUrl(tenant.subdomain, path)}?embed=1${page ? `&page=${page.id}` : ''}`

  const preview = useMemo<PreviewState>(
    () => ({
      tenants: replace(state.tenants, { ...tenant, brand: brand ?? tenant.brand }),
      pages: page ? replace(state.pages, page) : state.pages,
      sellers: state.sellers,
      templates: state.templates,
      categories: state.categories,
      attributes: state.attributes,
      modifiers: state.modifiers,
      collections: state.collections,
      products: state.products,
      promotions: state.promotions,
      paymentTypes: state.paymentTypes,
    }),
    [state, tenant, brand, page],
  )

  // A new address reloads the frame; fall back when the storefront never says it is ready.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const frameReady = useRef(false)
  useEffect(() => {
    setFailed(false)
    frameReady.current = false
    timer.current = setTimeout(() => setFailed(true), READY_TIMEOUT_MS)
    return () => clearTimeout(timer.current)
  }, [src])

  // The frame and any tabs opened from here get the state when they load and on every change.
  const latest = useRef(preview)
  latest.current = preview
  const tabs = useRef(new Set<Window>())
  const send = (target: Window | null | undefined) =>
    target?.postMessage({ type: 'rc:preview', state: latest.current }, STOREFRONT_ORIGIN)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'rc:ready') return
      const fromFrame = e.source === frame.current?.contentWindow
      if (!fromFrame && !tabs.current.has(e.source as Window)) return
      if (fromFrame) {
        clearTimeout(timer.current)
        frameReady.current = true
      }
      send(e.source as Window)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (frameReady.current) send(frame.current?.contentWindow)
    for (const tab of tabs.current) {
      if (tab.closed) tabs.current.delete(tab)
      else send(tab)
    }
  }, [preview])

  const openTab = () => {
    const tab = window.open(src, '_blank')
    if (tab) tabs.current.add(tab)
  }

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (failed) return <>{fallback}</>
  const frameWidth = FRAME_WIDTH[device]
  const scale = width ? Math.min(1, width / frameWidth) : 1
  return (
    <div className={className}>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={openTab}
          className="h-9 gap-1.5 px-3 text-xs font-semibold inline-flex items-center rounded-full bg-surface-2 hover:bg-surface"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open in new page
        </button>
      </div>
      <div
        ref={box}
        className="rounded-2xl relative overflow-hidden bg-surface-2"
        style={{ height }}
      >
        <iframe
          ref={frame}
          key={src}
          src={src}
          title={`${tenant.name} storefront preview`}
          className="top-0 absolute border-0 bg-card"
          style={{
            width: frameWidth,
            height: height / scale,
            left: Math.max(0, (width - frameWidth * scale) / 2),
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  )
}
