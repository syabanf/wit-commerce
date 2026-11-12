import type { User } from '@rc/types'
import { ApiError, applyDelta, emptyState, mergeState, type Delta } from '@rc/api'
import {
  type AppState,
  type Envelope,
  loadLocalState,
  nowIso,
  reduce,
  saveLocalState,
  syncClock,
} from '@rc/fixtures'
import { toast } from '@rc/ui'
import {
  type Dispatch,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from 'react'
import { HTTP, api, tokenStore } from '../lib/api'

interface StoreValue {
  state: AppState
  send: Dispatch<Envelope>
  commit: (action: Envelope) => Promise<Delta | null>
  storageError: boolean
  /** False while the API loads the dataset for a signed-in user. */
  ready: boolean
  /** API mode: lays a staff row the server answered with over the state. */
  mergeUser: (user: User) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export const STATE_KEY = 'rc.admin.state.v1'

/** Holds the WIT Commerce dataset: from the API when one is configured, else in a local reducer. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  return HTTP ? (
    <ApiStateProvider>{children}</ApiStateProvider>
  ) : (
    <LocalStateProvider>{children}</LocalStateProvider>
  )
}

/** The dataset in one reducer, kept across reloads on this device. */
function LocalStateProvider({ children }: { children: ReactNode }) {
  const [state, send] = useReducer(reduce, undefined, () => loadLocalState(STATE_KEY))
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    setStorageError(!saveLocalState(STATE_KEY, state))
  }, [state])
  // Backend jobs, simulated: expire unpaid orders, start and end promotions, campaigns and scheduled pages.
  useEffect(() => {
    const tick = () => send({ action: { type: 'system/tick' }, meta: { by: 'system', at: nowIso() } })
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])
  const value = useMemo(
    () => ({
      state,
      send,
      commit: async (action: Envelope) => {
        send(action)
        return null
      },
      storageError,
      ready: true,
      mergeUser: () => undefined,
    }),
    [state, storageError],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

/**
 * The dataset from the API: loaded once the user signs in, kept current by the event stream, and
 * changed by posting each action. The server runs the timed jobs.
 */
function ApiStateProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, tokenStore.get)
  const [state, setState] = useState<AppState>(emptyState)
  const [ready, setReady] = useState(!token)

  useEffect(() => {
    if (!token) {
      setState(emptyState())
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    api
      .state()
      .then(({ state: loaded, now }) => {
        if (cancelled) return
        syncClock(now)
        setState(mergeState(emptyState(), loaded))
        setReady(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) tokenStore.set(null)
        else
          toast('Could not load the console data', {
            tone: 'danger',
            description: String((err as Error).message),
          })
      })
    const close = api.subscribe(
      (delta) => setState((s) => applyDelta(s, delta)),
      (now) => syncClock(now),
    )
    return () => {
      cancelled = true
      close()
    }
  }, [token])

  const send = useCallback<Dispatch<Envelope>>(({ action }) => {
    if (action.type === 'system/tick') return
    api
      .send(action)
      .then((delta) => setState((s) => applyDelta(s, delta)))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) tokenStore.set(null)
        toast('The change was not saved', { tone: 'danger', description: String((err as Error).message) })
      })
  }, [])

  const commit = useCallback(async ({ action }: Envelope) => {
    const delta = await api.send(action)
    setState((s) => applyDelta(s, delta))
    return delta
  }, [])

  const mergeUser = useCallback(
    (user: User) => setState((s) => ({ ...s, users: [...s.users.filter((u) => u.id !== user.id), user] })),
    [],
  )
  const value = useMemo(
    () => ({ state, send, commit, storageError: false, ready, mergeUser }),
    [state, send, commit, ready, mergeUser],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
