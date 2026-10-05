import type { AppState } from './store'
import { seedState } from './data'

const STORAGE_VERSION = 9

type StoredState = { version: number; state: AppState }

function looksLikeState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppState>
  return (
    Array.isArray(candidate.orders) && Array.isArray(candidate.customers) && Array.isArray(candidate.tenants)
  )
}

/** Restore a locally persisted demo state, falling back to a clean seed after schema changes or corruption. */
export function loadLocalState(key: string): AppState {
  if (typeof window === 'undefined') return seedState()
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return seedState()
    const stored = JSON.parse(raw) as Partial<StoredState>
    return stored.version === STORAGE_VERSION && looksLikeState(stored.state) ? stored.state : seedState()
  } catch {
    return seedState()
  }
}

/** Save demo state. Returns false when browser storage is full or unavailable, so the shell can say so. */
export function saveLocalState(key: string, state: AppState): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: STORAGE_VERSION, state } satisfies StoredState),
    )
    return true
  } catch {
    return false
  }
}
