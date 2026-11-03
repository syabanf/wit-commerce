// A bearer token kept in browser storage, with subscribers, so React can read it with
// useSyncExternalStore and the client can attach it to every request.
export interface TokenStore {
  get: () => string | null
  set: (token: string | null) => void
  subscribe: (listener: () => void) => () => void
}

export function createTokenStore(key: string): TokenStore {
  const listeners = new Set<() => void>()
  let memory: string | null | undefined
  const read = () => {
    if (memory !== undefined) return memory
    try {
      memory = localStorage.getItem(key)
    } catch {
      memory = null
    }
    return memory
  }
  return {
    get: read,
    set: (token) => {
      memory = token
      try {
        if (token === null) localStorage.removeItem(key)
        else localStorage.setItem(key, token)
      } catch {
        // The in-memory copy keeps the session until the tab closes.
      }
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
