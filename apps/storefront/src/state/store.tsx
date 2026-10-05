import {
  type AppAction,
  type AppState,
  type Envelope,
  loadLocalState,
  nowIso,
  reduce,
  saveLocalState,
} from '@rc/fixtures'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { ADMIN_ORIGINS, EMBED, EMBED_HOST, type PreviewState, cleanPreview } from '../lib/embed'

const STATE_KEY = 'rc.storefront.state.v1'

interface StoreValue {
  state: AppState
  /** Dispatches a store action stamped as a storefront change at the app clock. */
  send: (action: AppAction) => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** Holds the Commerce OS dataset in one reducer and keeps shopper changes on this device across reloads. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => loadLocalState(STATE_KEY))
  useEffect(() => {
    saveLocalState(STATE_KEY, state)
  }, [state])
  // Backend jobs, simulated: expire unpaid orders, start and end promotions and scheduled pages.
  useEffect(() => {
    const tick = () => dispatch({ action: { type: 'system/tick' }, meta: { by: 'system', at: nowIso() } })
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])
  const send = useCallback(
    (action: AppAction) => dispatch({ action, meta: { by: 'storefront', at: nowIso() } } satisfies Envelope),
    [],
  )
  // Inside the admin preview, the console's unsaved and saved edits lay over the dataset in memory only.
  const [preview, setPreview] = useState<PreviewState | null>(null)
  useEffect(() => {
    if (!EMBED) return
    const onMessage = (e: MessageEvent) => {
      if (!ADMIN_ORIGINS.includes(e.origin) || e.data?.type !== 'rc:preview') return
      setPreview(cleanPreview(e.data.state))
    }
    window.addEventListener('message', onMessage)
    EMBED_HOST?.postMessage({ type: 'rc:ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])
  const shown = useMemo(() => (preview ? { ...state, ...preview } : state), [state, preview])
  const value = useMemo(() => ({ state: shown, send }), [shown, send])
  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
