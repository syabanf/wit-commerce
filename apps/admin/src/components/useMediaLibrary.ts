import type { MediaItem } from '@rc/api'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

const PAGE = 48

/** A brand's media library, newest first: search by file name, load more, and drop deleted items. */
export function useMediaLibrary(tenantId: string, query: string) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      setError(null)
      try {
        const page = await api.media.list(tenantId, { q: query.trim(), limit: PAGE, offset })
        setItems((prev) => (offset ? [...prev, ...page.items] : page.items))
        setTotal(page.total)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The library did not load. Try again.')
      } finally {
        setLoading(false)
      }
    },
    [tenantId, query],
  )

  // A new search waits for the typing to pause.
  useEffect(() => {
    const timer = setTimeout(() => void load(0), 250)
    return () => clearTimeout(timer)
  }, [load])

  return {
    items,
    total,
    loading,
    error,
    more: items.length < total,
    loadMore: () => void load(items.length),
    reload: () => void load(0),
    drop: (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setTotal((n) => n - 1)
    },
  }
}
