import type { MediaItem, MediaUse } from '@rc/api'
import { fmtDate, fmtNumber, plural } from '@rc/fixtures'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, Tooltip, toast } from '@rc/ui'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useMediaLibrary } from '../../components/useMediaLibrary'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { useScoped } from '../../state/scoped'

const USE_LABEL: Record<MediaUse['kind'], string> = {
  product: 'Product photo',
  brand: 'Logo',
  page: 'Page section',
  page_draft: 'Unpublished page changes',
  page_history: 'Page version history',
  seller: 'Seller photo',
}

const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${fmtNumber(Math.max(1, Math.round(bytes / 1024)))} KB`

/** `/store/media`: every image the brand uploaded, where each is used, and delete for the unused. */
export function MediaPage() {
  const s = useScoped()
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const allowed = HTTP && (can('store.manage') || can('product.manage'))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media"
        description="Every image this brand uploaded, newest first, with where each is used. Images nothing uses for a day are removed on their own."
        actions={
          allowed && (
            <Input
              variant="pill"
              type="search"
              aria-label="Search images by file name"
              placeholder="Search by file name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:w-64 w-full"
            />
          )
        }
      />
      {!HTTP ? (
        <Card>
          <EmptyState
            title="The media library needs the API"
            description="Build the console with VITE_API_URL to upload and manage images."
          />
        </Card>
      ) : !allowed ? (
        <Card>
          <EmptyState
            title="You cannot manage images"
            description="The media library needs store or product access. Ask the store owner to give it to you."
          />
        </Card>
      ) : (
        <Library key={s.tenantId} tenantId={s.tenantId} query={query} />
      )}
    </div>
  )
}

function Library({ tenantId, query }: { tenantId: string; query: string }) {
  const lib = useMediaLibrary(tenantId, query)
  const [removing, setRemoving] = useState<MediaItem | null>(null)

  const remove = async (item: MediaItem) => {
    setRemoving(null)
    try {
      await api.media.remove(tenantId, item.id)
      lib.drop(item.id)
      toast('Image deleted', { tone: 'success', description: item.name || item.url })
    } catch (err) {
      toast('The image was not deleted', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
      lib.reload()
    }
  }

  if (lib.error)
    return (
      <Card>
        <EmptyState
          title="The library did not load"
          description={lib.error}
          action={
            <Button variant="outline" onClick={lib.reload}>
              Try again
            </Button>
          }
        />
      </Card>
    )
  if (!lib.loading && !lib.items.length)
    return (
      <Card>
        <EmptyState
          title={query.trim() ? 'No image has that name' : 'No images yet'}
          description={
            query.trim()
              ? 'Try part of the file name.'
              : 'Images you add to products, the logo, pages or seller profiles show up here.'
          }
        />
      </Card>
    )

  return (
    <>
      <p className="text-sm text-muted" aria-live="polite">
        {plural(lib.total, 'image')}
      </p>
      <ul className="gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 grid grid-cols-1">
        {lib.items.map((item) => (
          <li key={item.id}>
            <Card className="h-full overflow-hidden">
              <img
                src={item.url}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full bg-surface object-cover"
              />
              <div className="space-y-2 p-4">
                <div className="gap-2 flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name || 'Untitled image'}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {item.width} × {item.height} · {sizeOf(item.size)} · {fmtDate(item.createdAt)}
                    </p>
                  </div>
                  <Tooltip
                    content={
                      item.uses.length ? 'Replace it where it is used first, then delete it' : 'Delete image'
                    }
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${item.name || 'image'}`}
                      aria-disabled={item.uses.length > 0}
                      onClick={() => !item.uses.length && setRemoving(item)}
                      className={item.uses.length ? 'cursor-not-allowed opacity-40' : undefined}
                    >
                      <Trash2 />
                    </Button>
                  </Tooltip>
                </div>
                {item.uses.length ? (
                  <ul className="gap-1 flex flex-wrap" aria-label="Used in">
                    {item.uses.map((u) => (
                      <li key={`${u.kind}-${u.id}`}>
                        <Badge variant="muted" title={USE_LABEL[u.kind]}>
                          {USE_LABEL[u.kind]}: {u.label || u.id}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Badge variant="warning">Not used</Badge>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <div className="flex justify-center">
        {lib.loading ? (
          <LoaderCircle aria-label="Loading images" className="size-5 animate-spin text-muted" />
        ) : (
          lib.more && (
            <Button variant="outline" onClick={lib.loadMore}>
              Show more
            </Button>
          )
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title="Delete this image?"
        description="The file is removed for good. You cannot undo this."
        confirmLabel="Delete image"
        onConfirm={() => removing && void remove(removing)}
      />
    </>
  )
}
