import { ApiError, type PlatformHoliday } from '@rc/api'
import { PUBLIC_HOLIDAYS } from '@rc/fixtures'
import { useCallback, useEffect, useState } from 'react'
import { HTTP, api } from './api'

const BUILT_IN: PlatformHoliday[] = PUBLIC_HOLIDAYS.map((h) => ({ ...h, updatedBy: null, updatedAt: null }))

/**
 * The platform's public holidays: from the API when one is configured, else the built-in list the
 * demo reducer counts. set replaces the list with a server answer.
 */
export function usePublicHolidays() {
  const [holidays, set] = useState<PlatformHoliday[] | null>(HTTP ? null : BUILT_IN)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    if (!HTTP) return
    setError(null)
    api.holidays
      .list()
      .then((r) => set(r.holidays))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'The server did not answer.'))
  }, [])
  useEffect(load, [load])
  return { holidays, set, error, load }
}
