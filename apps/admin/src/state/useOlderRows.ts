import { ApiError } from '@rc/api'
import { toast } from '@rc/ui'
import { useState } from 'react'
import { HTTP, api } from '../lib/api'
import { useScoped } from './scoped'
import { useStore } from './store'

/** How many rows of each log the API's state carries per brand (historyInState in views_history.go). */
const IN_STATE = 200

type Log = 'stockMoves' | 'modifierStockMoves' | 'integrationLogs'

/**
 * Older rows of a log. With the API the state carries the newest rows of each brand only; `load`
 * reads the page before the oldest row held and adds it to the state, where the screen's own search
 * and filters see it. `more` is false in the demo, which holds every row, and once nothing is left.
 */
export function useOlderRows(collection: Log, rows: readonly { at: string; id: string }[]) {
  const { tenantId } = useScoped()
  const { mergeRows } = useStore()
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const load = () => {
    // The last row in the server's order: the oldest time, and the lowest id within it.
    const oldest = rows.reduce<{ at: string; id: string } | undefined>(
      (last, r) => (!last || r.at < last.at || (r.at === last.at && r.id < last.id) ? r : last),
      undefined,
    )
    setStatus('loading')
    api.views
      .history(collection, tenantId, oldest && { at: oldest.at, id: oldest.id })
      .then((page) => {
        mergeRows({ [collection]: page.rows })
        setStatus(page.more ? 'idle' : 'done')
      })
      .catch((err: unknown) => {
        setStatus('idle')
        toast('Older rows did not load', {
          tone: 'danger',
          description: err instanceof ApiError ? err.message : 'The server did not answer.',
        })
      })
  }
  return { more: HTTP && status !== 'done' && rows.length >= IN_STATE, loading: status === 'loading', load }
}
