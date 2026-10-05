import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { sameKey } from './same-key'

export type LazyList<T> = {
  visible: T[]
  remaining: number
  hasMore: boolean
  loadMore: () => void
  sentinelRef: (el: Element | null) => void
}

/**
 * Reveals `items` one page at a time. The page count resets only when `resetKey` changes
 * (a tab or filter), never when the array identity changes. `initialCount` and `onCountChange`
 * let a caller save how far the user loaded and restore it after a remount.
 */
export function useLazyList<T>(
  items: T[],
  opts: {
    pageSize?: number
    resetKey?: unknown
    initialCount?: number
    onCountChange?: (count: number) => void
  } = {},
): LazyList<T> {
  const pageSize = opts.pageSize ?? 6
  const [state, setState] = useState({ key: opts.resetKey, count: opts.initialCount ?? pageSize })

  let count = state.count
  if (!sameKey(state.key, opts.resetKey)) {
    count = pageSize
    setState({ key: opts.resetKey, count: pageSize })
  }

  const visible = useMemo(() => items.slice(0, count), [items, count])
  const remaining = Math.max(0, items.length - count)
  const hasMore = remaining > 0

  const loadMore = useCallback(() => setState((s) => ({ ...s, count: s.count + pageSize })), [pageSize])

  const report = useEffectEvent((n: number) => opts.onCountChange?.(n))
  useEffect(() => {
    report(count)
  }, [count])

  // A new observer per page: its first callback reports the current intersection, so a
  // sentinel that is still on screen after a load keeps loading until it scrolls away.
  const sentinelRef = useCallback(
    (el: Element | null) => {
      if (!el || !hasMore) return
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMore()
        },
        { rootMargin: '120px' },
      )
      io.observe(el)
      return () => io.disconnect()
    },
    // `count` re-creates the observer after every page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMore, count, loadMore],
  )

  return { visible, remaining, hasMore, loadMore, sentinelRef }
}
