import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SegmentedControl,
  useElementSize,
} from '@rc/ui'
import { Minus, Plus } from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'

export type CropShape = 'free' | 'square' | 'wide'

const SHAPES: { value: CropShape; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'square', label: '1:1' },
  { value: 'wide', label: '16:9' },
]
const MAX_ZOOM = 4
/** The longest side of a cropped image; larger crops scale down to it. */
const MAX_SIDE = 2400
const MAX_BYTES = 5 * 1024 * 1024

interface View {
  zoom: number
  /** The image's top-left corner inside the frame, in frame pixels. */
  x: number
  y: number
}

/**
 * Crops an image before it uploads: pick a shape, drag and zoom, then save a WebP (or JPEG where the
 * browser cannot write WebP) under 5 MB. "Free" keeps the photo's own proportions. "Use original"
 * uploads the file as it is.
 */
export function CropDialog({
  file,
  shape: initialShape = 'free',
  onCrop,
  onOriginal,
  onCancel,
}: {
  file: File
  shape?: CropShape
  onCrop: (file: File) => void
  onOriginal: () => void
  onCancel: () => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [shape, setShape] = useState<CropShape>(initialShape)
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [box, size] = useElementSize<HTMLDivElement>()
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    // A cancelled run revokes its URL, which fails its image; only the current run reports.
    let current = true
    const url = URL.createObjectURL(file)
    setFailed(false)
    const image = new Image()
    image.onload = () => current && setImg(image)
    image.onerror = () => current && setFailed(true)
    image.src = url
    return () => {
      current = false
      URL.revokeObjectURL(url)
    }
  }, [file])

  const aspect =
    shape === 'square' ? 1 : shape === 'wide' ? 16 / 9 : img ? img.naturalWidth / img.naturalHeight : 1
  const width = Math.min(size.width || 320, 480)
  const height = Math.min(width / aspect, 360)
  const frameW = height * aspect
  // At zoom 1 the image just covers the frame.
  const base = img ? Math.max(frameW / img.naturalWidth, height / img.naturalHeight) : 1
  const scale = base * view.zoom
  const imgW = (img?.naturalWidth ?? 0) * scale
  const imgH = (img?.naturalHeight ?? 0) * scale

  const clamp = (v: View, w = imgW, h = imgH): View => ({
    zoom: v.zoom,
    x: Math.min(0, Math.max(frameW - w, v.x)),
    y: Math.min(0, Math.max(height - h, v.y)),
  })
  // Zoom around the frame's centre, so the middle of the crop stays put.
  const zoomTo = (zoom: number) => {
    if (!img) return
    const z = Math.min(MAX_ZOOM, Math.max(1, zoom))
    const ratio = z / view.zoom
    const cx = frameW / 2
    const cy = height / 2
    setView(
      clamp(
        { zoom: z, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio },
        img.naturalWidth * base * z,
        img.naturalHeight * base * z,
      ),
    )
  }

  // A new shape or frame size starts the crop centred again.
  useEffect(() => {
    if (!img) return
    const w = img.naturalWidth * base
    const h = img.naturalHeight * base
    setView({ zoom: 1, x: (frameW - w) / 2, y: (height - h) / 2 })
  }, [img, shape, frameW, height, base])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d) setView(clamp({ zoom: view.zoom, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]!
      setView(clamp({ zoom: view.zoom, x: view.x + dx, y: view.y + dy }))
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomTo(view.zoom + 0.2)
    } else if (e.key === '-') {
      e.preventDefault()
      zoomTo(view.zoom - 0.2)
    }
  }

  const save = async () => {
    if (!img) return
    setBusy(true)
    setError(null)
    try {
      const sw = frameW / scale
      const sh = height / scale
      const fit = Math.min(1, MAX_SIDE / Math.max(sw, sh))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw * fit))
      canvas.height = Math.max(1, Math.round(sh * fit))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('This browser cannot crop images. Use the original instead.')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, -view.x / scale, -view.y / scale, sw, sh, 0, 0, canvas.width, canvas.height)
      const blob = await encode(canvas)
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.${ext}`
      onCrop(new File([blob], name, { type: blob.type }))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The image could not be cropped. Use the original instead.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Crop the image</DialogTitle>
          <DialogDescription>
            Drag to move it and zoom to pick the part to keep. With the frame focused, arrow keys move it and
            plus or minus zoom.
          </DialogDescription>
        </DialogHeader>
        <SegmentedControl
          size="sm"
          value={shape}
          onChange={(v) => setShape(SHAPES.find((s) => s.value === v)?.value ?? 'free')}
          options={SHAPES}
        />
        <div ref={box} className="w-full">
          {failed ? (
            <p role="alert" className="p-4 text-sm rounded-2xl bg-surface text-danger">
              This browser cannot show the image, so it cannot be cropped. Use the original instead.
            </p>
          ) : (
            <div
              role="group"
              tabIndex={0}
              aria-label="Crop frame"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKey}
              className="rounded-xl relative mx-auto cursor-grab touch-none overflow-hidden bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:cursor-grabbing"
              style={{ width: frameW, height }}
            >
              {img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="top-0 left-0 absolute max-w-none select-none"
                  style={{ width: imgW, height: imgH, transform: `translate(${view.x}px, ${view.y}px)` }}
                />
              )}
            </div>
          )}
        </div>
        <div className="gap-2 flex items-center">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => zoomTo(view.zoom - 0.25)}
            disabled={!img || view.zoom <= 1}
          >
            <Minus />
          </Button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={MAX_ZOOM}
            step={0.05}
            value={view.zoom}
            disabled={!img}
            onChange={(e) => zoomTo(Number(e.target.value))}
            className="min-w-0 flex-1 accent-accent"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => zoomTo(view.zoom + 0.25)}
            disabled={!img || view.zoom >= MAX_ZOOM}
          >
            <Plus />
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={onOriginal} disabled={busy}>
            Use original
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!img || busy}>
            {busy ? 'Cropping…' : 'Crop and upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** WebP, else JPEG, lowering the quality until the file fits under 5 MB. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const blobOf = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  let type = 'image/webp'
  for (const quality of [0.9, 0.8, 0.7, 0.55, 0.4]) {
    let blob = await blobOf(type, quality)
    // A browser that cannot write WebP hands back a PNG.
    if (blob && blob.type !== type) {
      type = 'image/jpeg'
      blob = await blobOf(type, quality)
    }
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new Error('The cropped image is still larger than 5 MB. Crop a smaller part or zoom in.')
}
