import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

// Per-device values. Browser storage can be missing or full (private mode, quota), so every access is
// guarded and an in-memory copy keeps the value for the rest of the visit.
type Area = 'local' | 'session'

const memory = new Map<string, string | null>()
const listeners = new Set<() => void>()

function storageOf(area: Area): Storage | null {
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

const memoryKey = (area: Area, key: string) => `${area}:${key}`

export function readRaw(area: Area, key: string): string | null {
  const mk = memoryKey(area, key)
  if (memory.has(mk)) return memory.get(mk) ?? null
  try {
    return storageOf(area)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function parseStored<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Saves a value as JSON; `null` removes it. */
export function writeStored(area: Area, key: string, value: unknown) {
  const raw = value === null || value === undefined ? null : JSON.stringify(value)
  memory.set(memoryKey(area, key), raw)
  try {
    const storage = storageOf(area)
    if (raw === null) storage?.removeItem(key)
    else storage?.setItem(key, raw)
  } catch {
    // The in-memory copy keeps the value until the tab closes.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * A JSON value in local or session storage that re-renders every reader when it changes.
 * `update` reads the latest stored value, so quick successive calls never lose a change.
 */
export function usePersisted<T>(area: Area, key: string, fallback: T) {
  const [initial] = useState(fallback)
  const read = () => readRaw(area, key)
  const raw = useSyncExternalStore(subscribe, read, read)
  const value = useMemo(() => parseStored(raw, initial), [raw, initial])
  const set = useCallback((next: T | null) => writeStored(area, key, next), [area, key])
  const update = useCallback(
    (fn: (current: T) => T) => writeStored(area, key, fn(parseStored(readRaw(area, key), initial))),
    [area, key, initial],
  )
  return [value, set, update] as const
}
