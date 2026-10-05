import { useCallback, useState } from 'react'

// Per-viewer UI preferences. Storage can be unavailable (private mode), so every access is guarded.
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore: preferences are a convenience
  }
}

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, initial))
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        writeStorage(key, resolved)
        return resolved
      })
    },
    [key],
  )
  return [value, set] as const
}
