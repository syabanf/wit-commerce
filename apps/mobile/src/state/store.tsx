import { ApiError, applyDelta, emptyState, mergeState } from '@rc/api'
import {
  type AppState,
  type Envelope,
  loadLocalState,
  nowIso,
  reduce,
  saveLocalState,
  seedState,
  syncClock,
} from '@rc/fixtures'
import { toast } from '@rc/ui'
import {
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

const STATE_KEY = 'rc.mobile.state.v1'

/** Store actions plus the one app-level message, resetting the demo to the seed. */
type Message = Envelope | { reset: true }

const reduceMessage = (state: AppState, message: Message): AppState =>
  'reset' in message ? seedState() : reduce(state, message)

interface StoreValue {
  state: AppState
  send: (envelope: Envelope) => void
  /** Local mode only: back to the seed. The API keeps one dataset for everyone. */
  reset: (() => void) | null
  /** True when the browser refused the last save, so changes live only until a reload. */
  storageError: boolean
  /** False while the API loads the dataset for a signed-in seller. */
  ready: boolean
}

const StoreContext = createContext<StoreValue | null>(null)

/** Holds the Commerce OS dataset: from the API when one is configured, else in a local reducer. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  return HTTP ? (
    <ApiStateProvider>{children}</ApiStateProvider>
  ) : (
    <LocalStateProvider>{children}</LocalStateProvider>
  )
}

function LocalStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceMessage, undefined, () => loadLocalState(STATE_KEY))
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    setStorageError(!saveLocalState(STATE_KEY, state))
  }, [state])
  // Backend jobs, simulated: expire unpaid orders, start and end promotions, campaigns and scheduled pages.
  useEffect(() => {
    const tick = () => dispatch({ action: { type: 'system/tick' }, meta: { by: 'system', at: nowIso() } })
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])
  const value = useMemo<StoreValue>(
    () => ({ state, send: dispatch, reset: () => dispatch({ reset: true }), storageError, ready: true }),
    [state, storageError],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

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
          toast('Could not load your store', { tone: 'danger', description: String((err as Error).message) })
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

  const send = useCallback(({ action }: Envelope) => {
    if (action.type === 'system/tick') return
    api
      .send(action)
      .then((delta) => setState((s) => applyDelta(s, delta)))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) tokenStore.set(null)
        toast('The change was not saved', { tone: 'danger', description: String((err as Error).message) })
      })
  }, [])

  const value = useMemo<StoreValue>(
    () => ({ state, send, reset: null, storageError: false, ready }),
    [state, send, ready],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
