import type { Customer, CustomerMetricsRow, User } from '@rc/types'
import { ApiError, applyDelta, emptyState, mergeState, type CustomerRow, type Delta } from '@rc/api'
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
  useRef,
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
  /** API mode: lays rows read from a view over the state, as a delta's upserts. */
  mergeRows: (rows: Delta['upserts']) => void
  /**
   * API mode: reads customers the state does not hold yet, with their metrics, and adds them. Calls
   * in the same tick share one read; an id asked for once is not asked again. A no-op in the demo.
   */
  wantCustomers: (tenantId: string, ids: readonly string[]) => void
  /** API mode: ids a read found no customer for. */
  missingCustomers: ReadonlySet<string>
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
      mergeRows: () => undefined,
      wantCustomers: () => undefined,
      missingCustomers: NONE,
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
  const [missingCustomers, setMissing] = useState<ReadonlySet<string>>(NONE)
  // Customers come one read at a time: the ids asked for, queued per brand until the tick ends.
  const asked = useRef(new Set<string>())
  const queued = useRef(new Map<string, Set<string>>())
  const timer = useRef(0)

  useEffect(() => {
    if (!token) {
      setState(emptyState())
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    setMissing(NONE)
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
      (delta) => setState((s) => applyDelta(s, heldOnly(s, delta))),
      (now) => syncClock(now),
    )
    const askedIds = asked.current
    return () => {
      cancelled = true
      close()
      askedIds.clear()
    }
  }, [token])

  const wantCustomers = useCallback((tenantId: string, ids: readonly string[]) => {
    let set = queued.current.get(tenantId)
    for (const id of ids) {
      if (!id || asked.current.has(id)) continue
      asked.current.add(id)
      if (!set) queued.current.set(tenantId, (set = new Set()))
      set.add(id)
    }
    if (!set || timer.current) return
    timer.current = window.setTimeout(() => {
      timer.current = 0
      for (const [tenant, pending] of queued.current) {
        const all = [...pending]
        for (let i = 0; i < all.length; i += CUSTOMER_BATCH) {
          const chunk = all.slice(i, i + CUSTOMER_BATCH)
          api.views
            .customers({ tenantId: tenant, ids: chunk.join(','), pageSize: CUSTOMER_BATCH })
            .then((page) => {
              setState((s) => applyDelta(s, customerRows(page.rows)))
              const found = new Set(page.rows.map((r) => r.customer.id))
              const absent = chunk.filter((id) => !found.has(id))
              if (absent.length) setMissing((m) => new Set([...m, ...absent]))
            })
            // Forget the ask so the next screen that needs the customer tries again.
            .catch(() => chunk.forEach((id) => asked.current.delete(id)))
        }
      }
      queued.current.clear()
    }, 0)
  }, [])

  // The open work in the state names customers: their names and records load right after it.
  useEffect(() => {
    if (!ready) return
    const held = new Set(state.customers.map((c) => c.id))
    const missing = new Map<string, string[]>()
    const need = (tenantId: string, id: string | null | undefined) => {
      if (!id || held.has(id) || asked.current.has(id)) return
      missing.set(tenantId, [...(missing.get(tenantId) ?? []), id])
    }
    for (const o of state.orders) need(o.tenantId, o.customerId)
    for (const r of state.returns) need(r.tenantId, r.customerId)
    for (const t of state.tickets) need(t.tenantId, t.customerId)
    for (const l of state.leads) need(l.tenantId, l.customerId)
    for (const [tenantId, ids] of missing) wantCustomers(tenantId, ids)
  }, [ready, state.customers, state.orders, state.returns, state.tickets, state.leads, wantCustomers])

  const mergeRows = useCallback(
    (rows: Delta['upserts']) => setState((s) => applyDelta(s, { upserts: rows, removes: {} } as Delta)),
    [],
  )

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
    () => ({
      state,
      send,
      commit,
      storageError: false,
      ready,
      mergeUser,
      mergeRows,
      wantCustomers,
      missingCustomers,
    }),
    [state, send, commit, ready, mergeUser, mergeRows, wantCustomers, missingCustomers],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

const NONE: ReadonlySet<string> = new Set()

/**
 * Most customer ids one read asks for. The server takes 500, but the ids travel in the URL, and
 * nginx refuses a request line over 8 KB by default.
 */
const CUSTOMER_BATCH = 200

/** Customer rows read from GET /views/customers, as a delta that adds them and their metrics. */
export function customerRows(rows: readonly CustomerRow[]): Delta {
  return {
    upserts: {
      customers: rows.map((r) => r.customer),
      customerMetrics: rows.flatMap((r) => (r.metrics ? [r.metrics] : [])),
    },
    removes: {},
  } as Delta
}

/**
 * The state holds some customers, not every one, so the stream only refreshes those it holds and
 * their metrics. A customer it does not hold loads when a screen or an open order needs them.
 */
function heldOnly(state: AppState, delta: Delta): Delta {
  const { customers, customerMetrics } = delta.upserts ?? {}
  if (!customers?.length && !customerMetrics?.length) return delta
  const held = new Set(state.customers.map((c) => c.id))
  return {
    ...delta,
    upserts: {
      ...delta.upserts,
      customers: customers?.filter((c) => held.has((c as Customer).id)) ?? [],
      customerMetrics: customerMetrics?.filter((m) => held.has((m as CustomerMetricsRow).customerId)) ?? [],
    },
  }
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
