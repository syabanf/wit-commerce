import type { ChangeEvent } from 'react'
import { Camera, ImageIcon, X } from 'lucide-react'
import { cn } from '../lib/cn'

export type PhotoInputProps = {
  photos: string[]
  /** Receives object URLs for the picked files. The caller owns them (and their revocation). */
  onAdd: (urls: string[]) => void
  onRemove?: (url: string) => void
  max?: number
  label?: string
  className?: string
}

export function PhotoInput({
  photos,
  onAdd,
  onRemove,
  max = 6,
  label = 'Add photo',
  className,
}: PhotoInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const room = Math.max(0, max - photos.length)
    const urls = Array.from(event.target.files ?? [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, room)
      .map((file) => URL.createObjectURL(file))
    // Reset so picking the same file again still fires a change.
    event.target.value = ''
    if (urls.length > 0) onAdd(urls)
  }

  return (
    <div className={cn('gap-2 grid grid-cols-3', className)}>
      {photos.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className="rounded-2xl relative aspect-square overflow-hidden bg-surface"
        >
          {url ? (
            <img src={url} alt={`Photo ${index + 1}`} className="size-full object-cover" />
          ) : (
            <div className="[&_svg]:size-6 flex size-full items-center justify-center text-muted">
              <ImageIcon aria-hidden="true" />
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => onRemove(url)}
              className="right-1.5 top-1.5 size-7 text-white [&_svg]:size-3.5 absolute flex items-center justify-center rounded-full bg-ink/70 transition-colors hover:bg-ink focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {photos.length < max && (
        <label className="gap-1.5 rounded-2xl px-2 text-xs font-semibold [&_svg]:size-5 relative flex aspect-square cursor-pointer flex-col items-center justify-center bg-surface text-center text-body transition-colors focus-within:ring-2 focus-within:ring-accent/40 hover:bg-surface-2 active:scale-[0.98]">
          <Camera aria-hidden="true" className="text-muted" />
          <span>{label}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleChange}
            className="sr-only"
          />
        </label>
      )}
    </div>
  )
}
