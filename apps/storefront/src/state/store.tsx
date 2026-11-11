import { ApiError, type Delta, type ShopRate, applyDelta, emptyState, mergeState } from '@rc/api'
import {
  type AppAction,
  type AppState,
  type Envelope,
  loadLocalState,
  nowIso,
  reduce,
  saveLocalState,
  syncClock,
} from '@rc/fixtures'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { HTTP, api, shopperToken } from '../lib/api'
import { ADMIN_ORIGINS, EMBED, EMBED_HOST, type PreviewState, cleanPreview } from '../lib/embed'
import { StoreOffline } from '../components/StoreOffline'

const STATE_KEY = 'rc.storefront.state.v1'

interface StoreValue {
  state: AppState
  /** Dispatches a store action stamped as a storefront change at the app clock. In API mode it
   * resolves to the server's answer; the local mode has none. */
  send: (action: AppAction) => Promise<Delta | null>
  /** API mode: loads one store's public dataset and keeps it current; the local mode has it all. */
  loadStore: (subdomain: string, tenantId: string) => () => void
  /** API mode: lays rows the server sent over the state (the shopper's account and orders). */
  merge: (loaded: Partial<AppState>) => void
  /** False until the API answered with the list of stores. */
  ready: boolean
  /** API mode: the store's payment types a provider collects online. */
  onlinePayments: string[]
  /** API mode: rates for the store's display currencies; the local mode uses the built-in ones. */
  currencyRates: ShopRate[]
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

/** Inside the admin preview, the console's unsaved and saved edits lay over the dataset in memory only. */
function usePreview(): PreviewState | null {
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
  return preview
}

const noop = () => {}

function LocalStateProvider({ children }: { children: ReactNode }) {
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
  const send = useCallback(async (action: AppAction) => {
    dispatch({ action, meta: { by: 'storefront', at: nowIso() } } satisfies Envelope)
    return null
  }, [])
  const preview = usePreview()
  const shown = useMemo(() => (preview ? { ...state, ...preview } : state), [state, preview])
  const value = useMemo<StoreValue>(
    () => ({
      state: shown,
      send,
      loadStore: () => noop,
      merge: noop,
      ready: true,
      onlinePayments: [],
      currencyRates: [],
    }),
    [shown, send],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

/**
 * The stores from the API at boot, then one store's dataset when a store route mounts, kept current
 * by that store's event stream. Orders and leads post to the store's endpoints.
 */
function ApiStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState)
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)
  const [onlinePayments, setOnlinePayments] = useState<string[]>([])
  const [currencyRates, setCurrencyRates] = useState<ShopRate[]>([])
  const current = useRef<{ subdomain: string; tenantId: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    api.shop
      .tenants()
      .then(({ tenants, now }) => {
        if (cancelled) return
        syncClock(now)
        setState((s) => mergeState(s, { tenants }))
      })
      .catch((err: unknown) => {
        console.error('stores did not load', err)
        if (!cancelled) setOffline(true)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const merge = useCallback((loaded: Partial<AppState>) => setState((s) => mergeState(s, loaded)), [])

  const loadStore = useCallback((subdomain: string, tenantId: string) => {
    current.current = { subdomain, tenantId }
    let cancelled = false
    api.shop
      .state(subdomain)
      .then(({ state: loaded, now, onlinePayments: online, currencyRates: rates }) => {
        if (cancelled) return
        syncClock(now)
        setOnlinePayments(online ?? [])
        setCurrencyRates(rates ?? [])
        // The tenants list stays whole; everything else is this store's.
        const { tenants: _tenants, ...rest } = loaded
        setState((s) => mergeState(s, rest))
      })
      .catch((err: unknown) => {
        console.error('store did not load', err)
        if (!cancelled) setOffline(true)
      })
    api.shop
      .demoCustomers(subdomain)
      .then(({ customers }) => !cancelled && setState((s) => mergeState(s, { customers })))
      .catch(() => {
        // Demo sign-in is off in this deployment; shoppers check out as new customers.
      })
    const close = api.shop.subscribe(subdomain, (delta) => setState((s) => applyDelta(s, delta)))
    return () => {
      cancelled = true
      close()
      if (current.current?.subdomain === subdomain) current.current = null
    }
  }, [])

  const send = useCallback(async (action: AppAction) => {
    if (action.type === 'system/tick') return null
    const store = current.current
    try {
      const delta = await api.send(action, store?.subdomain)
      if (delta.token && store) shopperToken(store.tenantId).set(delta.token)
      setState((s) => applyDelta(s, delta))
      return delta
    } catch (err) {
      throw err instanceof ApiError ? err : new Error('The store did not answer. Try again in a moment.')
    }
  }, [])

  const preview = usePreview()
  const shown = useMemo(() => (preview ? { ...state, ...preview } : state), [state, preview])
  const value = useMemo<StoreValue>(
    () => ({ state: shown, send, loadStore, merge, ready, onlinePayments, currencyRates }),
    [shown, send, loadStore, merge, ready, onlinePayments, currencyRates],
  )
  // Pages read the tenant list on their first render; the canvas waits for it.
  if (offline) return <StoreOffline />
  return <StoreContext value={value}>{ready ? children : <div className="min-h-dvh" />}</StoreContext>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
