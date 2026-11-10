import { Button, cn } from '@rc/ui'
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { type DragEvent, useId, useState } from 'react'
import { HTTP, api } from '../lib/api'

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

/**
 * One image stored through the API: shows the current one, takes a dropped or picked file and hands
 * back its URL. The caller saves the URL with its own form. Without the API it explains why it is off.
 */
export function ImageUpload({
  id,
  tenantId,
  value,
  onChange,
  label,
  disabled,
  className,
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
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const off = disabled || busy || !HTTP

  const upload = async (file: File | undefined) => {
    if (!file || off) return
    if (!ACCEPT.includes(file.type)) return setError('Choose a PNG, JPEG or WebP image.')
    if (file.size > MAX_BYTES) return setError('Choose an image of 5 MB or less.')
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
    void upload(e.dataTransfer.files[0])
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
            id={inputId}
            type="file"
            accept={ACCEPT.join(',')}
            disabled={off}
            aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            className="sr-only"
            onChange={(e) => {
              void upload(e.target.files?.[0])
              // Reset so picking the same file again still fires a change.
              e.target.value = ''
            }}
          />
        </label>
        <div className="min-w-0 space-y-1 text-xs text-muted">
          <p>
            {HTTP
              ? 'Drop an image here or click to choose. PNG, JPEG or WebP, up to 5 MB.'
              : 'Uploading needs the API. Build the console with VITE_API_URL to add images.'}
          </p>
          {value && !disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)} disabled={busy}>
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
