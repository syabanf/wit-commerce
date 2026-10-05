import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** Search params plus an updater that edits them in place and replaces the history entry. */
export function useReplaceParams() {
  const [params, setParams] = useSearchParams()
  const update = useCallback(
    (edit: (next: URLSearchParams) => void) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          edit(next)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  return [params, update] as const
}
