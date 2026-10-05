import { type AppState, type Envelope, loadLocalState, nowIso, reduce, saveLocalState } from '@rc/fixtures'
import {
  type Dispatch,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'

const StoreContext = createContext<{
  state: AppState
  send: Dispatch<Envelope>
  storageError: boolean
} | null>(null)

export const STATE_KEY = 'rc.admin.state.v1'

/** Holds the Commerce OS dataset in one reducer and keeps demo changes across reloads. */
export function AppStateProvider({ children }: { children: ReactNode }) {
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
  const value = useMemo(() => ({ state, send, storageError }), [state, storageError])
  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
