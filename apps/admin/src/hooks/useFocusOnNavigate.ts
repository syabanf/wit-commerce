// apps/admin/src/hooks/useFocusOnNavigate.ts
import { useEffect } from 'react'
import { useLocation } from 'react-router'

/**
 * Moves focus to the main container or the first heading after a route change.
 * Improves keyboard/assistive‑technology navigation.
 */
export function useFocusOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => {
    const timer = setTimeout(() => {
      const main = document.getElementById('main')
      const heading = main?.querySelector<HTMLElement>('h1, h2')
      // Headings are not focusable by default; -1 lets focus land without adding a tab stop.
      if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1
      ;(heading ?? main)?.focus({ preventScroll: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [pathname])
}
