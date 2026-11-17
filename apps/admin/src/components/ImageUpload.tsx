import { Button, cn } from '@rc/ui'
import { ImagePlus, Images, LoaderCircle, Trash2 } from 'lucide-react'
import { type DragEvent, useId, useRef, useState } from 'react'
import { HTTP, api } from '../lib/api'
import { CropDialog, type CropShape } from './CropDialog'
import { MediaLibraryDialog } from './MediaLibraryDialog'

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024
/** A larger photo can still be cropped down under the upload limit. */
const MAX_CROP_BYTES = 30 * 1024 * 1024

/**
 * One image stored through the API: shows the current one, takes a dropped or picked file, offers a
 * crop, or picks one from the brand's library, and hands back its URL. The caller saves the URL with
 * its own form. Without the API it explains why it is off.
 */
export function ImageUpload({
  id,
  tenantId,
  value,
  onChange,
  label,
  disabled,
  className,
  shape,
}: {
  /** The file input's id, for a FormField label. */
  id?: string
  tenantId: string
  value: string | undefined
  onChange: (url: string | undefined) => void
  /** Names the image for screen readers, such as "Product photo". */
  label: string
  disabled?: boolean
  className?: string
  /** The crop shape the dialog starts with. */
  shape?: CropShape
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [cropping, setCropping] = useState<File | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const off = disabled || busy || !HTTP

  // A picked file goes to the crop step first; the crop or "Use original" then uploads.
  const pick = (file: File | undefined) => {
    if (!file || off) return
    if (!ACCEPT.includes(file.type)) return setError('Choose a PNG, JPEG or WebP image.')
    if (file.size > MAX_CROP_BYTES) return setError('Choose an image of 30 MB or less.')
    setError(null)
    setCropping(file)
  }

  const upload = async (file: File) => {
    setCropping(null)
    if (file.size > MAX_BYTES)
      return setError('The image is larger than 5 MB. Crop it, or choose a smaller one.')
    setError(null)
    setBusy(true)
    try {
      onChange((await api.media.upload(tenantId, file)).url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    pick(e.dataTransfer.files[0])
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="gap-3 flex items-center">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault()
            if (!off) setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={cn(
            'size-24 rounded-2xl gap-1 text-xs font-semibold relative flex shrink-0 flex-col items-center justify-center overflow-hidden bg-surface text-center text-muted transition-colors focus-within:ring-2 focus-within:ring-accent/40',
            off ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface-2',
            over && 'ring-2 ring-accent',
          )}
        >
          {value ? (
            <img src={value} alt={label} className="inset-0 absolute size-full object-cover" />
          ) : (
            <>
              <ImagePlus aria-hidden="true" className="size-5" />
              <span>{busy ? 'Uploading' : 'Add image'}</span>
            </>
          )}
          {busy && (
            <span className="inset-0 absolute flex items-center justify-center bg-card/70">
              <LoaderCircle aria-label="Uploading" className="size-5 animate-spin text-body" />
            </span>
          )}
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={ACCEPT.join(',')}
            disabled={off}
            aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            className="sr-only"
            onChange={(e) => {
              pick(e.target.files?.[0])
              // Reset so picking the same file again still fires a change.
              e.target.value = ''
            }}
          />
        </label>
        <div className="min-w-0 space-y-1 text-xs text-muted">
          <p>
            {HTTP
              ? 'Drop an image here or click to choose. PNG, JPEG or WebP; you can crop it before it uploads.'
              : 'Uploading needs the API. Build the console with VITE_API_URL to add images.'}
          </p>
          <div className="gap-1 flex flex-wrap">
            {HTTP && !disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBrowsing(true)}
                disabled={busy}
              >
                <Images />
                Choose from library
              </Button>
            )}
            {value && !disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(undefined)}
                disabled={busy}
              >
                <Trash2 />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {cropping && (
        <CropDialog
          file={cropping}
          shape={shape}
          onCrop={(file) => void upload(file)}
          onOriginal={() => void upload(cropping)}
          onCancel={() => setCropping(null)}
        />
      )}
      {browsing && (
        <MediaLibraryDialog
          tenantId={tenantId}
          onPick={(url) => {
            setBrowsing(false)
            setError(null)
            onChange(url)
          }}
          onUpload={() => {
            setBrowsing(false)
            input.current?.click()
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  )
}
