import { useCallback, useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767.98px)'

/** True below the md breakpoint. Renders as desktop where matchMedia is missing (server render, tests). */
export function useIsPhone(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(QUERY)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
