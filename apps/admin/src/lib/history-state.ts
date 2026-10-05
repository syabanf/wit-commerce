import type { DataTableState } from '@rc/ui'
import { useEffect, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router'

// UI state per history entry, kept for the browser session. React Router gives every entry a key,
// and Back or Forward returns to the same key, so a list finds its search and filters again.
const entries = new Map<string, Record<string, unknown>>()

// The entry on screen. A replace navigation within a page (a tab kept in `?tab=`) mints a new key,
// so its saved state is carried over before the new page reads it.
let shown = { key: '', pathname: '' }

/**
 * `useState` that survives leaving a page and returning with Back or Forward. A fresh visit from the
 * nav starts from `initial`. Use it for list search, filters and table state, so a detail page's
 * back button lands on the list the user left. `name` must be unique within the page.
 */
export function useHistoryState<T>(name: string, initial: T | (() => T)) {
  const { key, pathname } = useLocation()
  const navigationType = useNavigationType()
  const [value, setValue] = useState<T>(() => {
    if (
      !entries.has(key) &&
      navigationType === 'REPLACE' &&
      shown.pathname === pathname &&
      entries.has(shown.key)
    ) {
      entries.set(key, { ...entries.get(shown.key) })
    }
    const saved = entries.get(key)
    if (saved && name in saved) return saved[name] as T
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })
  useEffect(() => {
    entries.set(key, { ...entries.get(key), [name]: value })
    shown = { key, pathname }
  }, [key, pathname, name, value])
  return [value, setValue] as const
}

/** Spread onto a `DataTable` to bring back its sort and page with the list. */
export function useTableHistory(name = 'table') {
  const [initialState, onStateChange] = useHistoryState<DataTableState | undefined>(name, undefined)
  return { initialState, onStateChange }
}
