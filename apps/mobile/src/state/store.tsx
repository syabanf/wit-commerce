import {
  type AppState,
  type Envelope,
  loadLocalState,
  nowIso,
  reduce,
  saveLocalState,
  seedState,
} from '@rc/fixtures'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react'

const STATE_KEY = 'rc.mobile.state.v1'

/** Store actions plus the one app-level message, resetting the demo to the seed. */
type Message = Envelope | { reset: true }

const reduceMessage = (state: AppState, message: Message): AppState =>
  'reset' in message ? seedState() : reduce(state, message)

interface StoreValue {
  state: AppState
  send: (envelope: Envelope) => void
  reset: () => void
  /** True when the browser refused the last save, so changes live only until a reload. */
  storageError: boolean
}

const StoreContext = createContext<StoreValue | null>(null)

/** Holds the Commerce OS dataset in one reducer and keeps demo changes on this phone across reloads. */
export function AppStateProvider({ children }: { children: ReactNode }) {
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
    () => ({ state, send: dispatch, reset: () => dispatch({ reset: true }), storageError }),
    [state, storageError],
  )
  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside AppStateProvider')
  return ctx
}
