import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@rc/ui'
import { ImagePlus, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useMediaLibrary } from './useMediaLibrary'

/** Picks an image the brand already uploaded, or starts a new upload. */
export function MediaLibraryDialog({
  tenantId,
  onPick,
  onUpload,
  onClose,
}: {
  tenantId: string
  onPick: (url: string) => void
  onUpload: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const lib = useMediaLibrary(tenantId, query)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>Images this brand uploaded, newest first.</DialogDescription>
        </DialogHeader>
        <div className="gap-2 flex flex-wrap items-center">
          <Input
            variant="pill"
            type="search"
            aria-label="Search images by file name"
            placeholder="Search by file name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Button variant="outline" onClick={onUpload}>
            <ImagePlus />
            Upload a new image
          </Button>
        </div>
        {lib.error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {lib.error}
          </p>
        ) : !lib.loading && !lib.items.length ? (
          <p className="p-6 text-sm rounded-2xl bg-surface text-center text-muted">
            {query.trim() ? 'No image has that name.' : 'No images yet. Upload one to start the library.'}
          </p>
        ) : (
          <ul className="gap-3 sm:grid-cols-4 lg:grid-cols-5 p-1 grid max-h-[55dvh] grid-cols-2 overflow-y-auto">
            {lib.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item.url)}
                  className="group w-full text-left focus-visible:outline-none"
                >
                  <span className="rounded-xl block aspect-square overflow-hidden bg-surface ring-accent group-hover:ring-2 group-focus-visible:ring-2">
                    <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
                  </span>
                  <span className="mt-1 text-xs font-medium block truncate">
                    {item.name || 'Untitled image'}
                  </span>
                  <span className="text-xs block truncate text-muted">
                    {item.width} × {item.height}
                    {item.uses.length ? ` · used in ${item.uses.length}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={cn('flex justify-center', !lib.more && !lib.loading && 'hidden')}>
          {lib.loading ? (
            <LoaderCircle aria-label="Loading images" className="size-5 animate-spin text-muted" />
          ) : (
            <Button variant="ghost" size="sm" onClick={lib.loadMore}>
              Show more
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
