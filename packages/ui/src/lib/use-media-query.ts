import { useCallback, useSyncExternalStore } from 'react'

const lists = new Map<string, MediaQueryList>()

function getList(query: string): MediaQueryList {
  let list = lists.get(query)
  if (!list) {
    list = window.matchMedia(query)
    lists.set(query, list)
  }
  return list
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = getList(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => getList(query).matches)
}

/** True below the `md` breakpoint (768px), where menus and pickers open as bottom sheets. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767.98px)')
}
