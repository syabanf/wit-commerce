import { useEffect } from 'react'
import { setMeta } from './useSeo'

/** Sets the browser tab title for the current page, and the title links shared from it show. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title
    setMeta('og:title', title)
  }, [title])
}
